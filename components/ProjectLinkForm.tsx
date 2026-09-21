"use client";

import { addProjectLink } from "@/app/actions/research";
import { Field, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

/**
 * Adds one link to a topic without opening the whole topic form - the common
 * case is pasting a course page or dashboard you just opened.
 */
export function ProjectLinkForm({ projectId, trigger }: { projectId: number; trigger: React.ReactNode }) {
  return (
    <Modal title="新增常用連結" trigger={trigger} triggerClassName="contents" width="max-w-md">
      {(close) => (
        <form action={(fd) => addProjectLink(fd).then(close)} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          <Field label="網址">
            <input name="url" required autoFocus placeholder="https://..." className={inputClass} />
          </Field>
          <Field label="名稱" hint="留空就顯示網域">
            <input name="label" placeholder="課程網頁、作業系統、dashboard…" className={inputClass} />
          </Field>
          <ModalActions close={close} />
        </form>
      )}
    </Modal>
  );
}
