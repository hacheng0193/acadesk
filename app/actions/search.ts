"use server";

import { rebuildIndex } from "@/lib/search";

/** One-off repair for databases created before the index existed. */
export async function rebuildSearchIndex() {
  rebuildIndex();
}
