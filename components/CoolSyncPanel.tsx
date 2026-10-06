"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  coolPanelState,
  downloadCoolFiles,
  ignoreCoolFiles,
  markAnnouncementsRead,
  runCoolSync,
  type CoolPanelState,
  type DownloadResult,
} from "@/app/actions/cool";
import type { CoolRun, DownloadedFile, NewFile } from "@/lib/cool";
import { toLocalIso } from "@/lib/dates";
import { Badge, Button, buttonClass, cx } from "./ui";
import { Modal } from "./ui/Modal";

/**
 * "同步 NTU COOL": pulls assignments, announcements and the module file list
 * from COOL, then lets the user pick which new lecture files go into the vault.
 */
export function CoolSyncPanel({ initial }: { initial: CoolPanelState }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initial);
  const [syncing, startSync] = useTransition();
  const [justSynced, setJustSynced] = useState(false);
  // The server may have synced on its own (hourly auto-sync); take fresh props on re-render.
  useEffect(() => setState(initial), [initial]);

  const pending = state.files.length + state.announcements.length;

  const sync = () =>
    startSync(async () => {
      setOpen(true);
      setJustSynced(false);
      setState(await runCoolSync());
      setJustSynced(true);
    });

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          {pending ? (
            <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "ghost" })}>
              COOL 待處理 <Badge tone="accent">{pending}</Badge>
            </button>
          ) : null}
          <Button variant="outline" onClick={sync} disabled={syncing || !state.configured}>
            {syncing ? "同步中…" : "同步 NTU COOL"}
          </Button>
        </div>
        {state.configured ? (
          <LastSynced run={state.lastRun} autoSync={state.autoSync} />
        ) : (
          <p className="text-right text-[11px] text-dim">
            要同步 COOL：在 .env.local 設定 COOL_COOKIE（瀏覽器登入 COOL 後複製 Cookie），再重啟服務
          </p>
        )}
      </div>

      <Modal title="NTU COOL 同步" open={open} onClose={() => setOpen(false)} width="max-w-2xl">
        <Body
          state={state}
          syncing={syncing}
          justSynced={justSynced}
          refresh={async () => setState(await coolPanelState())}
          resync={sync}
        />
      </Modal>
    </>
  );
}

function LastSynced({ run, autoSync }: { run: CoolRun | null; autoSync: boolean }) {
  const hint = autoSync ? "08:00–18:00 間每小時自動同步，有新作業或公告會跳通知" : undefined;
  if (!run) {
    return (
      <p className="text-[11px] text-dim" title={hint}>
        還沒同步過
      </p>
    );
  }
  const day = run.started.slice(0, 10);
  const time = run.started.slice(11, 16);
  const when = day === toLocalIso(new Date()).slice(0, 10) ? `今天 ${time}` : `${day.slice(5).replace("-", "/")} ${time}`;
  return (
    <p className={cx("text-[11px]", run.error ? "text-danger" : "text-dim")} title={run.error ?? hint}>
      上次同步：{when}
      {run.auto ? "（自動）" : ""}
      {run.error ? " · 失敗" : ""}
    </p>
  );
}

function Body({
  state,
  syncing,
  justSynced,
  refresh,
  resync,
}: {
  state: CoolPanelState;
  syncing: boolean;
  justSynced: boolean;
  refresh: () => Promise<void>;
  resync: () => void;
}) {
  const run = state.lastRun;
  const [showLog, setShowLog] = useState(false);

  if (syncing) {
    return <p className="py-6 text-center text-sm text-dim">正在讀取 COOL 的作業、公告與講義…</p>;
  }

  return (
    <div className="space-y-5">
      {run ? (
        <section>
          <div className="flex items-center gap-2 text-xs text-dim">
            <span>
              {justSynced ? "剛剛同步" : "上次同步"}：{run.started.replace("T", " ")}
            </span>
            <button type="button" className="underline hover:text-ink" onClick={() => setShowLog(!showLog)}>
              {showLog ? "收起紀錄" : "看紀錄"}
            </button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={resync} disabled={!state.configured}>
              再同步一次
            </Button>
          </div>
          {run.error ? (
            <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{run.error}</p>
          ) : null}
          {run.summary ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={run.summary.added ? "accent" : "neutral"}>作業新增 {run.summary.added}</Badge>
              <Badge>更新 {run.summary.updated}</Badge>
              <Badge>標完成 {run.summary.done}</Badge>
              {run.summary.adopted ? <Badge>接管手動作業 {run.summary.adopted}</Badge> : null}
              <Badge tone={run.summary.newFiles ? "accent" : "neutral"}>新講義 {run.summary.newFiles}</Badge>
              <Badge tone={run.summary.newAnnouncements ? "accent" : "neutral"}>
                新公告 {run.summary.newAnnouncements}
              </Badge>
            </div>
          ) : null}
          {run.summary && Object.keys(run.summary.errors).length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-danger">
              {Object.entries(run.summary.errors).map(([course, err]) => (
                <li key={course}>
                  {course}：{err}
                </li>
              ))}
            </ul>
          ) : null}
          {showLog ? (
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-surface-2 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {run.lines.map((l) => `${l.t}  ${l.msg}`).join("\n")}
            </pre>
          ) : null}
        </section>
      ) : (
        <p className="text-xs text-dim">還沒同步過。</p>
      )}

      <Files files={state.files} refresh={refresh} />
      <Downloaded files={state.downloaded} />
      <Announcements state={state} refresh={refresh} />
    </div>
  );
}

function Files({ files, refresh }: { files: NewFile[]; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<(DownloadResult & { title: string })[]>([]);
  const [busy, startBusy] = useTransition();

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const byCourse = new Map<string, NewFile[]>();
  for (const f of files) byCourse.set(f.course_name, [...(byCourse.get(f.course_name) ?? []), f]);
  const titles = new Map(files.map((f) => [f.cool_file_id, f.title]));

  const download = () =>
    startBusy(async () => {
      const ids = [...selected];
      const out = await downloadCoolFiles(ids);
      setResults(out.map((r) => ({ ...r, title: titles.get(r.id) ?? String(r.id) })));
      setSelected(new Set());
      await refresh();
    });

  const ignore = () =>
    startBusy(async () => {
      await ignoreCoolFiles([...selected]);
      setSelected(new Set());
      await refresh();
    });

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-semibold">新講義</h4>
        <span className="text-xs text-dim">勾選要下載到 vault「課名/Lectures/」的檔案</span>
      </div>
      {files.length ? (
        <>
          <div className="space-y-3">
            {[...byCourse].map(([course, list]) => (
              <div key={course}>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-dim">
                  {course}
                  <button
                    type="button"
                    className="font-normal underline hover:text-ink"
                    onClick={() => {
                      const next = new Set(selected);
                      const all = list.every((f) => next.has(f.cool_file_id));
                      for (const f of list) {
                        if (all) next.delete(f.cool_file_id);
                        else next.add(f.cool_file_id);
                      }
                      setSelected(next);
                    }}
                  >
                    全選
                  </button>
                </div>
                <ul className="space-y-1">
                  {list.map((f) => (
                    <li key={f.cool_file_id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={selected.has(f.cool_file_id)}
                          onChange={() => toggle(f.cool_file_id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{f.title}</span>
                        {f.module ? <span className="shrink-0 text-[11px] text-dim">{f.module}</span> : null}
                        <FileLinks file={f} label="預覽" />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={busy || !selected.size} onClick={download}>
              {busy ? "處理中…" : `下載選取（${selected.size}）`}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || !selected.size} onClick={ignore}>
              略過選取
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-dim">沒有待處理的新講義。</p>
      )}
      {results.length ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {results.map((r) => (
            <li key={r.id} className={cx(r.ok ? "text-dim" : "text-danger")}>
              {r.ok ? (
                <>
                  ✓ {r.title} → {r.message}{" "}
                  <Link href={fileHref(r.id)} className={linkClass}>
                    開啟
                  </Link>
                </>
              ) : (
                `✗ ${r.title}：${r.message}`
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const linkClass = "shrink-0 text-xs text-[var(--accent)] hover:underline";

/** The in-app viewer: the vault copy if downloaded, else streamed from COOL. */
function fileHref(id: number): string {
  return `/view/cool/${id}`;
}

function FileLinks({ file, label }: { file: NewFile; label: string }) {
  // Inside a <label>: stop the click from also toggling the checkbox.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <Link href={fileHref(file.cool_file_id)} onClick={stop} className={linkClass}>
        {label}
      </Link>
      {file.html_url ? (
        <a href={file.html_url} target="_blank" rel="noreferrer" onClick={stop} className={cx(linkClass, "text-dim")}>
          COOL
        </a>
      ) : null}
    </>
  );
}

function Downloaded({ files }: { files: DownloadedFile[] }) {
  if (!files.length) return null;
  return (
    <section className="flex items-center gap-2">
      <h4 className="text-sm font-semibold">已下載講義</h4>
      <span className="text-xs text-dim">{files.length} 個</span>
      <Link href="/lectures" className={cx(linkClass, "ml-auto")}>
        到講義頁 →
      </Link>
    </section>
  );
}

function Announcements({ state, refresh }: { state: CoolPanelState; refresh: () => Promise<void> }) {
  const [busy, startBusy] = useTransition();
  const list = state.announcements;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-semibold">新公告</h4>
        {list.length ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() =>
              startBusy(async () => {
                await markAnnouncementsRead(list.map((a) => a.cool_id));
                await refresh();
              })
            }
          >
            全部標為已讀
          </Button>
        ) : null}
      </div>
      {list.length ? (
        <ul className="space-y-1">
          {list.map((a) => (
            <li key={a.cool_id} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 text-[11px] text-dim">{a.posted_at?.slice(0, 10) ?? ""}</span>
              <span className="shrink-0 text-xs text-dim">{a.course_name}</span>
              {a.html_url ? (
                <a href={a.html_url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">
                  {a.title}
                </a>
              ) : (
                <span className="min-w-0 truncate">{a.title}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-dim">沒有未讀公告。</p>
      )}
    </section>
  );
}
