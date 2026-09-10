"use client";

import { deleteSession, saveSession } from "@/app/actions/time";
import { today } from "@/lib/dates";
import type { Course, Project, SessionRow } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { Field, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

function targetKey(s?: SessionRow): string {
  if (!s) return "";
  if (s.project_id) return `p:${s.project_id}`;
  if (s.course_id) return `c:${s.course_id}`;
  return "";
}

export function SessionForm({
  session,
  projects,
  courses,
  trigger,
}: {
  session?: SessionRow;
  projects: Project[];
  courses: Course[];
  trigger: React.ReactNode;
}) {
  return (
    <Modal
      title={session ? "編輯時段" : "手動補登時段"}
      trigger={trigger}
      triggerClassName="contents"
    >
      {(close) => (
        <form action={(fd) => saveSession(fd).then(close)} className="space-y-3">
          {session ? <input type="hidden" name="id" value={session.id} /> : null}
          <Field label="項目">
            <select name="target" defaultValue={targetKey(session)} className={inputClass}>
              <option value="">未分類</option>
              {projects.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.title}
                </option>
              ))}
              {courses.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>
                  {c.name}（課程）
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="日期">
              <input
                type="date"
                name="day"
                defaultValue={session?.started_at.slice(0, 10) ?? today()}
                className={inputClass}
              />
            </Field>
            <Field label="開始">
              <input
                type="time"
                name="start_time"
                defaultValue={session?.started_at.slice(11, 16) ?? "09:00"}
                className={inputClass}
              />
            </Field>
            <Field label="結束" hint="早於開始視為跨夜">
              <input
                type="time"
                name="end_time"
                defaultValue={session?.ended_at?.slice(11, 16) ?? "12:00"}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="備註">
            <input name="note" defaultValue={session?.note} className={inputClass} />
          </Field>
          <ModalActions
            close={close}
            extra={
              session ? (
                <ConfirmButton
                  className="mr-auto text-danger"
                  message="刪除這段紀錄？"
                  action={async () => {
                    await deleteSession(session.id);
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
