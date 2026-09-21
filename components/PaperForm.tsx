"use client";

import { useRef, useState } from "react";
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
  const [linked, setLinked] = useState<number[]>(
    paper ? splitList(paper.project_ids).map(Number).filter(Boolean) : [],
  );
  const byId = new Map(projects.map((p) => [p.id, p]));
  const unlinked = projects.filter((p) => !linked.includes(p.id));

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
            <Field label="關聯研究主題" hint="可以選多個">
              {/* The links live in state and travel as hidden inputs, so the
                  action still reads a plain `project_ids` list. */}
              {linked.map((id) => (
                <input key={id} type="hidden" name="project_ids" value={id} />
              ))}
              {linked.length ? (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {linked.map((id) => (
                    <span
                      key={id}
                      className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
                    >
                      <span className="max-w-48 truncate">{byId.get(id)?.title ?? `#${id}`}</span>
                      <button
                        type="button"
                        aria-label={`取消關聯 ${byId.get(id)?.title ?? id}`}
                        onClick={() => setLinked(linked.filter((x) => x !== id))}
                        className="text-dim transition-colors hover:text-danger"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {unlinked.length ? (
                <select
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) setLinked([...linked, id]);
                  }}
                  className={inputClass}
                >
                  <option value="">{linked.length ? "＋ 再加一個主題…" : "選擇研究主題…"}</option>
                  {unlinked.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              ) : null}
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
