"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveAssignment } from "@/app/actions/assignments";
import { newNote } from "@/app/actions/notes";
import { savePaper } from "@/app/actions/papers";
import { today } from "@/lib/dates";
import { ITEM_KINDS, type Course, type Project } from "@/lib/types";
import { LogForm, type LogTarget } from "./LogForm";
import { MetadataImport, fillPaperFields } from "./MetadataImport";
import { SearchResults } from "./SearchResults";
import { Modal, ModalActions } from "./ui/Modal";
import { Field, cx, inputClass } from "./ui";

const TABS = [
  { key: "assignment", label: "事項" },
  { key: "log", label: "研究紀錄" },
  { key: "paper", label: "論文" },
  { key: "note", label: "筆記" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function QuickAdd({
  projects,
  courses,
  logTargets,
}: {
  projects: Project[];
  courses: Course[];
  logTargets: LogTarget[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("assignment");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const paperFormRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setError("");
    setQuery("");
  };

  const submit = (action: (fd: FormData) => Promise<unknown>) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = (await action(fd)) as { ok?: boolean; error?: string; rel?: string } | undefined;
      if (result && result.ok === false) {
        setError(result.error ?? "儲存失敗");
        return;
      }
      close();
      if (result?.rel) router.push(`/notes/${result.rel.split("/").map(encodeURIComponent).join("/")}`);
      else router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-dim transition-colors hover:text-ink"
      >
        <span className="text-sm leading-none">＋</span>
        <span className="flex-1 text-left">快速新增</span>
        <kbd className="rounded border border-line bg-surface px-1 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Modal title="搜尋與新增" open={open} onClose={close} width="max-w-xl">
        {() => (
          <div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋行程、筆記、文獻…"
              className={cx(inputClass, "mb-3")}
            />

            {query.trim() ? (
              <SearchResults
                query={query}
                onNavigate={(href) => {
                  close();
                  router.push(href);
                }}
              />
            ) : (
              <>
            <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    setError("");
                  }}
                  className={cx(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    tab === t.key ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-dim hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {error ? (
              <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
            ) : null}

            {tab === "assignment" ? (
              <form onSubmit={submit(saveAssignment)} className="space-y-3">
                <Field label="類型">
                  <div className="flex flex-wrap gap-1.5">
                    {ITEM_KINDS.map((k, i) => (
                      <label
                        key={k.key}
                        className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-dim transition-colors has-[:checked]:border-transparent has-[:checked]:bg-[var(--accent)] has-[:checked]:text-white"
                      >
                        <input
                          type="radio"
                          name="kind"
                          value={k.key}
                          defaultChecked={i === 0}
                          className="sr-only !w-auto"
                        />
                        {k.label}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="標題">
                  <input name="title" required className={inputClass} placeholder="例如：作業三 — 動態規劃" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="課程">
                    <select name="course_id" className={inputClass}>
                      <option value="">（無）</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="時間">
                    <input type="datetime-local" name="due_at" className={inputClass} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="重複" hint="週報、例會選每週">
                    <select name="repeat_rule" defaultValue="none" className={inputClass}>
                      <option value="none">不重複</option>
                      <option value="weekly">每週</option>
                      <option value="biweekly">每兩週</option>
                    </select>
                  </Field>
                  <Field label="優先級">
                    <select name="priority" defaultValue="normal" className={inputClass}>
                      <option value="low">低</option>
                      <option value="normal">普通</option>
                      <option value="high">高</option>
                    </select>
                  </Field>
                </div>
                <ModalActions close={close} submitLabel={pending ? "儲存中…" : "新增事項"} />
              </form>
            ) : null}

            {tab === "log" ? <LogForm projects={logTargets} compact onDone={close} /> : null}

            {tab === "paper" ? (
              <form ref={paperFormRef} onSubmit={submit(savePaper)} className="space-y-3">
                <MetadataImport onFill={(meta) => fillPaperFields(paperFormRef.current, meta)} />
                {/* No room for a DOI box here, but a parsed DOI should still be saved. */}
                <input type="hidden" name="doi" />
                <Field label="標題">
                  <input name="title" required className={inputClass} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="作者">
                    <input name="authors" className={inputClass} placeholder="Doe, J. et al." />
                  </Field>
                  <Field label="發表處 / 年份">
                    <div className="flex gap-2">
                      <input name="venue" className={inputClass} placeholder="NeurIPS" />
                      <input name="year" type="number" className={cx(inputClass, "!w-24")} placeholder="2025" />
                    </div>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="連結 / DOI">
                    <input name="url" className={inputClass} placeholder="https://…" />
                  </Field>
                  <Field label="標籤" hint="逗號分隔">
                    <input name="tags" className={inputClass} placeholder="LLM, 對比學習" />
                  </Field>
                </div>
                <ModalActions close={close} submitLabel={pending ? "儲存中…" : "新增論文"} />
              </form>
            ) : null}

            {tab === "note" ? (
              <form onSubmit={submit(newNote)} className="space-y-3">
                <Field label="筆記標題">
                  <input name="title" required className={inputClass} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="範本">
                    <select name="template" defaultValue="experiment" className={inputClass}>
                      <option value="blank">空白</option>
                      <option value="experiment">實驗記錄</option>
                      <option value="meeting">Meeting notes</option>
                      <option value="paper">論文筆記</option>
                    </select>
                  </Field>
                  <Field label="資料夾" hint="vault 內的相對路徑，可留空">
                    <input name="folder" className={inputClass} placeholder="Research/2026" />
                  </Field>
                </div>
                <Field label="連結到">
                  <select name="link" className={inputClass}>
                    <option value="">（不連結）</option>
                    {projects.map((p) => (
                      <option key={p.id} value={`project:${p.id}`}>
                        研究：{p.title}
                      </option>
                    ))}
                    {courses.map((c) => (
                      <option key={c.id} value={`course:${c.id}`}>
                        課程：{c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <ModalActions close={close} submitLabel={pending ? "建立中…" : "建立並開啟"} />
              </form>
            ) : null}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
