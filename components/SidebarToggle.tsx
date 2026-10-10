"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

const KEY = "sidebar-collapsed";

/**
 * Collapse the sidebar to its icons. The state is a class on <html>, set before
 * paint by the layout's script, so the sidebar and everything positioned beside
 * it (via --sidebar-w) never flash at the wrong width. ⌘\ toggles it too.
 */
export function SidebarToggle({ className }: { className?: string }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.classList.contains("sb-collapsed"));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("sb-collapsed");
    document.documentElement.classList.toggle("sb-collapsed", next);
    setCollapsed(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private browsing: it just won't be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "展開側欄" : "收合側欄"}
      title={`${collapsed ? "展開側欄" : "收合側欄"}（⌘\\）`}
      className={cx(
        "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="2.5" width="12" height="11" rx="2" />
        <path d="M6 2.5v11" />
        <path d={collapsed ? "M9 6.5 10.5 8 9 9.5" : "M11 6.5 9.5 8 11 9.5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
