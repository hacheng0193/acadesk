"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { Slot } from "@/lib/types";
import { int, num, oneOf, str } from "./shared";

/** Slots arrive as parallel arrays from the repeatable rows in the course form. */
function readSlots(fd: FormData): Slot[] {
  const days = fd.getAll("slot_day").map(String);
  const starts = fd.getAll("slot_start").map(String);
  const ends = fd.getAll("slot_end").map(String);
  const rooms = fd.getAll("slot_room").map(String);
  const slots: Slot[] = [];
  for (let i = 0; i < days.length; i++) {
    if (!starts[i] || !ends[i]) continue;
    slots.push({
      day: Math.min(6, Math.max(0, Number(days[i]) || 0)),
      start: starts[i],
      end: ends[i],
      room: (rooms[i] ?? "").trim(),
    });
  }
  return slots;
}

function fields(fd: FormData) {
  return {
    code: str(fd, "code"),
    name: str(fd, "name") || "未命名課程",
    instructor: str(fd, "instructor"),
    credits: num(fd, "credits") ?? 3,
    semester: str(fd, "semester"),
    color: oneOf(fd, "color", ["indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "orange"], "indigo"),
    schedule_json: JSON.stringify(readSlots(fd)),
  };
}

export async function saveCourse(fd: FormData) {
  const id = int(fd, "id");
  const f = fields(fd);
  if (id) {
    db.prepare(
      `UPDATE courses SET code=@code, name=@name, instructor=@instructor, credits=@credits,
       semester=@semester, color=@color, schedule_json=@schedule_json WHERE id=@id`,
    ).run({ ...f, id });
  } else {
    db.prepare(
      `INSERT INTO courses (code, name, instructor, credits, semester, color, schedule_json)
       VALUES (@code, @name, @instructor, @credits, @semester, @color, @schedule_json)`,
    ).run(f);
  }
  revalidatePath("/courses");
  revalidatePath("/");
}

export async function toggleArchiveCourse(id: number) {
  db.prepare("UPDATE courses SET archived = 1 - archived WHERE id = ?").run(id);
  revalidatePath("/courses");
}

export async function deleteCourse(id: number) {
  db.prepare("DELETE FROM courses WHERE id = ?").run(id);
  revalidatePath("/courses");
  revalidatePath("/assignments");
}
