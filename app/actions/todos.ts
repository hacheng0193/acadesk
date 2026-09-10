"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { today, toLocalIso } from "@/lib/dates";
import { str } from "./shared";

/** The list lives in the sidebar, so every page needs re-rendering. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function addTodo(fd: FormData) {
  const title = str(fd, "title");
  if (!title) return;
  const next = (
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM todos WHERE day = ?").get(today()) as {
      n: number;
    }
  ).n;
  db.prepare("INSERT INTO todos (day, title, sort_order) VALUES (?, ?, ?)").run(today(), title, next);
  refresh();
}

export async function toggleTodo(id: number) {
  db.prepare(
    `UPDATE todos SET done = 1 - done,
     completed_at = CASE WHEN done = 0 THEN ? ELSE NULL END
     WHERE id = ?`,
  ).run(toLocalIso(new Date()), id);
  refresh();
}

export async function renameTodo(id: number, title: string) {
  const clean = title.trim();
  if (!clean) return;
  db.prepare("UPDATE todos SET title = ? WHERE id = ?").run(clean, id);
  refresh();
}

export async function deleteTodo(id: number) {
  db.prepare("DELETE FROM todos WHERE id = ?").run(id);
  refresh();
}

/** Clear finished items off today's list without touching history. */
export async function clearDoneTodos() {
  db.prepare("DELETE FROM todos WHERE done = 1 AND day <= ?").run(today());
  refresh();
}
