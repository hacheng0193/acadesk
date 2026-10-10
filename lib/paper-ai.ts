import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getSetting } from "./db";
import { resolveInLibrary } from "./papers-library";
import type { ChatProvider, Paper } from "./types";

/**
 * "Ask about this paper" runs a local coding agent - Claude Code or Codex - on
 * the user's own subscription. The agent gets the paper as plain text in a
 * scratch folder and read-only tools, nothing else of the machine.
 */

/** Where extracted paper text lives; also the agents' working directory. */
export function aiWorkDir(): string {
  const dir = path.join(process.cwd(), "data", "paper-ai");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * The paper's text with `--- p.N ---` markers, extracted once and cached next
 * to the agent. Re-extracted when the PDF is newer than the cache.
 */
export async function paperTextFile(paper: Paper): Promise<string> {
  const pdf = resolveInLibrary(paper.file_path);
  const out = path.join(aiWorkDir(), `paper-${paper.id}.txt`);
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(pdf).mtimeMs) return out;

  // Loaded by Node at run time rather than bundled: the bundled copy would also
  // need its worker file resolved, which only works in the browser build.
  const pdfjs = (await import(
    /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs" as string
  )) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdf)),
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      pages.push(`--- p.${n} ---\n${text.replace(/[ \t]+\n/g, "\n").trim()}`);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  fs.writeFileSync(out, `${paper.title}\n\n${pages.join("\n\n")}\n`, "utf8");
  return out;
}

const INSTRUCTIONS = `你是協助研究生閱讀學術論文的助教。
- 論文全文（純文字，以 "--- p.N ---" 標記頁碼）在工作目錄的檔案中，回答前先讀相關段落，不要憑印象。
- 用繁體中文回答，專有名詞保留英文。
- 引用論文內容時標註頁碼，格式為 (p.N)。
- 簡潔、有結構；適合時用 Markdown 條列或公式（$...$）。`;

export function buildPrompt(opts: {
  paper: Paper;
  textFile: string | null;
  question: string;
  selection?: string;
  notes?: string;
  firstTurn: boolean;
}): string {
  const parts: string[] = [];
  if (opts.firstTurn) {
    parts.push(INSTRUCTIONS);
    const meta = [
      `標題：${opts.paper.title}`,
      opts.paper.authors && `作者：${opts.paper.authors}`,
      opts.paper.venue && `發表處：${opts.paper.venue}`,
      opts.paper.year && `年份：${opts.paper.year}`,
    ].filter(Boolean);
    parts.push(`## 論文\n${meta.join("\n")}`);
    parts.push(
      opts.textFile
        ? `全文檔案：${path.basename(opts.textFile)}（在目前的工作目錄）`
        : "（這篇論文沒有附 PDF，只能根據標題與一般知識回答，並說明這一點。）",
    );
    if (opts.notes?.trim()) parts.push(`## 使用者目前的筆記\n${opts.notes.trim().slice(0, 4000)}`);
  }
  if (opts.selection?.trim()) parts.push(`## 使用者選取的段落\n> ${opts.selection.trim().replace(/\n/g, "\n> ")}`);
  parts.push(`## 問題\n${opts.question.trim()}`);
  return parts.join("\n\n");
}

export type AgentEvent =
  | { type: "session"; id: string }
  | { type: "delta"; text: string }
  | { type: "text"; text: string }
  | { type: "error"; message: string };

/** Model override from settings; empty means the CLI's own default. */
export function agentModel(provider: ChatProvider): string {
  return getSetting(`paper_ai_${provider}_model`) ?? "";
}

function args(provider: ChatProvider, prompt: string, sessionId: string | null): string[] {
  const model = agentModel(provider);
  if (provider === "claude") {
    return [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      // Read is the only tool, confined to the working directory; --tools also
      // skips the user's settings files, so their hooks and plugins stay out.
      "--tools",
      "Read",
      "--allowedTools",
      "Read",
      "--strict-mcp-config",
      ...(model ? ["--model", model] : []),
      ...(sessionId ? ["--resume", sessionId] : []),
    ];
  }
  const common = [
    "--json",
    "--skip-git-repo-check",
    "-c",
    'sandbox_mode="read-only"',
    ...(model ? ["-m", model] : []),
  ];
  return sessionId ? ["exec", "resume", ...common, sessionId, prompt] : ["exec", ...common, prompt];
}

/**
 * Run one turn and yield what the agent says. Uses an argument array (no
 * shell), stdin closed, and is killed when `signal` aborts.
 */
export async function* runAgent(
  provider: ChatProvider,
  prompt: string,
  sessionId: string | null,
  signal: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const bin = provider === "claude" ? "claude" : "codex";
  const child = spawn(bin, args(provider, prompt, sessionId), {
    cwd: aiWorkDir(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin:${process.env.HOME}/.local/bin` },
  });
  const kill = () => child.kill("SIGTERM");
  signal.addEventListener("abort", kill);

  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  const exited = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.on("error", (error) => resolve({ code: null, error }));
    child.on("close", (code) => resolve({ code }));
  });

  let buffer = "";
  let said = false;
  try {
    for await (const chunk of child.stdout) {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        for (const out of provider === "claude" ? fromClaude(ev) : fromCodex(ev)) {
          if (out.type === "delta" || out.type === "text") said = true;
          yield out;
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", kill);
  }

  const { code, error } = await exited;
  if (signal.aborted) return;
  if (error) {
    yield {
      type: "error",
      message:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? `找不到 ${bin} 指令。請先安裝並登入 ${provider === "claude" ? "Claude Code" : "Codex"} CLI。`
          : error.message,
    };
  } else if (code !== 0 && !said) {
    const lastLine = stderr.trim().split("\n").filter((l) => !/^\d{4}-\d\d-\d\dT.* (ERROR|WARN)/.test(l)).pop();
    yield { type: "error", message: lastLine || stderr.trim().split("\n").pop() || `${bin} 結束碼 ${code}` };
  }
}

function fromClaude(ev: Record<string, unknown>): AgentEvent[] {
  if (ev.type === "system" && ev.subtype === "init" && typeof ev.session_id === "string") {
    return [{ type: "session", id: ev.session_id }];
  }
  if (ev.type === "stream_event") {
    const e = ev.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
      return [{ type: "delta", text: e.delta.text }];
    }
    // A new text block after tool use: keep the paragraphs apart.
    if (e?.type === "content_block_start") return [{ type: "delta", text: "" }];
  }
  if (ev.type === "result" && ev.is_error) {
    return [{ type: "error", message: String(ev.result ?? "Claude Code 回報錯誤") }];
  }
  return [];
}

function fromCodex(ev: Record<string, unknown>): AgentEvent[] {
  if (ev.type === "thread.started" && typeof ev.thread_id === "string") {
    return [{ type: "session", id: ev.thread_id }];
  }
  if (ev.type === "item.completed") {
    const item = ev.item as { type?: string; text?: string } | undefined;
    if (item?.type === "agent_message" && item.text) return [{ type: "text", text: item.text }];
  }
  if (ev.type === "turn.failed" || ev.type === "error") {
    const raw =
      ev.type === "error"
        ? String(ev.message ?? "")
        : String((ev.error as { message?: string } | undefined)?.message ?? "");
    // Codex nests the API error as a JSON string.
    let message = raw;
    try {
      message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message || raw;
    } catch {
      // Plain text already.
    }
    return [{ type: "error", message: message || "Codex 執行失敗" }];
  }
  return [];
}
