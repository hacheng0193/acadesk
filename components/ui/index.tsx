import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium " +
  "transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const BUTTON_VARIANTS = {
  primary: "bg-[var(--accent)] text-white hover:opacity-90",
  soft: "bg-surface-2 text-ink hover:bg-line",
  outline: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-dim hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger-soft text-danger hover:opacity-85",
} as const;

const BUTTON_SIZES = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5",
  lg: "h-11 px-5",
  icon: "h-8 w-8",
} as const;

type ButtonStyle = {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function buttonClass({ variant = "soft", size = "md" }: ButtonStyle = {}): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size]);
}

export function Button({
  variant,
  size,
  className,
  ...rest
}: ComponentProps<"button"> & ButtonStyle) {
  return <button className={cx(buttonClass({ variant, size }), className)} {...rest} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...rest
}: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={cx(buttonClass({ variant, size }), className)} {...rest} />;
}

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-surface shadow-[var(--shadow)]",
        className,
      )}
      {...rest}
    />
  );
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-dim">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface-2 text-dim border-line",
  accent: "bg-accent-soft text-[var(--accent)] border-transparent",
  ok: "bg-ok-soft text-[var(--ok)] border-transparent",
  warn: "bg-warn-soft text-[var(--warn)] border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: ComponentProps<"span"> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** Control styling without a width, so callers stay free to size their own. */
export const inputClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-dim/70 focus:border-[var(--accent)] focus:outline-none";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cx(
        "block [&_input]:w-full [&_select]:w-full [&_textarea]:w-full",
        className,
      )}
    >
      <span className="mb-1 block text-xs font-medium text-dim">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-dim">{hint}</span> : null}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-dim">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-dim">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
