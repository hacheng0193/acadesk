import { NextResponse } from "next/server";
import { lookup } from "@/lib/metadata";

export const dynamic = "force-dynamic";

/** Resolve a pasted DOI / arXiv id / BibTeX entry into paper fields. */
export async function POST(request: Request) {
  const { query } = (await request.json().catch(() => ({}))) as { query?: string };
  return NextResponse.json(await lookup(String(query ?? "")));
}
