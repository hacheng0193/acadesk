"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { today } from "@/lib/dates";
import { COLORS, type Status } from "@/lib/types";
import { int, nullable, oneOf, str } from "./shared";

function refresh(projectId?: number | null) {
  revalidatePath("/research");
  if (projectId) revalidatePath(`/research/${projectId}`);
  revalidatePath("/");
}

export async function saveProject(fd: FormData) {
  const id = int(fd, "id");
  const f = {
    title: str(fd, "title") || "未命名主題",
    description_md: str(fd, "description_md"),
    status: oneOf(fd, "status", ["active", "paused", "done"] as const, "active"),
    advisor: str(fd, "advisor"),
    started_on: nullable(fd, "started_on"),
    color: oneOf(fd, "color", COLORS, "aqua"),
  };
  if (id) {
    db.prepare(
      `UPDATE projects SET title=@title, description_md=@description_md, status=@status,
       advisor=@advisor, started_on=@started_on, color=@color WHERE id=@id`,
    ).run({ ...f, id });
  } else {
    db.prepare(
      `INSERT INTO projects (title, description_md, status, advisor, started_on, color)
       VALUES (@title, @description_md, @status, @advisor, @started_on, @color)`,
    ).run(f);
  }
  refresh(id);
}

export async function deleteProject(id: number) {
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  revalidatePath("/research");
  revalidatePath("/");
}

export async function saveMilestone(fd: FormData) {
  const id = int(fd, "id");
  const projectId = int(fd, "project_id");
  if (!projectId) return;
  const f = {
    project_id: projectId,
    title: str(fd, "title") || "未命名里程碑",
    target_date: nullable(fd, "target_date"),
    status: oneOf<Status>(fd, "status", ["todo", "doing", "done"], "todo"),
  };
  if (id) {
    db.prepare(
      "UPDATE milestones SET title=@title, target_date=@target_date, status=@status WHERE id=@id",
    ).run({ ...f, id });
  } else {
    const next = (
      db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM milestones WHERE project_id = ?")
        .get(projectId) as { n: number }
    ).n;
    db.prepare(
      `INSERT INTO milestones (project_id, title, target_date, status, sort_order)
       VALUES (@project_id, @title, @target_date, @status, @sort_order)`,
    ).run({ ...f, sort_order: next });
  }
  refresh(projectId);
}

export async function cycleMilestone(id: number) {
  const row = db.prepare("SELECT project_id, status FROM milestones WHERE id = ?").get(id) as
    | { project_id: number; status: Status }
    | undefined;
  if (!row) return;
  const next: Status = row.status === "todo" ? "doing" : row.status === "doing" ? "done" : "todo";
  db.prepare("UPDATE milestones SET status = ? WHERE id = ?").run(next, id);
  refresh(row.project_id);
}

export async function deleteMilestone(id: number) {
  const row = db.prepare("SELECT project_id FROM milestones WHERE id = ?").get(id) as
    | { project_id: number }
    | undefined;
  db.prepare("DELETE FROM milestones WHERE id = ?").run(id);
  refresh(row?.project_id);
}

export async function saveLog(fd: FormData) {
  const id = int(fd, "id");
  const f = {
    project_id: int(fd, "project_id"),
    kind: oneOf(fd, "kind", ["experiment", "meeting", "idea"] as const, "experiment"),
    title: str(fd, "title") || "未命名紀錄",
    body_md: str(fd, "body_md"),
    occurred_on: str(fd, "occurred_on") || today(),
  };
  if (id) {
    db.prepare(
      `UPDATE log_entries SET project_id=@project_id, kind=@kind, title=@title,
       body_md=@body_md, occurred_on=@occurred_on WHERE id=@id`,
    ).run({ ...f, id });
  } else {
    db.prepare(
      `INSERT INTO log_entries (project_id, kind, title, body_md, occurred_on)
       VALUES (@project_id, @kind, @title, @body_md, @occurred_on)`,
    ).run(f);
  }
  refresh(f.project_id);
}

export async function deleteLog(id: number) {
  const row = db.prepare("SELECT project_id FROM log_entries WHERE id = ?").get(id) as
    | { project_id: number | null }
    | undefined;
  db.prepare("DELETE FROM log_entries WHERE id = ?").run(id);
  refresh(row?.project_id);
}

/**
 * Toggle whether a record may be included in the off-machine (GitHub) export.
 * Local snapshots always contain everything - this only governs what leaves.
 */
export async function setBackupEnabled(
  kind: "project" | "log",
  id: number,
  enabled: boolean,
) {
  const table = kind === "project" ? "projects" : "log_entries";
  db.prepare(`UPDATE ${table} SET backup_enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
  revalidatePath("/", "layout");
}
