"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { linkFolder, linkNote, unlinkFolder, unlinkNote } from "@/app/actions/notes";
import type { LinkedNote } from "@/lib/types";
import { countTags, hasAllTags } from "@/lib/tags";
import { TagFilter } from "./TagFilter";
import { Button, cx, inputClass } from "./ui";

function noteHref(rel: string, backTo?: { href: string; label: string }): string {
  const path = `/notes/${rel.split("/").map(encodeURIComponent).join("/")}`;
  if (!backTo) return path;
  // Tells the note page where to send the reader back to, and what to call it.
  const q = new URLSearchParams({ from: backTo.href, fromLabel: backTo.label });
  return `${path}?${q}`;
}

/**
 * Notes attached to an entity, from two sources: individual links, and whole
 * folders the entity follows. Folder-derived notes can't be removed one by one -
 * they belong to the folder, so the folder chip is where you detach them.
 */
export function NoteLinkPicker({
  entityType,
  entityId,
  linked,
  folders,
  vaultFolders,
  backTo,
}: {
  entityType: string;
  entityId: number;
  linked: LinkedNote[];
  /** Where a note opened from here should offer to return to. */
  backTo?: { href: string; label: string };
  /** Folders currently followed. */
  folders: string[];
  /** Every folder in the vault, for the picker. */
  vaultFolders: { path: string; count: number }[];
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ rel: string; title: string }[]>([]);
  const [folderChoice, setFolderChoice] = useState("");
  const [pending, startTransition] = useTransition();

  // The filter lives in the URL (?tag=a&tag=b) so it survives a reload and can be shared.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedTags = params.getAll("tag");
  const setTags = (next: string[]) => {
    const q = new URLSearchParams(params.toString());
    q.delete("tag");
    next.forEach((t) => q.append("tag", t));
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const tagCounts = useMemo(() => countTags(linked.map((n) => n.tags)), [linked]);
  const shown = selectedTags.length ? linked.filter((n) => hasAllTags(n.tags, selectedTags)) : linked;

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
  const available = vaultFolders.filter((f) => !folders.includes(f.path));

  return (
    <div>
      {folders.length ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {folders.map((f) => (
            <span
              key={f}
              className="group flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px]"
              title={`跟隨資料夾 ${f}，之後新增的筆記會自動出現`}
            >
              <span className="text-dim">📁</span>
              <span className="max-w-36 truncate">{f}</span>
              <button
                type="button"
                aria-label={`取消跟隨 ${f}`}
                disabled={pending}
                onClick={() => startTransition(() => void unlinkFolder(f, entityType, entityId))}
                className="text-dim transition-colors hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb-2">
        <TagFilter
          tags={tagCounts}
          selected={selectedTags}
          onToggle={(t) =>
            setTags(selectedTags.includes(t) ? selectedTags.filter((x) => x !== t) : [...selectedTags, t])
          }
          onClear={() => setTags([])}
        />
      </div>

      {linked.length && !shown.length ? (
        <p className="mb-2 text-xs text-dim">沒有同時符合這些 tag 的筆記</p>
      ) : null}

      {shown.length ? (
        <ul className="mb-2 space-y-1.5 text-sm">
          {shown.map((n) => (
            <li key={n.rel_path} className="group flex items-center gap-2">
              <span className="shrink-0 text-dim" title={n.via ? `來自資料夾 ${n.via}` : undefined}>
                {n.via ? "📁" : "✎"}
              </span>
              <Link href={noteHref(n.rel_path, backTo)} className="flex-1 truncate hover:underline">
                {n.title}
              </Link>
              {n.tags.slice(0, 3).map((t) => (
                <span key={t} className="hidden shrink-0 text-[10px] text-dim sm:inline">
                  #{t}
                </span>
              ))}
              {n.via ? null : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => void unlinkNote(n.rel_path, entityType, entityId))
                  }
                  className="text-xs text-dim opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  移除
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : linked.length ? null : (
        <p className="mb-2 text-xs text-dim">尚未連結任何筆記</p>
      )}

      {available.length ? (
        <div className="mb-2 flex gap-1.5">
          <select
            value={folderChoice}
            onChange={(e) => setFolderChoice(e.target.value)}
            className={cx(inputClass, "min-w-0 flex-1 text-xs")}
          >
            <option value="">跟隨整個資料夾…</option>
            {available.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}（{f.count}）
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!folderChoice || pending}
            onClick={() =>
              startTransition(async () => {
                await linkFolder(folderChoice, entityType, entityId);
                setFolderChoice("");
              })
            }
          >
            加入
          </Button>
        </div>
      ) : null}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="或搜尋單篇筆記…"
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
