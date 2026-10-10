import { db } from "@/lib/db";
import { buildPrompt, paperTextFile, runAgent } from "@/lib/paper-ai";
import { paperNoteBody } from "@/lib/paper-notes";
import { getPaper } from "@/lib/queries/papers";
import type { ChatMessage, ChatProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = { provider?: string; question?: string; selection?: string; chatId?: number | null };

/**
 * One turn of a conversation about a paper. Streams newline-delimited JSON:
 * {type:"chat",id} first, then {type:"delta",text}... and {type:"error",message},
 * ending with {type:"done"}. The turn is saved when the agent finishes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const paperId = Number((await params).id);
  const paper = getPaper(paperId);
  if (!paper) return Response.json({ error: "找不到這篇論文" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const provider: ChatProvider = body.provider === "codex" ? "codex" : "claude";
  const question = (body.question ?? "").trim();
  const selection = (body.selection ?? "").trim().slice(0, 8000);
  if (!question) return Response.json({ error: "請輸入問題" }, { status: 400 });

  let chat = body.chatId
    ? (db
        .prepare("SELECT id, session_id, messages_json FROM paper_chats WHERE id = ? AND paper_id = ? AND provider = ?")
        .get(body.chatId, paperId, provider) as
        | { id: number; session_id: string | null; messages_json: string }
        | undefined)
    : undefined;
  if (!chat) {
    const id = Number(
      db.prepare("INSERT INTO paper_chats (paper_id, provider) VALUES (?, ?)").run(paperId, provider).lastInsertRowid,
    );
    chat = { id, session_id: null, messages_json: "[]" };
  }
  const chatId = chat.id;
  const sessionId = chat.session_id;
  const history = JSON.parse(chat.messages_json) as ChatMessage[];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "chat", id: chatId });

      let answer = "";
      let error = "";
      let newSession = sessionId;
      try {
        let textFile: string | null = null;
        if (paper.file_path) {
          try {
            textFile = await paperTextFile(paper);
          } catch (e) {
            send({ type: "status", text: `無法擷取 PDF 文字：${(e as Error).message}` });
          }
        }
        const prompt = buildPrompt({
          paper,
          textFile,
          question,
          selection,
          notes: sessionId ? "" : paperNoteBody(paper.note_path),
          firstTurn: !sessionId,
        });
        for await (const ev of runAgent(provider, prompt, sessionId, request.signal)) {
          if (ev.type === "session") newSession = ev.id;
          else if (ev.type === "delta") {
            // An empty delta marks a new text block; separate it from the last.
            const text = ev.text || (answer && !answer.endsWith("\n\n") ? "\n\n" : "");
            if (text) {
              answer += text;
              send({ type: "delta", text });
            }
          } else if (ev.type === "text") {
            const text = (answer ? "\n\n" : "") + ev.text;
            answer += text;
            send({ type: "delta", text });
          } else if (!error) {
            error = ev.message;
            send({ type: "error", message: ev.message });
          }
        }
      } catch (e) {
        error = (e as Error).message || "執行失敗";
        send({ type: "error", message: error });
      }

      const messages: ChatMessage[] = [
        ...history,
        { role: "user", text: question, ...(selection ? { selection } : {}) },
        answer.trim()
          ? { role: "assistant", text: answer.trim() }
          : { role: "assistant", text: error || "（沒有回應）", error: true },
      ];
      db.prepare(
        "UPDATE paper_chats SET session_id = ?, messages_json = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(newSession, JSON.stringify(messages), chatId);
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
