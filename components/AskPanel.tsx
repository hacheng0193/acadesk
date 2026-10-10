"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { setAgentModel } from "@/app/actions/papers";
import type { PaperChat } from "@/lib/queries/papers";
import type { ChatMessage, ChatProvider } from "@/lib/types";
import { Markdown } from "./Markdown";
import { cx, inputClass } from "./ui";

export type AskPanelHandle = {
  /** Attach a passage from the paper to the next question. */
  quote: (text: string, page?: number) => void;
};

const PROVIDERS: { key: ChatProvider; label: string }[] = [
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
];

const SUGGESTIONS = ["用三點總結這篇論文的主要貢獻", "這篇的方法和實驗設定是什麼？", "這篇有哪些限制或可以延伸的方向？"];

/** `p.12` / `p. 12` in an answer becomes a link that scrolls the PDF there. */
function linkPages(text: string): string {
  return text.replace(/(?<![\w/[])p\.\s?(\d{1,4})(?![\w\]])/g, "[p.$1](#page-$1)");
}

/**
 * Chat about the paper with a local agent (Claude Code or Codex). Each turn
 * resumes the CLI's own session, so follow-up questions keep their context.
 */
export function AskPanel({
  paperId,
  hasPdf,
  chats: initialChats,
  models: initialModels,
  goTo,
  insertIntoNotes,
  ref,
}: {
  paperId: number;
  hasPdf: boolean;
  chats: PaperChat[];
  models: Record<ChatProvider, string>;
  goTo: (page: number) => void;
  insertIntoNotes: (text: string) => void;
  ref?: Ref<AskPanelHandle>;
}) {
  const [chats, setChats] = useState(initialChats);
  const [chatId, setChatId] = useState<number | null>(initialChats[0]?.id ?? null);
  const [provider, setProvider] = useState<ChatProvider>(initialChats[0]?.provider ?? "claude");
  const [messages, setMessages] = useState<ChatMessage[]>(initialChats[0]?.messages ?? []);
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<{ text: string; page?: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState(initialModels);
  const [showSettings, setShowSettings] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    quote(text, page) {
      setSelection({ text, page });
      box.current?.focus();
    },
  }));

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const newChat = (p = provider) => {
    abort.current?.abort();
    setChatId(null);
    setProvider(p);
    setMessages([]);
  };

  const openChat = (id: number) => {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    abort.current?.abort();
    setChatId(c.id);
    setProvider(c.provider);
    setMessages(c.messages);
  };

  const send = async (question = input) => {
    const q = question.trim();
    if (!q || running) return;
    const quoted = selection ? `${selection.text}${selection.page ? `（p.${selection.page}）` : ""}` : "";
    const before = messages;
    const turn: ChatMessage[] = [
      { role: "user", text: q, ...(quoted ? { selection: quoted } : {}) },
      { role: "assistant", text: "" },
    ];
    setMessages([...before, ...turn]);
    setInput("");
    setSelection(null);
    setRunning(true);

    const controller = new AbortController();
    abort.current = controller;
    let answer = "";
    let error = "";
    let id = chatId;
    const update = () =>
      setMessages([
        ...before,
        turn[0],
        { role: "assistant", text: answer || error, ...(error && !answer ? { error: true } : {}) },
      ]);

    try {
      const res = await fetch(`/api/papers/${paperId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, question: q, selection: quoted, chatId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; id?: number; text?: string; message?: string };
          if (ev.type === "chat" && ev.id) {
            id = ev.id;
            setChatId(ev.id);
          } else if (ev.type === "delta" && ev.text) {
            answer += ev.text;
            update();
          } else if (ev.type === "error" && ev.message) {
            error = ev.message;
            update();
          }
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        error = (e as Error).message || "連線失敗";
        update();
      } else {
        answer = answer ? `${answer}\n\n（已停止）` : "（已停止）";
        update();
      }
    } finally {
      setRunning(false);
      abort.current = null;
    }

    // Keep the chat list in step without reloading the page.
    if (id) {
      const final: ChatMessage[] = [
        ...before,
        turn[0],
        { role: "assistant", text: answer || error || "（沒有回應）", ...(!answer ? { error: true } : {}) },
      ];
      setChats((all) => [
        { id: id!, provider, messages: final, updated_at: new Date().toISOString() },
        ...all.filter((c) => c.id !== id),
      ]);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-[11px]">
        <div className="flex rounded-md bg-surface-2 p-0.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={running}
              onClick={() => (p.key !== provider ? newChat(p.key) : undefined)}
              className={cx(
                "rounded px-2 py-0.5 transition-colors",
                provider === p.key ? "bg-surface text-ink shadow-sm" : "text-dim hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {chats.length ? (
          <select
            value={chatId ?? ""}
            disabled={running}
            onChange={(e) => (e.target.value ? openChat(Number(e.target.value)) : newChat())}
            className="min-w-0 flex-1 truncate rounded border-0 bg-transparent text-dim outline-none hover:text-ink"
          >
            <option value="">新對話</option>
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.provider === "claude" ? "Claude" : "Codex"}：{c.messages[0]?.text.slice(0, 30) || "（空）"}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1" />
        )}
        <button type="button" className="text-dim hover:text-ink" disabled={running} onClick={() => newChat()}>
          ＋ 新對話
        </button>
        <button
          type="button"
          className={cx("text-dim hover:text-ink", showSettings && "text-ink")}
          onClick={() => setShowSettings(!showSettings)}
          title="模型設定"
        >
          ⚙
        </button>
      </div>

      {showSettings ? (
        <div className="space-y-2 border-b border-line bg-surface-2/60 px-3 py-2 text-[11px] text-dim">
          <p>留空就用 CLI 自己的預設模型（~/.claude、~/.codex/config.toml）。</p>
          {PROVIDERS.map((p) => (
            <label key={p.key} className="flex items-center gap-2">
              <span className="w-20 shrink-0">{p.label}</span>
              <input
                value={models[p.key]}
                onChange={(e) => setModels({ ...models, [p.key]: e.target.value })}
                onBlur={(e) => void setAgentModel(p.key, e.target.value)}
                placeholder={p.key === "claude" ? "例如 opus、sonnet" : "例如 gpt-5.5"}
                className={cx(inputClass, "h-7 text-xs")}
              />
            </label>
          ))}
        </div>
      ) : null}

      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          const m = a?.getAttribute("href")?.match(/^#page-(\d+)$/);
          if (m) {
            e.preventDefault();
            goTo(Number(m[1]));
          }
        }}
      >
        {messages.length === 0 ? (
          <div className="space-y-3 px-2 pt-8 text-center">
            <p className="text-sm text-dim">
              用本機的 {provider === "claude" ? "Claude Code" : "Codex"} 問這篇論文的問題。
              {hasPdf ? "" : "（還沒有 PDF，只能根據標題回答。）"}
            </p>
            <div className="flex flex-col items-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-line px-3 py-1 text-xs text-dim hover:border-[var(--accent)] hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-8 space-y-1">
                {m.selection ? (
                  <p className="line-clamp-3 border-l-2 border-line pl-2 text-[11px] text-dim">{m.selection}</p>
                ) : null}
                <p className="whitespace-pre-wrap rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="group">
                {m.error ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{m.text}</p>
                ) : m.text ? (
                  <Markdown className="text-[13px]">{linkPages(m.text)}</Markdown>
                ) : (
                  <p className="animate-pulse text-xs text-dim">思考中…（第一次會先讀論文全文，可能要一點時間）</p>
                )}
                {m.text && !m.error && !(running && i === messages.length - 1) ? (
                  <div className="mt-1 hidden gap-3 text-[11px] text-dim group-hover:flex">
                    <button
                      type="button"
                      className="hover:text-ink"
                      onClick={() => {
                        const q = messages[i - 1];
                        insertIntoNotes(`**Q：${q?.text ?? ""}**\n\n${m.text}`);
                      }}
                    >
                      存到筆記
                    </button>
                    <button type="button" className="hover:text-ink" onClick={() => void navigator.clipboard?.writeText(m.text)}>
                      複製
                    </button>
                  </div>
                ) : null}
              </div>
            ),
          )
        )}
      </div>

      <div className="border-t border-line p-2">
        {selection ? (
          <div className="mb-1.5 flex items-start gap-2 rounded-md bg-surface-2 px-2 py-1.5 text-[11px] text-dim">
            <p className="line-clamp-3 flex-1">
              {selection.page ? <span className="mr-1 text-ink">p.{selection.page}</span> : null}
              {selection.text}
            </p>
            <button type="button" className="hover:text-ink" onClick={() => setSelection(null)} aria-label="移除引用">
              ×
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={box}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={selection ? "針對這段想問什麼？" : "問這篇論文…（Enter 送出，Shift+Enter 換行）"}
            className={cx(inputClass, "min-h-[2.5rem] flex-1 resize-none py-1.5 text-xs")}
          />
          {running ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="h-8 shrink-0 rounded-lg bg-surface-2 px-3 text-xs text-ink hover:bg-line"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              disabled={!input.trim()}
              onClick={() => void send()}
              className="h-8 shrink-0 rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-white disabled:opacity-40"
            >
              送出
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
