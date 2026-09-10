"use client";

import { useEffect, useState } from "react";
import { SEARCH_KIND_LABEL as KIND_LABEL, type SearchHit, type SearchKind } from "@/lib/types";
import { Badge, cx } from "./ui";

const ORDER: SearchKind[] = ["item", "log", "note", "paper", "project"];

/** Search half of the command palette: type to find, Enter to open the first hit. */
export function SearchResults({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate: (href: string) => void;
}) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => setHits(d.results ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      controller.abort();
      clearTimeout(id);
      setLoading(false);
    };
  }, [query]);

  if (!query.trim()) return null;

  if (!hits.length) {
    return (
      <p className="px-1 py-6 text-center text-xs text-dim">
        {loading ? "搜尋中…" : `找不到「${query.trim()}」`}
      </p>
    );
  }

  const grouped = ORDER.map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) })).filter(
    (g) => g.items.length,
  );

  return (
    <div className="max-h-[50vh] space-y-3 overflow-y-auto">
      {grouped.map(({ kind, items }) => (
        <div key={kind}>
          <div className="mb-1 px-1 text-[11px] font-medium text-dim">
            {KIND_LABEL[kind]}
            <span className="ml-1 tabular-nums">{items.length}</span>
          </div>
          <ul className="space-y-0.5">
            {items.map((hit, i) => (
              <li key={`${hit.kind}-${hit.refKey}-${i}`}>
                <button
                  type="button"
                  onClick={() => onNavigate(hit.href)}
                  className={cx(
                    "w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{hit.title}</span>
                    <Badge>{KIND_LABEL[hit.kind]}</Badge>
                  </div>
                  {hit.snippet ? (
                    <div className="mt-0.5 truncate text-[11px] text-dim">{hit.snippet}</div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
