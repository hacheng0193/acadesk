"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPaperFromFile } from "@/app/actions/papers";
import { uploadPdf } from "./PdfAttachment";
import { cx } from "./ui";

/**
 * Drop a PDF anywhere on the papers page to start a new paper from it: the
 * paper is created (titled after the file), the PDF attached, and the reader
 * opened. The details can be filled in from the DOI afterwards.
 */
export function PaperDropZone({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={async (e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(false);
        // Leave drops meant for an open dialog's own drop target alone.
        if ((e.target as HTMLElement).closest("dialog")) return;
        const file = [...e.dataTransfer.files].find(
          (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
        );
        if (!file) return setError("只接受 PDF 檔案");
        setError("");
        setBusy(file.name);
        const id = await createPaperFromFile(file.name);
        const result = await uploadPdf(id, file);
        setBusy("");
        if (!result.ok) setError(result.error);
        router.push(`/papers/${id}`);
      }}
    >
      {children}
      {over || busy ? (
        <div
          className={cx(
            "pointer-events-none fixed inset-y-0 right-0 left-60 z-20 grid place-items-center",
            "border-2 border-dashed border-[var(--accent)] bg-accent-soft/60 text-sm font-medium text-[var(--accent)]",
          )}
        >
          {busy ? `正在加入「${busy}」…` : "放開以新增論文並附上 PDF"}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
