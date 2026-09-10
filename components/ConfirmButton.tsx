"use client";

import { useTransition } from "react";
import { Button, buttonClass, cx } from "./ui";

/** Destructive action with a confirm step, usable anywhere a server action is passed in. */
export function ConfirmButton({
  action,
  message,
  children,
  variant = "ghost",
  size = "sm",
  className,
}: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
  variant?: Parameters<typeof buttonClass>[0] extends infer T
    ? T extends { variant?: infer V }
      ? V
      : never
    : never;
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cx(className)}
      disabled={pending}
      onClick={() => {
        if (confirm(message)) startTransition(() => void action());
      }}
    >
      {children}
    </Button>
  );
}
