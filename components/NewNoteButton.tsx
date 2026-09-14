"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newNote } from "@/app/actions/notes";
import { Field, buttonClass, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

const TEMPLATES = [
  { key: "experiment", label: "實驗記錄" },
  { key: "meeting", label: "Meeting notes" },
  { key: "paper", label: "論文筆記" },
  { key: "blank", label: "空白" },
];

/**
 * Create a note in the vault that is already attached to this entity, instead
 * of making one elsewhere and coming back to link it.
 */
export function NewNoteButton({
  entityType,
  entityId,
  folders,
  vaultFolders,
  backTo,
}: {
  entityType: string;
  entityId: number;
  /** Folders this entity follows - the obvious place to put a new note. */
  folders: string[];
  vaultFolders: { path: string; count: number }[];
  backTo?: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const close = () => {
    setOpen(false);
    setError("");
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("link", `${entityType}:${entityId}`);
    startTransition(async () => {
      const result = await newNote(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      const path = `/notes/${result.rel.split("/").map(encodeURIComponent).join("/")}`;
      const q = backTo
        ? `?${new URLSearchParams({ from: backTo.href, fromLabel: backTo.label })}`
        : "";
      router.push(`${path}${q}`);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({ variant: "ghost", size: "sm" })}
      >
        ＋ 新增筆記
      </button>

      <Modal title="新增筆記" open={open} onClose={close} width="max-w-lg">
        {() => (
          <form onSubmit={submit} className="space-y-3">
            {error ? (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
            ) : null}

            <Field label="標題">
              <input name="title" autoFocus required className={inputClass} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="範本">
                <select name="template" defaultValue="experiment" className={inputClass}>
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="放在哪個資料夾">
                {/* Defaults to a folder this entity already follows, so the note
                    lands where its siblings live. */}
                <select name="folder" defaultValue={folders[0] ?? ""} className={inputClass}>
                  <option value="">（vault 根目錄）</option>
                  {vaultFolders.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="text-xs text-dim">
              會在 vault 裡建立實際的 .md 檔，並自動連結到這個主題，建立後直接開啟。
            </p>

            <ModalActions close={close} submitLabel={pending ? "建立中…" : "建立並開啟"} />
          </form>
        )}
      </Modal>
    </>
  );
}
