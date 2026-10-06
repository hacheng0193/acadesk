"use client";

import { useEffect, useState } from "react";

/**
 * Notes are rendered to HTML strings all over the app, so one document-level
 * listener handles every `file://` link instead of wiring each renderer.
 * The server opens the file; the browser would refuse to.
 */
export function LocalFileLinks() {
  const [error, setError] = useState("");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a.local-file");
      if (!link || e.button !== 0) return;
      e.preventDefault();
      fetch("/api/local/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ href: link.getAttribute("href") }),
      })
        .then(async (r) => {
          if (r.ok) return;
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || "無法開啟這個檔案。");
        })
        .catch((err: Error) => {
          setError(err.message);
          setTimeout(() => setError(""), 4000);
        });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return error ? (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger shadow-[var(--shadow)]"
    >
      {error}
    </div>
  ) : null;
}
