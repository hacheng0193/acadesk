"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newLog } from "@/app/actions/notes";
import { today } from "@/lib/dates";
import { LOG_KINDS } from "@/lib/types";
import { Field, buttonClass, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export type LogTarget = { id: number; title: string; folder: string };

/** Mirrors safeFileName in lib/vault.ts, so the preview shows the real path. */
function fileName(date: string, title: string): string {
  const cleaned = `${date} ${title || "未命名紀錄"}`.replace(/[\/\\:*?"<>|\0]/g, "-").replace(/^\.+/, "").trim();
  return `${cleaned}.md`;
}

/**
 * Create a research log entry. It is written to the vault as a note, and the
 * path it will get is shown before saving - no guessing where it went.
 */
export function LogForm({
  projects,
  defaultProjectId,
  compact,
  onDone,
}: {
  projects: LogTarget[];
  defaultProjectId?: number;
  /** Inline (inside ⌘K) instead of a button that opens its own modal. */
  compact?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const initial = projects.find((p) => p.id === defaultProjectId) ?? null;
  const [projectId, setProjectId] = useState<number | null>(initial?.id ?? null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [folder, setFolder] = useState(initial?.folder ?? "");

  // An empty folder falls back to the topic's default on the server; show that.
  const targetFolder =
    folder.replace(/^\/+|\/+$/g, "") || projects.find((p) => p.id === projectId)?.folder || "";

  const close = () => {
    setOpen(false);
    setError("");
    onDone?.();
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await newLog(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const project = projects.find((p) => p.id === projectId);
      close();
      setTitle("");
      const q = project
        ? `?${new URLSearchParams({ from: `/research/${project.id}`, fromLabel: project.title })}`
        : "";
      router.push(`/notes/${result.rel.split("/").map(encodeURIComponent).join("/")}${q}`);
    });
  };

  const form = (
    <form onSubmit={submit} className="space-y-3">
      {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p> : null}

      <Field label="標題">
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          placeholder="今天做了什麼"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="研究主題">
          <select
            name="project_id"
            required
            value={projectId ?? ""}
            onChange={(e) => {
              const next = projects.find((p) => p.id === Number(e.target.value));
              setProjectId(next?.id ?? null);
              if (next) setFolder(next.folder);
            }}
            className={inputClass}
          >
            <option value="" disabled>
              選擇主題…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="類型">
          <select name="kind" defaultValue="experiment" className={inputClass}>
            {LOG_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="日期">
          <input
            type="date"
            name="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="資料夾" hint="vault 內的相對路徑">
        <input
          name="folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          className={cx(inputClass, "font-mono text-xs")}
        />
      </Field>

      {compact ? (
        <Field label="內容" hint="留空則套用範本，建立後在筆記裡繼續寫">
          <textarea name="body" rows={4} className={cx(inputClass, "font-mono text-xs")} />
        </Field>
      ) : null}

      <p className="break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11px] text-dim">
        → {targetFolder ? `${targetFolder}/` : ""}
        {fileName(date, title)}
      </p>

      <ModalActions close={close} submitLabel={pending ? "建立中…" : "建立並開啟"} />
    </form>
  );

  if (compact) return form;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "primary" })}>
        ＋ 新增紀錄
      </button>
      <Modal title="新增研究紀錄" open={open} onClose={close} width="max-w-2xl">
        {() => form}
      </Modal>
    </>
  );
}
