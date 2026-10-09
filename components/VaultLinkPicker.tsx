"use client";

import { useEffect, useState } from "react";
import type { LookupHit } from "@/lib/types";
import { Button, cx, inputClass } from "./ui";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

function icon(hit: LookupHit): string {
  if (hit.kind === "note") return "✎";
  return IMAGE_EXT.test(hit.rel) ? "🖼" : "📎";
}

/**
 * Search the vault by name or by content and hand back an Obsidian link for
 * whatever is picked. Notes come back as `[[note]]`, images as `![[img.png]]`,
 * anything else as `[[file.pdf]]` - the same text Obsidian itself would write.
 */
export function VaultLinkPicker({
  onInsert,
  onClose,
}: {
  onInsert: (link: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    // Content search spawns Spotlight; wait for a pause in typing first.
    const id = setTimeout(() => {
      fetch(`/api/vault/lookup?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          setHits(d.results ?? []);
          setActive(0);
          setLoading(false);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="mb-3 rounded-lg border border-line bg-surface p-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (!hits.length) {
              return;
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = hits.length;
              setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
            } else if (e.key === "Enter") {
              e.preventDefault();
              onInsert(hits[active].link);
            }
          }}
          placeholder="搜尋 vault 裡的筆記、附件（檔名或內文）"
          className={cx(inputClass, "flex-1 text-xs")}
        />
        <span className="w-12 shrink-0 text-right text-[11px] text-dim">
          {loading ? "搜尋中…" : query.trim() ? `${hits.length} 筆` : ""}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          取消
        </Button>
      </div>

      {hits.length ? (
        <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
          {hits.map((h, i) => (
            <li key={h.rel}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => onInsert(h.link)}
                className={cx(
                  "w-full rounded-md px-2 py-1 text-left text-xs",
                  i === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-dim">{icon(h)}</span>
                  <span className="truncate">{h.title}</span>
                  {h.match === "content" ? (
                    <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] text-dim">內文符合</span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-[10px] text-dim">
                    {h.rel.split("/").slice(0, -1).join("/")}
                  </span>
                </span>
                {h.snippet ? (
                  <span className="mt-0.5 block truncate pl-6 text-[11px] text-dim">{h.snippet}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim() && !loading ? (
        <p className="mt-2 px-2 text-xs text-dim">找不到符合的筆記或檔案</p>
      ) : null}
    </div>
  );
}
