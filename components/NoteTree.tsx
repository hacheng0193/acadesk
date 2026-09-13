"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cx, inputClass } from "./ui";

export type NoteItem = { rel: string; title: string; mtime: number; size: number };

function folderOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

type FolderNode = {
  /** Full path from the vault root; "" is the root itself. */
  path: string;
  /** Last segment only - the full path is unreadable in a 220px column. */
  name: string;
  children: FolderNode[];
  /** Notes in this folder and everything under it. */
  total: number;
  /** Notes sitting directly in this folder. */
  direct: number;
};

/** Turn a flat list of "a/b/c.md" paths into a folder tree. */
function buildTree(notes: NoteItem[]): FolderNode {
  const root: FolderNode = { path: "", name: "", children: [], total: 0, direct: 0 };

  const childByName = new Map<string, Map<string, FolderNode>>();
  const indexOf = (node: FolderNode) => {
    let map = childByName.get(node.path);
    if (!map) {
      map = new Map();
      childByName.set(node.path, map);
    }
    return map;
  };

  for (const note of notes) {
    const folder = folderOf(note.rel);
    const segments = folder ? folder.split("/") : [];

    let current = root;
    current.total += 1;
    for (const segment of segments) {
      const siblings = indexOf(current);
      let next = siblings.get(segment);
      if (!next) {
        next = {
          path: current.path ? `${current.path}/${segment}` : segment,
          name: segment,
          children: [],
          total: 0,
          direct: 0,
        };
        siblings.set(segment, next);
        current.children.push(next);
      }
      next.total += 1;
      current = next;
    }
    current.direct += 1;
  }

  const sortDeep = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortDeep);
  };
  sortDeep(root);
  return root;
}

export function NoteTree({ notes }: { notes: NoteItem[] }) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  // Collapsed to start: only the vault's top level is visible until you open something.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const root = useMemo(() => buildTree(notes), [notes]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const select = (node: FolderNode) => {
    setFolder(node.path);
    // Selecting reveals what's inside; collapsing stays the chevron's job.
    if (node.children.length) setExpanded((prev) => new Set(prev).add(node.path));
  };

  /** A folder's selection covers everything beneath it, matching its count. */
  const inSelection = (rel: string) => {
    if (folder === null) return true;
    if (folder === "") return !rel.includes("/");
    const dir = folderOf(rel);
    return dir === folder || dir.startsWith(`${folder}/`);
  };

  const needle = query.trim().toLowerCase();
  const filtered = notes.filter(
    (n) => inSelection(n.rel) && (!needle || n.rel.toLowerCase().includes(needle)),
  );

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
            depth={0}
            active={folder === null}
            onSelect={() => setFolder(null)}
          />
          {root.direct > 0 ? (
            <FolderRow
              label="（根目錄）"
              count={root.direct}
              depth={0}
              active={folder === ""}
              onSelect={() => setFolder("")}
            />
          ) : null}
          {root.children.map((child) => (
            <FolderBranch
              key={child.path}
              node={child}
              depth={0}
              selected={folder}
              expanded={expanded}
              onSelect={select}
              onToggle={toggle}
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

function FolderBranch({
  node,
  depth,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  selected: string | null;
  expanded: Set<string>;
  onSelect: (node: FolderNode) => void;
  onToggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  return (
    <>
      <FolderRow
        label={node.name}
        count={node.total}
        depth={depth}
        active={selected === node.path}
        onSelect={() => onSelect(node)}
        hasChildren={node.children.length > 0}
        open={isOpen}
        onToggle={() => onToggle(node.path)}
      />
      {isOpen
        ? node.children.map((child) => (
            <FolderBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
    </>
  );
}

function FolderRow({
  label,
  count,
  depth,
  active,
  onSelect,
  hasChildren,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  depth: number;
  active: boolean;
  onSelect: () => void;
  hasChildren?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={cx(
        "flex items-center rounded-lg transition-colors",
        active ? "bg-accent-soft" : "hover:bg-surface-2",
      )}
      style={{ paddingLeft: depth * 12 }}
    >
      {/* Separate targets: the chevron only folds, the label only selects. */}
      {hasChildren && onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `收合 ${label}` : `展開 ${label}`}
          aria-expanded={open}
          className={cx(
            "grid h-6 w-5 shrink-0 place-items-center text-[9px] transition-transform",
            active ? "text-[var(--accent)]" : "text-dim hover:text-ink",
            open && "rotate-90",
          )}
        >
          ▶
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        title={label}
        className={cx(
          "flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2.5 text-xs",
          active ? "font-medium text-[var(--accent)]" : "text-dim",
        )}
      >
        <span className="flex-1 truncate text-left">{label}</span>
        <span className="tabular-nums">{count}</span>
      </button>
    </div>
  );
}
