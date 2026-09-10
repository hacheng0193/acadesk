import { NextResponse } from "next/server";
import { listNotes } from "@/lib/vault";

/** Fuzzy-ish note search used by the link picker. Filenames only - fast enough
 *  for a personal vault without maintaining a full-text index. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!q) return NextResponse.json({ results: [] });
  const results = listNotes()
    .filter((f) => f.title.toLowerCase().includes(q) || f.rel.toLowerCase().includes(q))
    .slice(0, 20)
    .map((f) => ({ rel: f.rel, title: f.title }));
  return NextResponse.json({ results });
}
