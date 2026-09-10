"use client";

import { useRef, useState, useTransition } from "react";
import { attachPdf, detachPdf, revealPdf } from "@/app/actions/papers";
import { Button, cx } from "./ui";

/**
 * Local PDF for a paper. Paywalled papers (IEEE Xplore and the like) can't be
 * fetched by URL, so the file itself is what gets kept - dropped in here and
 * copied into the library, where clearing Downloads can't break the link.
 */
export function PdfAttachment({
  paperId,
  fileName,
  sizeBytes,
}: {
  paperId: number | null;
  fileName: string;
  sizeBytes: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!paperId) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-dim">
        先儲存這篇論文，之後就能附上 PDF。
      </p>
    );
  }

  const upload = (file: File) => {
    setError("");
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await attachPdf(paperId, fd);
      if (!result.ok) setError(result.error);
    });
  };

  const missing = !!fileName && sizeBytes === null;

  if (fileName) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <span className="text-dim">📄</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs">{fileName}</div>
            <div className={cx("text-[11px]", missing ? "text-danger" : "text-dim")}>
              {missing
                ? "檔案不見了（可能被移動或刪除）"
                : `${((sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`}
            </div>
          </div>
          {!missing ? (
            <a
              href={`/api/papers/${paperId}/file`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-[var(--accent)] hover:underline"
            >
              開啟
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || missing}
            onClick={() => startTransition(() => void revealPdf(paperId))}
          >
            在 Finder 中顯示
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            換一個檔案
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={pending}
            onClick={() => {
              if (confirm("移除這個 PDF？論文本身不會刪除。")) {
                startTransition(() => void detachPdf(paperId));
              }
            }}
          >
            移除
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cx(
          "cursor-pointer rounded-lg border border-dashed px-3 py-5 text-center text-xs transition-colors",
          dragging
            ? "border-[var(--accent)] bg-accent-soft/40 text-[var(--accent)]"
            : "border-line text-dim hover:text-ink",
        )}
      >
        {pending ? "複製中…" : "把 PDF 拖到這裡，或點擊選擇檔案"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
