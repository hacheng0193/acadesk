"use client";

import { useTransition } from "react";
import { checkIn, checkOut } from "@/app/actions/time";
import { Button } from "./ui";

export function CheckinButton({
  state,
}: {
  state: { in: string | null; out: string | null };
}) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<void>) => startTransition(() => void fn());

  if (!state.in) {
    return (
      <Button variant="primary" size="sm" disabled={pending} onClick={() => run(checkIn)}>
        進實驗室打卡
      </Button>
    );
  }
  if (!state.out) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(checkOut)}>
        下班打卡
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(checkIn)}>
      重新進場
    </Button>
  );
}
