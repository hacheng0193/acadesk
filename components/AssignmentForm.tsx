"use client";

import { useState } from "react";
import { deleteAssignment, saveAssignment } from "@/app/actions/assignments";
import {
  ITEM_KINDS,
  isDeadlineKind,
  type AssignmentRow,
  type Course,
  type ItemKind,
  type RepeatRule,
} from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export function AssignmentForm({
  assignment,
  courses,
  trigger,
  defaultKind,
}: {
  assignment?: AssignmentRow;
  courses: Course[];
  trigger: React.ReactNode;
  defaultKind?: ItemKind;
}) {
  return (
    <Modal
      title={assignment ? "編輯事項" : "新增事項"}
      trigger={trigger}
      triggerClassName="contents"
      width="max-w-xl"
    >
      {(close) => (
        <Inner assignment={assignment} courses={courses} defaultKind={defaultKind} close={close} />
      )}
    </Modal>
  );
}

function Inner({
  assignment,
  courses,
  defaultKind,
  close,
}: {
  assignment?: AssignmentRow;
  courses: Course[];
  defaultKind?: ItemKind;
  close: () => void;
}) {
  const [kind, setKind] = useState<ItemKind>(assignment?.kind ?? defaultKind ?? "assignment");
  const [repeat, setRepeat] = useState<RepeatRule>(assignment?.repeat_rule ?? "none");
  const deadline = isDeadlineKind(kind);

  return (
    <form action={(fd) => saveAssignment(fd).then(close)} className="space-y-3">
      {assignment ? <input type="hidden" name="id" value={assignment.id} /> : null}

      <Field label="類型">
        <div className="flex flex-wrap gap-1.5">
          {ITEM_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                kind === k.key
                  ? "border-transparent bg-[var(--accent)] text-white"
                  : "border-line text-dim hover:text-ink",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
      </Field>

      <Field label="標題">
        <input name="title" defaultValue={assignment?.title} required autoFocus className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="課程" hint="可留空">
          <select name="course_id" defaultValue={assignment?.course_id ?? ""} className={inputClass}>
            <option value="">（無）</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={deadline ? "截止時間" : "開始時間"}>
          <input
            type="datetime-local"
            name="due_at"
            defaultValue={assignment?.due_at ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      {!deadline ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="結束時間" hint="可留空">
            <input
              type="datetime-local"
              name="end_at"
              defaultValue={assignment?.end_at ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="地點">
            <input
              name="location"
              defaultValue={assignment?.location}
              className={inputClass}
              placeholder="例如 E1-201 / 線上"
            />
          </Field>
        </div>
      ) : (
        <input type="hidden" name="location" value={assignment?.location ?? ""} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="重複" hint="週報、例會選每週">
          <select
            name="repeat_rule"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as RepeatRule)}
            className={inputClass}
          >
            <option value="none">不重複</option>
            <option value="weekly">每週</option>
            <option value="biweekly">每兩週</option>
          </select>
        </Field>
        {repeat !== "none" ? (
          <Field label="重複到" hint="留空表示持續進行">
            <input
              type="date"
              name="repeat_until"
              defaultValue={assignment?.repeat_until ?? ""}
              className={inputClass}
            />
          </Field>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="狀態">
          <select name="status" defaultValue={assignment?.status ?? "todo"} className={inputClass}>
            <option value="todo">待辦</option>
            <option value="doing">進行中</option>
            <option value="done">完成</option>
          </select>
        </Field>
        <Field label="優先級">
          <select name="priority" defaultValue={assignment?.priority ?? "normal"} className={inputClass}>
            <option value="low">低</option>
            <option value="normal">普通</option>
            <option value="high">高</option>
          </select>
        </Field>
        {deadline ? (
          <Field label="佔比 %">
            <input
              name="weight"
              type="number"
              step="1"
              defaultValue={assignment?.weight ?? ""}
              className={inputClass}
            />
          </Field>
        ) : null}
      </div>

      {deadline ? (
        <Field label="預估時數">
          <input
            name="est_hours"
            type="number"
            step="0.5"
            defaultValue={assignment?.est_hours ?? ""}
            className={inputClass}
          />
        </Field>
      ) : null}

      <Field label="備註（Markdown）">
        <textarea
          name="notes_md"
          rows={4}
          defaultValue={assignment?.notes_md}
          className={cx(inputClass, "font-mono text-xs")}
        />
      </Field>

      <ModalActions
        close={close}
        extra={
          assignment ? (
            <ConfirmButton
              className="mr-auto text-danger"
              message={
                assignment.repeat_rule === "none"
                  ? `刪除「${assignment.title}」？`
                  : `刪除「${assignment.title}」？整個重複系列都會刪除。`
              }
              action={async () => {
                await deleteAssignment(assignment.id);
                close();
              }}
            >
              刪除
            </ConfirmButton>
          ) : null
        }
      />
    </form>
  );
}
