"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stopTimerAt } from "@/app/actions/time";
import { toLocalIso } from "@/lib/dates";
import { Button } from "./ui";
import { Modal } from "./ui/Modal";

const ACTIVITY = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
/** How long the "還在嗎" box waits before deciding you left. */
const GRACE_SECONDS = 120;

/**
 * "Are you still there?" for the case the server cannot see: the tab is open
 * and JavaScript is running, but nobody has touched anything for a while.
 *
 * Detection is event-driven, not polled, so it costs nothing while you work.
 */
export function IdlePrompt({ running, idleMinutes }: { running: boolean; idleMinutes: number }) {
  const [asking, setAsking] = useState(false);
  const [left, setLeft] = useState(GRACE_SECONDS);
  const lastActive = useRef(Date.now());
  const notified = useRef(false);

  const stopAtLastActivity = useCallback(() => {
    setAsking(false);
    void stopTimerAt(toLocalIso(new Date(lastActive.current)));
  }, []);

  // Watch for inactivity while a timer runs.
  useEffect(() => {
    if (!running) {
      setAsking(false);
      return;
    }
    const bump = () => {
      lastActive.current = Date.now();
      notified.current = false;
    };
    for (const e of ACTIVITY) window.addEventListener(e, bump, { passive: true });

    const check = setInterval(() => {
      if (asking) return;
      if (Date.now() - lastActive.current >= idleMinutes * 60_000) {
        setLeft(GRACE_SECONDS);
        setAsking(true);
      }
    }, 30_000);

    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, bump);
      clearInterval(check);
    };
  }, [running, idleMinutes, asking]);

  // A system notification reaches you even when the tab is in the background;
  // the dialog alone would go unseen there.
  useEffect(() => {
    if (!asking || notified.current) return;
    notified.current = true;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification("計時器還在跑", {
        body: `已經 ${idleMinutes} 分鐘沒有動作了，還在進行嗎？`,
        tag: "acadesk-idle",
      });
    } catch {
      // Some browsers throw for non-persistent notifications; the dialog covers us.
    }
  }, [asking, idleMinutes]);

  // Countdown; running out means we stop the timer at the last known activity.
  useEffect(() => {
    if (!asking) return;
    const id = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(id);
          stopAtLastActivity();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [asking, stopAtLastActivity]);

  const awayMinutes = Math.round((Date.now() - lastActive.current) / 60_000);

  return (
    <Modal
      title="還在進行嗎？"
      open={asking}
      onClose={() => setAsking(false)}
      width="max-w-sm"
    >
      {() => (
        <div className="space-y-3 text-sm">
          <p>
            計時器還在跑，但已經 <strong>{awayMinutes}</strong> 分鐘沒有動作了。
          </p>
          <p className="text-xs text-dim">
            {left} 秒後會自動把計時停在你最後一次操作的時間，不會多算離開的這段。
          </p>
          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={stopAtLastActivity}>
              我離開了，停止計時
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                lastActive.current = Date.now();
                setAsking(false);
              }}
            >
              還在，繼續計時
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
