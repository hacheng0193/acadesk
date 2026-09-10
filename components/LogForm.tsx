"use client";

import { deleteLog, saveLog } from "@/app/actions/research";
import { today } from "@/lib/dates";
import type { LogEntry, Project } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export function LogForm({
  log,
  projects,
  defaultProjectId,
  trigger,
}: {
  log?: LogEntry;
  projects: Project[];
  defaultProjectId?: number;
  trigger: React.ReactNode;
}) {
  return (
    <Modal
      title={log ? "編輯紀錄" : "新增研究紀錄"}
      trigger={trigger}
      triggerClassName="contents"
      width="max-w-2xl"
    >
      {(close) => (
        <form action={(fd) => saveLog(fd).then(close)} className="space-y-3">
          {log ? <input type="hidden" name="id" value={log.id} /> : null}
          <Field label="標題">
            <input name="title" defaultValue={log?.title} required autoFocus className={inputClass} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="研究主題">
              <select
                name="project_id"
                defaultValue={log?.project_id ?? defaultProjectId ?? ""}
                className={inputClass}
              >
                <option value="">（無）</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="類型">
              <select name="kind" defaultValue={log?.kind ?? "experiment"} className={inputClass}>
                <option value="experiment">實驗</option>
                <option value="meeting">Meeting</option>
                <option value="idea">想法</option>
              </select>
            </Field>
            <Field label="日期">
              <input type="date" name="occurred_on" defaultValue={log?.occurred_on ?? today()} className={inputClass} />
            </Field>
          </div>
          <Field label="內容（Markdown）">
            <textarea
              name="body_md"
              rows={12}
              defaultValue={log?.body_md}
              className={cx(inputClass, "font-mono text-xs leading-relaxed")}
            />
          </Field>
          <ModalActions
            close={close}
            extra={
              log ? (
                <ConfirmButton
                  className="mr-auto text-danger"
                  message={`刪除「${log.title}」？`}
                  action={async () => {
                    await deleteLog(log.id);
                    close();
                  }}
                >
                  刪除
                </ConfirmButton>
              ) : null
            }
          />
        </form>
      )}
    </Modal>
  );
}
