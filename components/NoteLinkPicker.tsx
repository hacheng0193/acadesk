"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { linkNote, unlinkNote } from "@/app/actions/notes";
import type { LinkedNote } from "@/lib/types";
import { Button, cx, inputClass } from "./ui";

/** Linked-notes list with a search box that attaches an existing vault note. */
export function NoteLinkPicker({
  entityType,
  entityId,
  linked,
}: {
  entityType: string;
  entityId: number;
  linked: LinkedNote[];
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ rel: string; title: string }[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/notes/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setOptions(data.results ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [query]);

  const linkedPaths = new Set(linked.map((n) => n.rel_path));

  return (
    <div>
      {linked.length ? (
        <ul className="mb-2 space-y-1.5 text-sm">
          {linked.map((n) => (
            <li key={n.id} className="group flex items-center gap-2">
              <span className="text-dim">✎</span>
              <Link
                href={`/notes/${n.rel_path.split("/").map(encodeURIComponent).join("/")}`}
                className="flex-1 truncate hover:underline"
              >
                {n.title}
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => void unlinkNote(n.rel_path, entityType, entityId))}
                className="text-xs text-dim opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-dim">尚未連結任何筆記</p>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋 vault 筆記以連結…"
        className={cx(inputClass, "text-xs")}
      />
      {options.length ? (
        <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
          {options.map((o) => (
            <li key={o.rel}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                disabled={pending || linkedPaths.has(o.rel)}
                onClick={() =>
                  startTransition(async () => {
                    await linkNote(o.rel, entityType, entityId);
                    setQuery("");
                  })
                }
              >
                <span className="truncate">{o.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-dim">
                  {linkedPaths.has(o.rel) ? "已連結" : o.rel.split("/").slice(0, -1).join("/")}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
