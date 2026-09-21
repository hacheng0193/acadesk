"use client";

import { useState } from "react";
import { deleteProject, saveProject } from "@/app/actions/research";
import {
  COLORS,
  PROJECT_KINDS,
  colorOf,
  parseLinks,
  type Project,
  type ProjectKind,
  type ProjectLink,
} from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { Button, Field, cx, inputClass } from "./ui";
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
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? "research");
  const [links, setLinks] = useState<ProjectLink[]>(parseLinks(project?.links_json));
  return (
    <form action={(fd) => saveProject(fd).then(close)} className="space-y-3">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <Field label="類別">
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_KINDS.map((k) => (
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
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-dim">常用連結</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            ＋ 新增連結
          </Button>
        </div>
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              {/* Controlled: uncontrolled rows keep their old DOM values when
                  one in the middle is removed. */}
              <input
                name="link_label"
                value={link.label}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                placeholder="名稱（課程網頁…）"
                className={cx(inputClass, "w-40 shrink-0")}
              />
              <input
                name="link_url"
                value={link.url}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                placeholder="https://..."
                className={cx(inputClass, "min-w-0 flex-1")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                aria-label="移除連結"
              >
                ×
              </Button>
            </div>
          ))}
          {links.length === 0 ? (
            <p className="text-xs text-dim">課程網頁、作業系統、dashboard… 加進來就能從主題頁一鍵開啟。</p>
          ) : null}
        </div>
      </div>

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
