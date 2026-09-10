"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Switches between pre-rendered views. Takes nodes rather than a render prop so
 * a Server Component can pass its children across the boundary.
 */
export function ViewToggle({
  views,
}: {
  views: { key: string; label: string; node: ReactNode }[];
}) {
  const [active, setActive] = useState(views[0].key);
  return (
    <>
      <div className="mb-4 inline-flex gap-1 rounded-lg bg-surface-2 p-1">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setActive(v.key)}
            className={cx(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              active === v.key ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-dim hover:text-ink",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {views.map((v) => (
        <div key={v.key} hidden={active !== v.key}>
          {v.node}
        </div>
      ))}
    </>
  );
}
