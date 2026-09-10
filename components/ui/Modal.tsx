"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass, cx } from "./index";

/**
 * Native <dialog> modal. Wraps its children in a form-friendly shell and closes
 * itself after a successful submit, which is what every editor here wants.
 */
export function Modal({
  trigger,
  title,
  children,
  width = "max-w-lg",
  triggerClassName,
  open: controlledOpen,
  onClose,
}: {
  trigger?: ReactNode;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  width?: string;
  triggerClassName?: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const isOpen = controlledOpen ?? open;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      {trigger !== undefined ? (
        <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
          {trigger}
        </button>
      ) : null}
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className={cx(
          "m-auto w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-0",
          "text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={close}
            className={cx(buttonClass({ variant: "ghost", size: "icon" }), "text-lg leading-none")}
            aria-label="關閉"
          >
            ×
          </button>
        </div>
        {/* Mounted only while open, so each opening starts from a clean form
            instead of inheriting whatever the last one was left on. */}
        {isOpen ? (
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {typeof children === "function" ? children(close) : children}
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/** Submit button that closes the surrounding Modal once the action resolves. */
export function ModalActions({
  close,
  submitLabel = "儲存",
  extra,
}: {
  close: () => void;
  submitLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
      {extra}
      <button type="button" onClick={close} className={buttonClass({ variant: "ghost" })}>
        取消
      </button>
      <button type="submit" className={buttonClass({ variant: "primary" })}>
        {submitLabel}
      </button>
    </div>
  );
}
