"use client";

import { useTransition } from "react";
import { cycleMilestone, deleteMilestone, saveMilestone } from "@/app/actions/research";
import type { Milestone } from "@/lib/types";
import { Button, Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

const MARK = { todo: "○", doing: "◐", done: "●" } as const;
const TONE = { todo: "text-dim", doing: "text-[var(--accent)]", done: "text-[var(--ok)]" } as const;

export function MilestoneTimeline({
  projectId,
  milestones,
}: {
  projectId: number;
  milestones: Milestone[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <ol className="relative space-y-0">
        {milestones.map((m, i) => (
          <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < milestones.length - 1 ? (
              <span className="absolute left-[9px] top-6 h-full w-px bg-[var(--border)]" />
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => void cycleMilestone(m.id))}
              title="點擊切換狀態"
              className={cx(
                "relative z-10 h-5 w-5 shrink-0 rounded-full bg-surface text-center text-sm leading-5",
                TONE[m.status],
              )}
            >
              {MARK[m.status]}
            </button>
            <div className="min-w-0 flex-1">
              <MilestoneForm
                projectId={projectId}
                milestone={m}
                trigger={
                  <span
                    className={cx(
                      "cursor-pointer text-sm hover:underline",
                      m.status === "done" && "text-dim line-through",
                    )}
                  >
                    {m.title}
                  </span>
                }
              />
              <div className="mt-0.5 flex items-center gap-2 text-xs text-dim">
                <span className="tabular-nums">{m.target_date ?? "未定日期"}</span>
                <button
                  type="button"
                  className="opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  onClick={() => {
                    if (confirm(`刪除里程碑「${m.title}」？`))
                      startTransition(() => void deleteMilestone(m.id));
                  }}
                >
                  刪除
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {milestones.length === 0 ? (
        <p className="py-3 text-xs text-dim">還沒有里程碑</p>
      ) : null}
      <MilestoneForm
        projectId={projectId}
        trigger={<span className="mt-3 inline-block cursor-pointer text-xs text-[var(--accent)]">＋ 新增里程碑</span>}
      />
    </div>
  );
}

function MilestoneForm({
  projectId,
  milestone,
  trigger,
}: {
  projectId: number;
  milestone?: Milestone;
  trigger: React.ReactNode;
}) {
  return (
    <Modal
      title={milestone ? "編輯里程碑" : "新增里程碑"}
      trigger={trigger}
      triggerClassName="contents"
    >
      {(close) => (
        <form action={(fd) => saveMilestone(fd).then(close)} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          {milestone ? <input type="hidden" name="id" value={milestone.id} /> : null}
          <Field label="標題">
            <input name="title" defaultValue={milestone?.title} required autoFocus className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="目標日期">
              <input type="date" name="target_date" defaultValue={milestone?.target_date ?? ""} className={inputClass} />
            </Field>
            <Field label="狀態">
              <select name="status" defaultValue={milestone?.status ?? "todo"} className={inputClass}>
                <option value="todo">待辦</option>
                <option value="doing">進行中</option>
                <option value="done">完成</option>
              </select>
            </Field>
          </div>
          <ModalActions close={close} />
        </form>
      )}
    </Modal>
  );
}

export { MilestoneForm };
