"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  downloadCoolFiles,
  ignoreCoolFiles,
  openCoolFileInApp,
  revealCoolFile,
  unignoreCoolFiles,
} from "@/app/actions/cool";
import type { LectureCourse, LectureFile } from "@/lib/cool";
import { colorOf } from "@/lib/types";
import { Badge, Button, Card, cx } from "./ui";

const linkClass = "shrink-0 text-xs text-[var(--accent)] hover:underline";

/**
 * Lecture files from COOL, per course and module in COOL's own order. Downloaded
 * ones open from the vault; new ones can be previewed straight from COOL before
 * deciding whether to download or skip them.
 */
export function LectureBrowser({
  courses,
  files,
  showIgnored,
}: {
  courses: LectureCourse[];
  files: LectureFile[];
  showIgnored: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, startBusy] = useTransition();
  const [messages, setMessages] = useState<{ id: number; ok: boolean; text: string }[]>([]);

  const titles = new Map(files.map((f) => [f.cool_file_id, f.title]));

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const download = (ids: number[]) =>
    startBusy(async () => {
      setMessages([]);
      const results = await downloadCoolFiles(ids);
      setMessages(
        results
          .filter((r) => !r.ok)
          .map((r) => ({ id: r.id, ok: false, text: `${titles.get(r.id) ?? r.id}：${r.message}` })),
      );
      setSelected(new Set());
      router.refresh();
    });

  const run = (action: (ids: number[]) => Promise<void>, ids: number[]) =>
    startBusy(async () => {
      await action(ids);
      setSelected(new Set());
      router.refresh();
    });

  const local = (action: typeof revealCoolFile, id: number) =>
    startBusy(async () => {
      const r = await action(id);
      if (!r.ok) setMessages([{ id, ok: false, text: r.error ?? "無法開啟" }]);
    });

  const ids = [...selected];

  return (
    <div className="space-y-4">
      {selected.size ? (
        <div className="sticky top-2 z-10 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow)]">
          <span className="text-xs text-dim">已選 {selected.size} 個</span>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => download(ids)}>
            {busy ? "處理中…" : "下載選取"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(ignoreCoolFiles, ids)}>
            略過選取
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            取消選取
          </Button>
        </div>
      ) : null}

      {messages.length ? (
        <ul className="space-y-0.5 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {messages.map((m) => (
            <li key={m.id}>✗ {m.text}</li>
          ))}
        </ul>
      ) : null}

      {courses.map((course) => {
        const all = files.filter((f) => f.course_id === course.id);
        const list = all.filter((f) => showIgnored || f.status !== "ignored");
        const fresh = all.filter((f) => f.status === "new");
        const modules: [string, LectureFile[]][] = [];
        for (const f of list) {
          const last = modules[modules.length - 1];
          if (last && last[0] === f.module) last[1].push(f);
          else modules.push([f.module, [f]]);
        }

        return (
          <Card key={course.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="h-5 w-1 rounded-full" style={{ background: colorOf(course.color) }} />
              <h2 className="text-sm font-semibold">{course.name}</h2>
              <span className="text-xs text-dim">
                {all.filter((f) => f.status === "downloaded").length} / {all.length} 已下載
              </span>
              {course.project_id ? (
                <Link href={`/research/${course.project_id}`} className="text-xs text-dim hover:text-ink">
                  研究 →
                </Link>
              ) : null}
              {fresh.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => download(fresh.map((f) => f.cool_file_id))}
                >
                  全部下載（{fresh.length}）
                </Button>
              ) : null}
            </div>

            {list.length ? (
              <div className="space-y-3">
                {modules.map(([module, items], i) => (
                  <div key={`${module}-${i}`}>
                    <div className="mb-1 text-[11px] font-medium text-dim">{module || "未分類"}</div>
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {items.map((f) => (
                        <Row
                          key={f.cool_file_id}
                          file={f}
                          checked={selected.has(f.cool_file_id)}
                          busy={busy}
                          onToggle={() => toggle(f.cool_file_id)}
                          onReveal={() => local(revealCoolFile, f.cool_file_id)}
                          onOpenInApp={() => local(openCoolFileInApp, f.cool_file_id)}
                          onRestore={() => run(unignoreCoolFiles, [f.cool_file_id])}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-dim">
                {all.length ? "全部都略過了。" : "COOL 模組裡還沒有檔案，或還沒同步過。"}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Row({
  file,
  checked,
  busy,
  onToggle,
  onReveal,
  onOpenInApp,
  onRestore,
}: {
  file: LectureFile;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onReveal: () => void;
  onOpenInApp: () => void;
  onRestore: () => void;
}) {
  // The in-app viewer: the browser pane has no PDF plugin and would download the raw file.
  const href = `/view/cool/${file.cool_file_id}`;
  return (
    <li
      className={cx(
        "flex items-center gap-2 px-3 py-1.5 text-sm",
        file.status === "ignored" && "text-dim",
      )}
    >
      {file.status === "new" ? (
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`選取 ${file.title}`} />
      ) : (
        <span className="w-[13px] text-center text-xs text-dim">{file.status === "downloaded" ? "✓" : "–"}</span>
      )}
      <Link href={href} className="min-w-0 flex-1 truncate hover:underline" title={file.local_path || file.title}>
        {file.title}
      </Link>
      {file.status === "new" ? <Badge tone="accent">新</Badge> : null}
      {file.status === "ignored" ? <Badge>已略過</Badge> : null}

      {file.status === "downloaded" ? (
        <>
          <Link href={href} className={linkClass}>
            開啟
          </Link>
          <button type="button" onClick={onOpenInApp} disabled={busy} className={cx(linkClass, "text-dim")}>
            預覽程式
          </button>
          <button type="button" onClick={onReveal} disabled={busy} className={cx(linkClass, "text-dim")}>
            Finder
          </button>
        </>
      ) : (
        <Link href={href} className={linkClass}>
          預覽
        </Link>
      )}
      {file.status === "ignored" ? (
        <button type="button" onClick={onRestore} disabled={busy} className={cx(linkClass, "text-dim")}>
          取消略過
        </button>
      ) : null}
      {file.html_url ? (
        <a href={file.html_url} target="_blank" rel="noreferrer" className={cx(linkClass, "text-dim")}>
          COOL
        </a>
      ) : null}
    </li>
  );
}
