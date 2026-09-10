"use client";

import { useEffect, useState } from "react";
import { Button, buttonClass } from "./ui";
import { Modal } from "./ui/Modal";

const FEED_PATH = "/api/calendar.ics";

export function CalendarSubscribeHint() {
  const [copied, setCopied] = useState("");
  // Resolved after mount: the server has no idea which port the browser used,
  // and guessing here would be a hydration mismatch.
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const httpUrl = origin ? `${origin}${FEED_PATH}` : "";
  const webcalUrl = httpUrl.replace(/^https?:/, "webcal:");

  const copy = (value: string, which: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(""), 1800);
      },
      () => setCopied("failed"),
    );
  };

  return (
    <Modal
      title="訂閱到 Mac 行事曆"
      trigger={<span className={buttonClass({ variant: "outline" })}>接到行事曆</span>}
      triggerClassName="contents"
      width="max-w-xl"
    >
      {() => (
        <div className="space-y-4 text-sm">
          <p className="text-dim">
            行事曆 App「訂閱」這個網址之後，這裡的作業、考試、演講、週報與 meeting
            就會自動出現，每次更新也會跟著同步。
          </p>

          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              複製下面的網址
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs">
                  {webcalUrl || "…"}
                </code>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!webcalUrl}
                  onClick={() => copy(webcalUrl, "webcal")}
                >
                  {copied === "webcal" ? "已複製" : "複製"}
                </Button>
              </div>
            </li>
            <li>
              打開「行事曆」App → 選單列「檔案」→「新增行事曆訂閱項目…」
            </li>
            <li>貼上網址，按「訂閱」</li>
            <li>
              在設定視窗把「自動重新整理」設成 <strong>每 15 分鐘</strong>，
              「提醒事項」建議選「移除」（提醒由這個網站自己帶）
            </li>
          </ol>

          <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-dim">
            <p className="mb-1 font-medium text-ink">幾件要知道的事</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>這是<strong>單向</strong>的：這裡改了會同步過去，在行事曆 App 裡改不會回來。</li>
              <li>
                來源是本機服務，所以只有這台 Mac 讀得到，
                <strong>不會同步到 iPhone</strong>（除非之後把它放到有公開網址的地方）。
              </li>
              <li>服務沒開就抓不到資料；開機自動啟動已經設好，正常情況都會在。</li>
              <li>
                如果 webcal 開不起來，改用{" "}
                <button
                  type="button"
                  onClick={() => copy(httpUrl, "http")}
                  className="underline hover:text-ink"
                >
                  {copied === "http" ? "已複製 http 網址" : "http 網址"}
                </button>
                。
              </li>
            </ul>
          </div>

          {copied === "failed" ? (
            <p className="text-xs text-danger">複製失敗，請手動選取上面的網址。</p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
