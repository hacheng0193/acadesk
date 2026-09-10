"use client";

import { useEffect, useRef } from "react";

const PING_URL = "/api/timer/ping";
const PERIOD_MS = 10 * 60_000;

/**
 * Proof-of-life for a running timer.
 *
 * Deliberately quiet: nothing is sent unless a timer is actually running AND the
 * tab is visible, so the common case costs zero background traffic and zero
 * battery. The periodic ping is only a backstop for hard failures (power loss,
 * crash) - the precise timestamps come from the beacons sent the moment the tab
 * is hidden or unloaded, which covers closing the lid or the tab.
 */
export function TimerHeartbeat({ running }: { running: boolean }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;

    const ping = () => {
      // keepalive lets the request outlive a tab that is going away.
      fetch(PING_URL, { method: "POST", keepalive: true }).catch(() => {});
    };
    const beacon = () => {
      if (!navigator.sendBeacon?.(PING_URL)) ping();
    };

    const start = () => {
      if (timer.current) return;
      ping();
      timer.current = setInterval(ping, PERIOD_MS);
    };
    const stop = () => {
      if (!timer.current) return;
      clearInterval(timer.current);
      timer.current = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        // Record the exact moment of leaving, then go silent.
        beacon();
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", beacon);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", beacon);
    };
  }, [running]);

  return null;
}
