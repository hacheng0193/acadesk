"use client";

import { useState } from "react";
import { describeSlot, parseNtuCourse, type NtuCourse } from "@/lib/ntu-course";
import { Button, cx, inputClass } from "./ui";

/**
 * Paste a course straight off 臺大課程網.
 *
 * The site has no export, so the input is whatever "select all, copy" produces -
 * menus, blank bullets and all. Parsing that is necessarily heuristic, so the
 * result is shown for confirmation before it touches the form.
 *
 * Everything happens locally; nothing is sent anywhere.
 */
export function NtuCourseImport({ onFill }: { onFill: (course: NtuCourse) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ course: NtuCourse; warnings: string[] } | null>(null);

  const parse = () => {
    setError("");
    setPreview(null);
    const result = parseNtuCourse(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview({ course: result.course, warnings: result.warnings });
  };

  const apply = () => {
    if (!preview) return;
    onFill(preview.course);
    setOpen(false);
    setText("");
    setPreview(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-line px-3 py-2 text-xs text-dim transition-colors hover:text-ink"
      >
        從臺大課程網貼上，自動填入
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-dim">從臺大課程網貼上</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
            setPreview(null);
          }}
          className="ml-auto text-xs text-dim hover:text-ink"
        >
          收起
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="到課程頁按 ⌘A 全選、⌘C 複製，整段貼在這裡"
        className={cx(inputClass, "resize-y font-mono text-[11px]")}
      />

      <div className="mt-2 flex items-center gap-2">
        <Button type="button" size="sm" variant="primary" onClick={parse} disabled={!text.trim()}>
          解析
        </Button>
        {preview ? (
          <Button type="button" size="sm" variant="outline" onClick={apply}>
            填入表單
          </Button>
        ) : null}
        <span className="text-[11px] text-dim">完全在本機解析，不會送出</span>
      </div>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {preview ? (
        <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface p-3">
          <dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 text-xs">
            <Row label="課名" value={preview.course.name} />
            <Row label="課號" value={preview.course.code} />
            <Row label="教師" value={preview.course.instructor} />
            <Row
              label="學分"
              value={preview.course.credits !== null ? String(preview.course.credits) : ""}
            />
            <Row label="學期" value={preview.course.semester} />
            <Row
              label="時段"
              value={preview.course.slots.map(describeSlot).join("　") || ""}
            />
          </dl>

          {preview.course.extras.length ? (
            <p className="border-t border-line pt-2 text-[11px] text-dim">
              另外讀到（系統沒有對應欄位，不會存）：
              {preview.course.extras.map((e) => `${e.label} ${e.value}`).join("　·　")}
            </p>
          ) : null}

          {preview.warnings.length ? (
            <ul className="space-y-0.5 border-t border-line pt-2 text-[11px] text-[var(--warn)]">
              {preview.warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-dim">{label}</dt>
      <dd className={cx("min-w-0 break-words", !value && "text-dim")}>{value || "（未讀到）"}</dd>
    </>
  );
}
