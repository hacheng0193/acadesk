"use client";

import { useTransition } from "react";
import { startTimer } from "@/app/actions/time";
import { Button } from "./ui";

export function StartTimerButton({
  projectId,
  courseId,
}: {
  projectId?: number;
  courseId?: number;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(() => void startTimer({ projectId: projectId ?? null, courseId: courseId ?? null }))
      }
      title="開始計時，若已有計時中的項目會先停止"
    >
      ▶ 開始計時
    </Button>
  );
}
