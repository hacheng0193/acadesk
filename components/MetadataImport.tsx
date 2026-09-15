"use client";

import { useState, useTransition } from "react";
import type { PaperMeta } from "@/lib/metadata";
import { Button, cx, inputClass } from "./ui";

const SOURCE_LABEL: Record<PaperMeta["source"], string> = {
  crossref: "Crossref",
  arxiv: "arXiv",
  bibtex: "BibTeX",
  citation: "引用文字",
};

/**
 * Paste a DOI / arXiv id / BibTeX entry and fill the form from it.
 *
 * Nothing is written to the database here - the fields are filled in for the
 * user to check first, because a wrong lookup silently saved is worse than
 * typing it by hand.
 */
export function MetadataImport({ onFill }: { onFill: (meta: PaperMeta) => void }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [filled, setFilled] = useState<PaperMeta | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    const text = query.trim();
    if (!text) return;
    setError("");
    setFilled(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/metadata", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: text }),
        });
        const data = (await res.json()) as
          | { ok: true; meta: PaperMeta }
          | { ok: false; error: string };
        if (!data.ok) {
          setError(data.error);
          return;
        }
        onFill(data.meta);
        setFilled(data.meta);
      } catch {
        setError("查詢失敗，請改用手動輸入");
      }
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-1.5 text-xs font-medium text-dim">自動填入</div>
      <div className="flex gap-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter makes room for a multi-line BibTeX entry.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
          rows={query.includes("\n") ? 4 : 1}
          placeholder="貼上 DOI、arXiv 編號、BibTeX 或引用文字，按 Enter"
          className={cx(inputClass, "flex-1 resize-none py-1.5 text-xs")}
        />
        <Button type="button" size="sm" variant="primary" disabled={pending} onClick={run}>
          {pending ? "查詢中…" : "填入"}
        </Button>
      </div>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      {filled ? (
        <p className="mt-2 text-xs text-[var(--ok)]">
          已從 {SOURCE_LABEL[filled.source]} 填入，請確認下方欄位後再儲存。
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        DOI 與 arXiv 會連到外部服務查詢（送出的只有編號本身）；BibTeX 與引用文字完全在本機解析，keywords 會填進標籤。
      </p>
    </div>
  );
}
