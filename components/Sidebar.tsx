import Link from "next/link";
import { overdueCount } from "@/lib/queries/assignments";
import { listCourses } from "@/lib/queries/courses";
import { listProjects } from "@/lib/queries/research";
import { idleMinutes, maxSessionHours, pendingReview, reapAbandonedSession } from "@/lib/idle";
import { runningSession } from "@/lib/queries/time";
import { todayTodos } from "@/lib/queries/todos";
import { AutoStopReport } from "./AutoStopReport";
import { IdlePrompt } from "./IdlePrompt";
import { NavLinks } from "./NavLinks";
import { QuickAdd } from "./QuickAdd";
import { ThemeToggle } from "./ThemeToggle";
import { TimerHeartbeat } from "./TimerHeartbeat";
import { TimerWidget, type TimerTarget } from "./TimerWidget";
import { TodoList } from "./TodoList";

export function Sidebar() {
  // Runs on every page render, so a session abandoned while the Mac slept is
  // closed the moment the user opens the app again.
  reapAbandonedSession();

  const projects = listProjects();
  const courses = listCourses();
  const running = runningSession();
  const todos = todayTodos();
  const review = pendingReview();

  const targets: TimerTarget[] = [
    ...projects
      .filter((p) => p.status !== "done")
      .map((p) => ({ key: `p:${p.id}`, label: p.title, color: p.color })),
    ...courses.map((c) => ({ key: `c:${c.id}`, label: `${c.name}（課程）`, color: c.color })),
  ];

  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface px-3 py-4">
      <Link href="/" className="flex items-center gap-2 px-1.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
          A
        </span>
        <span className="text-sm font-semibold tracking-tight">Acadesk</span>
      </Link>

      <QuickAdd projects={projects} courses={courses} />

      <NavLinks
        items={[
          { href: "/", label: "總覽", icon: "◎" },
          { href: "/assignments", label: "行程", icon: "✓", badge: overdueCount() },
          { href: "/courses", label: "課程", icon: "▤" },
          { href: "/research", label: "研究", icon: "✦" },
          { href: "/notes", label: "筆記", icon: "✎" },
          { href: "/papers", label: "文獻", icon: "❑" },
          { href: "/time", label: "時間", icon: "◷" },
          { href: "/stats", label: "統計", icon: "▦" },
        ]}
      />

      <div className="mt-auto space-y-3">
        <TodoList todos={todos} />
        <TimerWidget
          running={
            running
              ? {
                  started_at: running.started_at,
                  label: running.project_title ?? running.course_name ?? "未分類",
                  color: running.project_color ?? running.course_color ?? "none",
                }
              : null
          }
          targets={targets}
          maxHours={maxSessionHours()}
        />
        <TimerHeartbeat running={!!running} />
        <IdlePrompt running={!!running} idleMinutes={idleMinutes()} />
        {review ? <AutoStopReport review={review} /> : null}
        <div className="flex items-center justify-between px-1">
          <Link href="/settings" className="text-xs text-dim hover:text-ink">
            設定
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
