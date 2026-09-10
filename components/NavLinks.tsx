"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-accent-soft font-medium text-[var(--accent)]"
                : "text-dim hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span className="w-4 text-center text-[13px]">{item.icon}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="rounded-md bg-danger-soft px-1.5 text-[11px] font-semibold text-danger">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
