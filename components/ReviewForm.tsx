"use client";

import { saveReview } from "@/app/actions/reviews";
import type { Project, Review } from "@/lib/types";
import { Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export function ReviewForm({
  review,
  projects,
  trigger,
}: {
  review?: Review;
  projects: Project[];
  trigger: React.ReactNode;
}) {
  return (
    <Modal title={review ? "編輯文獻回顧" : "新增文獻回顧"} trigger={trigger} triggerClassName="contents">
      {(close) => (
        <form action={(fd) => saveReview(fd).then(close)} className="space-y-3">
          {review ? <input type="hidden" name="id" value={review.id} /> : null}
          <Field label="標題">
            <input
              name="title"
              defaultValue={review?.title}
              required
              autoFocus
              placeholder="例：Contrastive learning for time series"
              className={inputClass}
            />
          </Field>
          <Field label="研究問題 / 範圍（Markdown）" hint="這份回顧想回答什麼？納入與排除的條件？">
            <textarea
              name="question_md"
              rows={5}
              defaultValue={review?.question_md}
              className={cx(inputClass, "text-sm")}
            />
          </Field>
          {projects.length ? (
            <Field label="研究主題" hint="選填，綁定後會出現在主題頁">
              <select name="project_id" defaultValue={review?.project_id ?? ""} className={inputClass}>
                <option value="">不綁定</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <ModalActions close={close} submitLabel={review ? "儲存" : "建立"} />
        </form>
      )}
    </Modal>
  );
}
