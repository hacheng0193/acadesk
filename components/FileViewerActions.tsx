"use client";

import { useState, useTransition } from "react";
import { openCoolFileInApp, revealCoolFile } from "@/app/actions/cool";
import { openPdfInApp, revealPdf } from "@/app/actions/papers";
import { Button, buttonClass } from "./ui";

/** Header buttons on the file viewer: open in the Mac's own app, Finder, raw download, COOL. */
export function FileViewerActions({
  kind,
  id,
  src,
  local,
  externalUrl,
}: {
  kind: "cool" | "paper";
  id: number;
  src: string;
  local: boolean;
  externalUrl?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const run = (action: (id: number) => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError("");
      const r = await action(id);
      if (!r.ok) setError(r.error ?? "無法開啟");
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {local ? (
        <>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(kind === "cool" ? openCoolFileInApp : openPdfInApp)}
          >
            預覽程式
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(kind === "cool" ? revealCoolFile : revealPdf)}>
            Finder
          </Button>
        </>
      ) : null}
      <a href={src} download className={buttonClass({ variant: "ghost" })}>
        下載
      </a>
      {externalUrl ? (
        <a href={externalUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "ghost" })}>
          在 COOL 開啟
        </a>
      ) : null}
    </div>
  );
}
