"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cx, inputClass } from "./ui";

export type NoteItem = { rel: string; title: string; mtime: number; size: number };

function folderOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

export function NoteTree({ notes }: { notes: NoteItem[] }) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) counts.set(folderOf(n.rel), (counts.get(folderOf(n.rel)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const filtered = notes.filter((n) => {
    if (folder !== null && folderOf(n.rel) !== folder) return false;
    if (!query.trim()) return true;
    return n.rel.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋筆記…"
          className={cx(inputClass, "mb-3 text-xs")}
        />
        <div className="space-y-0.5">
          <FolderRow
            label="全部"
            count={notes.length}
            active={folder === null}
            onClick={() => setFolder(null)}
          />
          {folders.map(([name, count]) => (
            <FolderRow
              key={name}
              label={name || "（根目錄）"}
              count={count}
              active={folder === name}
              onClick={() => setFolder(name)}
            />
          ))}
        </div>
      </div>

      <div className="divide-y divide-[var(--border)] rounded-xl border border-line bg-surface">
        {filtered.map((n) => (
          <Link
            key={n.rel}
            href={`/notes/${n.rel.split("/").map(encodeURIComponent).join("/")}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2"
          >
            <span className="text-dim">✎</span>
            <span className="flex-1 truncate">{n.title}</span>
            <span className="hidden shrink-0 truncate text-xs text-dim sm:block">
              {folderOf(n.rel) || "／"}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-dim">
              {new Date(n.mtime).toISOString().slice(0, 10)}
            </span>
          </Link>
        ))}
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-dim">沒有符合的筆記</p>
        ) : null}
      </div>
    </div>
  );
}

function FolderRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
        active ? "bg-accent-soft font-medium text-[var(--accent)]" : "text-dim hover:bg-surface-2",
      )}
    >
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
