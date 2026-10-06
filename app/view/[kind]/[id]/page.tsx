import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileViewerActions } from "@/components/FileViewerActions";
import { PdfViewer } from "@/components/PdfViewer";
import { Empty, PageHeader } from "@/components/ui";
import { localCoolFile } from "@/lib/cool";
import { db } from "@/lib/db";
import { resolveInLibrary } from "@/lib/papers-library";
import fs from "node:fs";

export const dynamic = "force-dynamic";

const IMAGES = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

type Target = {
  title: string;
  /** Raw bytes; the viewer reads from here. */
  src: string;
  /** Whether a local copy exists for "open in Preview". */
  local: boolean;
  back: { href: string; label: string };
  externalUrl?: string;
};

function coolTarget(id: number): Target | null {
  const row = db
    .prepare(
      `SELECT f.title, f.html_url, f.course_id, c.name AS course_name
       FROM cool_files f JOIN courses c ON c.id = f.course_id WHERE f.cool_file_id = ?`,
    )
    .get(id) as { title: string; html_url: string; course_id: number; course_name: string } | undefined;
  if (!row) return null;
  return {
    title: row.title,
    src: `/api/cool/files/${id}`,
    local: !!localCoolFile(id),
    back: { href: `/lectures?course=${row.course_id}`, label: `${row.course_name}的講義` },
    externalUrl: row.html_url || undefined,
  };
}

function paperTarget(id: number): Target | null {
  const row = db.prepare("SELECT title, file_path FROM papers WHERE id = ?").get(id) as
    | { title: string; file_path: string }
    | undefined;
  if (!row?.file_path) return null;
  let local = false;
  try {
    local = fs.existsSync(resolveInLibrary(row.file_path));
  } catch {
    local = false;
  }
  return {
    title: row.title,
    src: `/api/papers/${id}/file`,
    local,
    back: { href: "/papers", label: "文獻" },
  };
}

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { kind, id } = await params;
  const from = (await searchParams).from;
  const n = Number(id);
  const target = kind === "cool" ? coolTarget(n) : kind === "paper" ? paperTarget(n) : null;
  if (!target) notFound();

  // Only same-site paths, so the back link can't be pointed elsewhere.
  const back =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//")
      ? { href: from, label: "返回" }
      : target.back;
  const ext = kind === "paper" ? ".pdf" : path.extname(target.title).toLowerCase();

  return (
    <>
      <Link href={back.href} className="mb-3 inline-block text-xs text-dim hover:text-ink">
        ← {back.label}
      </Link>
      <PageHeader
        title={target.title}
        actions={
          <FileViewerActions
            kind={kind as "cool" | "paper"}
            id={n}
            src={target.src}
            local={target.local}
            externalUrl={target.externalUrl}
          />
        }
      />
      {ext === ".pdf" ? (
        <PdfViewer src={target.src} />
      ) : IMAGES.has(ext) ? (
        <div className="overflow-auto rounded-xl border border-line bg-surface-2 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={target.src} alt={target.title} className="mx-auto max-w-full" />
        </div>
      ) : (
        <Empty>
          這種檔案（{ext || "無副檔名"}）沒辦法在這裡預覽。
          {target.local ? "可以用「預覽程式」按鈕用 Mac 上的 App 開啟。" : "先下載，或在 COOL 上開啟。"}
        </Empty>
      )}
    </>
  );
}
