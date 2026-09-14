import { db } from "../db";
import type { Milestone, Project } from "../types";

export function listProjects(): Project[] {
  return db
    .prepare(
      `SELECT * FROM projects
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, title`,
    )
    .all() as Project[];
}

export function getProject(id: number): Project | undefined {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
}

export function listMilestones(projectId: number): Milestone[] {
  return db
    .prepare(
      `SELECT * FROM milestones WHERE project_id = ?
       ORDER BY target_date IS NULL, target_date, sort_order, id`,
    )
    .all(projectId) as Milestone[];
}

export function activeMilestones(limit = 6): (Milestone & { project_title: string; project_color: string })[] {
  return db
    .prepare(
      `SELECT m.*, p.title AS project_title, p.color AS project_color
       FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE m.status != 'done' AND p.status = 'active'
       ORDER BY m.target_date IS NULL, m.target_date, m.sort_order LIMIT ?`,
    )
    .all(limit) as (Milestone & { project_title: string; project_color: string })[];
}

