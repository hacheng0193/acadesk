"use client";

import { useRef } from "react";
import { deletePaper, savePaper } from "@/app/actions/papers";
import type { PaperMeta } from "@/lib/metadata";
import { splitList, type PaperRow, type Project } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { MetadataImport, fillPaperFields } from "./MetadataImport";
import { PdfAttachment } from "./PdfAttachment";
import { Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export function PaperForm({
  paper,
  projects,
  trigger,
  fileSize,
}: {
  paper?: PaperRow;
  projects: Project[];
  trigger: React.ReactNode;
  /** null when the stored file is missing from disk. */
  fileSize?: number | null;
}) {
  return (
    <Modal
      title={paper ? "編輯論文" : "新增論文"}
      trigger={trigger}
      triggerClassName="contents"
      width="max-w-2xl"
    >
      {(close) => <Inner paper={paper} projects={projects} fileSize={fileSize} close={close} />}
    </Modal>
  );
}

function Inner({
  paper,
  projects,
  fileSize,
  close,
}: {
  paper?: PaperRow;
  projects: Project[];
  fileSize?: number | null;
  close: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const linked = new Set(paper ? splitList(paper.projects) : []);

  /** Uncontrolled fields, so fill them straight on the DOM nodes. */
  const fill = (meta: PaperMeta) => fillPaperFields(formRef.current, meta);

  return (
    <form ref={formRef} action={(fd) => savePaper(fd).then(close)} className="space-y-3">
          {paper ? <input type="hidden" name="id" value={paper.id} /> : null}
          <MetadataImport onFill={fill} />
          <Field label="標題">
            <input name="title" defaultValue={paper?.title} required autoFocus className={inputClass} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="作者" className="col-span-2">
              <input name="authors" defaultValue={paper?.authors} className={inputClass} />
            </Field>
            <Field label="年份">
              <input name="year" type="number" defaultValue={paper?.year ?? ""} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="發表處">
              <input name="venue" defaultValue={paper?.venue} className={inputClass} />
            </Field>
            <Field label="狀態">
              <select name="status" defaultValue={paper?.status ?? "to_read"} className={inputClass}>
                <option value="to_read">待讀</option>
                <option value="reading">閱讀中</option>
                <option value="read">已讀</option>
              </select>
            </Field>
            <Field label="評分 1–5">
              <input name="rating" type="number" min="1" max="5" defaultValue={paper?.rating ?? ""} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="連結">
              <input name="url" defaultValue={paper?.url} className={inputClass} placeholder="https://…" />
            </Field>
            <Field label="DOI">
              <input name="doi" defaultValue={paper?.doi} className={inputClass} />
            </Field>
          </div>
          <Field label="標籤" hint="逗號分隔">
            <input
              name="tags"
              defaultValue={paper ? splitList(paper.tags).join(", ") : ""}
              className={inputClass}
            />
          </Field>
          {projects.length ? (
            <Field label="關聯研究主題">
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="project_ids"
                      value={p.id}
                      defaultChecked={linked.has(p.title)}
                    />
                    {p.title}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          <Field label="PDF 附檔" hint="付費論文下載後放這裡，會複製一份到論文庫">
            <PdfAttachment
              paperId={paper?.id ?? null}
              fileName={paper?.file_path ?? ""}
              sizeBytes={fileSize ?? null}
            />
          </Field>
          <Field label="筆記（Markdown）">
            <textarea
              name="notes_md"
              rows={8}
              defaultValue={paper?.notes_md}
              className={cx(inputClass, "font-mono text-xs")}
            />
          </Field>
          <ModalActions
            close={close}
            extra={
              paper ? (
                <ConfirmButton
                  className="mr-auto text-danger"
                  message={`刪除「${paper.title}」？`}
                  action={async () => {
                    await deletePaper(paper.id);
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
