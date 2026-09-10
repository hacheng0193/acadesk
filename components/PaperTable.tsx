"use client";

import { useState } from "react";
import { splitList, type PaperRow, type Project } from "@/lib/types";
import { PaperForm } from "./PaperForm";
import { Markdown } from "./Markdown";
import { Badge, cx, inputClass } from "./ui";

const STATUS = {
  to_read: { label: "待讀", tone: "neutral" },
  reading: { label: "閱讀中", tone: "accent" },
  read: { label: "已讀", tone: "ok" },
} as const;

export function PaperTable({
  papers,
  projects,
  sizes,
}: {
  papers: PaperRow[];
  projects: Project[];
  sizes: Record<number, number | null>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const allTags = [...new Set(papers.flatMap((p) => splitList(p.tags)))].sort();

  const rows = papers.filter((p) => {
    if (status && p.status !== status) return false;
    if (tag && !splitList(p.tags).includes(tag)) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.authors.toLowerCase().includes(q) ||
      p.notes_md.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋標題、作者、筆記…"
          className={cx(inputClass, "max-w-xs text-xs")}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={cx(inputClass, "w-28 text-xs")}>
          <option value="">全部狀態</option>
          <option value="to_read">待讀</option>
          <option value="reading">閱讀中</option>
          <option value="read">已讀</option>
        </select>
        {allTags.length ? (
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={cx(inputClass, "w-32 text-xs")}>
            <option value="">全部標籤</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-dim">{rows.length} 篇</span>
      </div>

      <div className="divide-y divide-[var(--border)] rounded-xl border border-line bg-surface">
        {rows.map((p) => (
          <div key={p.id}>
            <div className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="mt-0.5 w-4 shrink-0 text-xs text-dim"
                aria-label="展開筆記"
              >
                {expanded === p.id ? "▾" : "▸"}
              </button>
              <div className="min-w-0 flex-1">
                <PaperForm
                  paper={p}
                  projects={projects}
                  fileSize={sizes[p.id]}
                  trigger={
                    <span className="cursor-pointer text-sm font-medium hover:underline">{p.title}</span>
                  }
                />
                <div className="mt-0.5 truncate text-xs text-dim">
                  {[p.authors, p.venue, p.year].filter(Boolean).join("　·　")}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  {splitList(p.tags).map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                  {splitList(p.projects).map((t) => (
                    <Badge key={t} tone="accent">
                      ✦ {t}
                    </Badge>
                  ))}
                  {p.rating ? <Badge tone="warn">{"★".repeat(p.rating)}</Badge> : null}
                </div>
              </div>
              {p.file_path ? (
                sizes[p.id] === null ? (
                  <span className="shrink-0 text-xs text-danger" title="附檔不見了">
                    📄 遺失
                  </span>
                ) : (
                  <a
                    href={`/api/papers/${p.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-[var(--accent)] hover:underline"
                    title="開啟 PDF"
                  >
                    📄 PDF
                  </a>
                )
              ) : null}
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-dim hover:text-ink"
                >
                  原文 ↗
                </a>
              ) : null}
            </div>
            {expanded === p.id ? (
              <div className="border-t border-line bg-surface-2/50 px-4 py-3 pl-11">
                {p.notes_md ? <Markdown>{p.notes_md}</Markdown> : <p className="text-xs text-dim">還沒有筆記</p>}
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-dim">沒有符合的論文</p>
        ) : null}
      </div>
    </>
  );
}
