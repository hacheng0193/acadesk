import Link from "next/link";
import { overdueCount } from "@/lib/queries/assignments";
import { listCourses } from "@/lib/queries/courses";
import { defaultLogFolder } from "@/lib/queries/logs";
import { listProjects } from "@/lib/queries/research";
import { idleMinutes, maxSessionHours, pendingReview, reapAbandonedSession } from "@/lib/idle";
import { runningSession } from "@/lib/queries/time";
import { todayTodos } from "@/lib/queries/todos";
import { AutoStopReport } from "./AutoStopReport";
import { IdlePrompt } from "./IdlePrompt";
import { NavLinks } from "./NavLinks";
import { QuickAdd } from "./QuickAdd";
import { SidebarToggle } from "./SidebarToggle";
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
    <aside className="sidebar flex h-dvh shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto border-r border-line bg-surface px-3 py-4">
      <div className="sb-head flex items-center gap-2">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2 px-1.5" title="Acadesk">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
            A
          </span>
          <span className="sb-label text-sm font-semibold tracking-tight">Acadesk</span>
        </Link>
        <SidebarToggle />
      </div>

      <QuickAdd
        projects={projects}
        courses={courses}
        logTargets={projects
          .filter((p) => p.status !== "done")
          .map((p) => ({ id: p.id, title: p.title, folder: defaultLogFolder(p) }))}
      />

      <NavLinks
        items={[
          { href: "/", label: "總覽", icon: "◎" },
          { href: "/assignments", label: "行程", icon: "✓", badge: overdueCount() },
          { href: "/courses", label: "課程", icon: "▤" },
          { href: "/lectures", label: "講義", icon: "▣" },
          { href: "/research", label: "研究", icon: "✦" },
          { href: "/notes", label: "筆記", icon: "✎" },
          { href: "/papers", label: "文獻", icon: "❑" },
          { href: "/reviews", label: "文獻回顧", icon: "▥" },
          { href: "/time", label: "時間", icon: "◷" },
          { href: "/stats", label: "統計", icon: "▦" },
        ]}
      />

      <div className="mt-auto space-y-3">
        {/* Collapsed, the widgets shrink to a timer link; they come back on expand. */}
        <Link
          href="/time"
          title={running ? `計時中：${running.project_title ?? running.course_name ?? "未分類"}` : "時間"}
          className="sb-mini relative mx-auto grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-surface-2 hover:text-ink"
        >
          ⏱
          {running ? (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          ) : null}
        </Link>
        <div className="sb-full">
          <TodoList todos={todos} />
        </div>
        <div className="sb-full">
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
        </div>
        <TimerHeartbeat running={!!running} />
        <IdlePrompt running={!!running} idleMinutes={idleMinutes()} />
        {review ? <AutoStopReport review={review} /> : null}
        <div className="sb-foot flex items-center justify-between px-1">
          <Link href="/settings" className="text-xs text-dim hover:text-ink" title="設定">
            <span className="sb-label">設定</span>
            <span className="sb-mini text-sm">⚙</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
