"use client";

import { useState } from "react";
import { deleteProject, saveProject } from "@/app/actions/research";
import { COLORS, colorOf, type Project } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export function ProjectForm({ project, trigger }: { project?: Project; trigger: React.ReactNode }) {
  return (
    <Modal
      title={project ? "編輯研究主題" : "新增研究主題"}
      trigger={trigger}
      triggerClassName="contents"
      width="max-w-xl"
    >
      {(close) => <Inner project={project} close={close} />}
    </Modal>
  );
}

function Inner({ project, close }: { project?: Project; close: () => void }) {
  const [color, setColor] = useState(project?.color ?? "aqua");
  return (
    <form action={(fd) => saveProject(fd).then(close)} className="space-y-3">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <Field label="主題名稱">
        <input name="title" defaultValue={project?.title} required autoFocus className={inputClass} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="指導教授">
          <input name="advisor" defaultValue={project?.advisor} className={inputClass} />
        </Field>
        <Field label="開始日期">
          <input type="date" name="started_on" defaultValue={project?.started_on ?? ""} className={inputClass} />
        </Field>
        <Field label="狀態">
          <select name="status" defaultValue={project?.status ?? "active"} className={inputClass}>
            <option value="active">進行中</option>
            <option value="paused">暫停</option>
            <option value="done">完成</option>
          </select>
        </Field>
      </div>
      <Field label="顏色">
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={cx(
                "h-6 w-6 rounded-full border-2 transition-transform",
                color === c ? "scale-110 border-ink" : "border-transparent",
              )}
              style={{ background: colorOf(c) }}
            />
          ))}
        </div>
        <input type="hidden" name="color" value={color} />
      </Field>
      <Field label="描述（Markdown）">
        <textarea
          name="description_md"
          rows={5}
          defaultValue={project?.description_md}
          className={cx(inputClass, "font-mono text-xs")}
        />
      </Field>
      <ModalActions
        close={close}
        extra={
          project ? (
            <ConfirmButton
              className="mr-auto text-danger"
              message={`刪除「${project.title}」？里程碑會一併刪除。`}
              action={async () => {
                await deleteProject(project.id);
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
