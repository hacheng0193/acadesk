import Link from "next/link";
import { AssignmentRowItem } from "@/components/AssignmentRowItem";
import { CheckinButton } from "@/components/CheckinButton";
import { Badge, Card, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { addDays, formatHours, startOfWeek, today } from "@/lib/dates";
import { upcomingOccurrences } from "@/lib/queries/assignments";
import { coursesOnDay } from "@/lib/queries/courses";
import { recentNotes } from "@/lib/queries/notes";
import { activeMilestones, listLogs } from "@/lib/queries/research";
import { attendanceStreak, checkinFor, totalHours, weeklyGoal } from "@/lib/queries/time";
import { colorOf } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL = { experiment: "實驗", meeting: "Meeting", idea: "想法" } as const;

export default function Dashboard() {
  const day = today();
  const weekStart = startOfWeek(day);
  const weekday = (new Date(`${day}T12:00:00`).getDay() + 6) % 7;

  const todayHours = totalHours(day, day);
  const weekHours = totalHours(weekStart, addDays(weekStart, 6));
  const goal = weeklyGoal();
  const checkin = checkinFor(day);
  const streak = attendanceStreak();

  const upcoming = upcomingOccurrences(addDays(day, 7));
  const classes = coursesOnDay(weekday);
  const milestones = activeMilestones(5);
  const logs = listLogs({ limit: 4 });
  const notes = recentNotes(5);

  const greeting = new Date().getHours() < 12 ? "早安" : new Date().getHours() < 18 ? "午安" : "晚安";

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={`${day}　·　本週已投入 ${formatHours(weekHours)}${goal ? ` / 目標 ${goal} 小時` : ""}`}
        actions={<CheckinButton state={{ in: checkin?.check_in_at ?? null, out: checkin?.check_out_at ?? null }} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="今日時數" value={formatHours(todayHours)} />
        <Stat label="本週時數" value={formatHours(weekHours)} sub={goal ? `${Math.round((weekHours / goal) * 100)}% of ${goal}h` : undefined} />
        <Stat
          label="今日打卡"
          value={checkin ? checkin.check_in_at.slice(11, 16) : "—"}
          sub={checkin?.check_out_at ? `離開 ${checkin.check_out_at.slice(11, 16)}` : checkin ? "在實驗室" : "尚未進場"}
        />
        <Stat label="連續出勤" value={`${streak} 天`} />
      </div>

      {goal ? (
        <Card className="mb-6 p-4">
          <SectionTitle title="本週進度" hint={`${formatHours(weekHours)} / ${goal} 小時`} />
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width]"
              style={{ width: `${Math.min(100, (weekHours / goal) * 100)}%` }}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle
            title="接下來七天"
            action={<LinkButton href="/assignments" variant="ghost" size="sm">全部 →</LinkButton>}
          />
          {upcoming.length ? (
            <div className="divide-y divide-[var(--border)]">
              {upcoming.map((o) => (
                <AssignmentRowItem key={`${o.row.id}-${o.day}`} occurrence={o} />
              ))}
            </div>
          ) : (
            <Empty>七天內沒有排定的事項 🎉</Empty>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle title="今天的課" action={<LinkButton href="/courses" variant="ghost" size="sm">課表 →</LinkButton>} />
          {classes.length ? (
            <ul className="space-y-2">
              {classes.map(({ course, slot }, i) => (
                <li key={`${course.id}-${i}`} className="flex items-center gap-3 text-sm">
                  <span className="h-8 w-1 rounded-full" style={{ background: colorOf(course.color) }} />
                  <span className="font-mono text-xs tabular-nums text-dim">
                    {slot.start}–{slot.end}
                  </span>
                  <span className="flex-1 truncate">{course.name}</span>
                  {slot.room ? <Badge>{slot.room}</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>今天沒有課</Empty>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle title="進行中的里程碑" action={<LinkButton href="/research" variant="ghost" size="sm">研究 →</LinkButton>} />
          {milestones.length ? (
            <ul className="space-y-2.5">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(m.project_color) }} />
                  <Link href={`/research/${m.project_id}`} className="flex-1 truncate hover:underline">
                    {m.title}
                  </Link>
                  {m.status === "doing" ? <Badge tone="accent">進行中</Badge> : null}
                  <span className="shrink-0 text-xs tabular-nums text-dim">{m.target_date ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>還沒有里程碑</Empty>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle title="最近紀錄" action={<LinkButton href="/notes" variant="ghost" size="sm">筆記 →</LinkButton>} />
          {logs.length || notes.length ? (
            <ul className="space-y-2.5 text-sm">
              {logs.map((l) => (
                <li key={`log-${l.id}`} className="flex items-center gap-2.5">
                  <Badge tone="accent">{KIND_LABEL[l.kind]}</Badge>
                  <Link
                    href={l.project_id ? `/research/${l.project_id}` : "/research"}
                    className="flex-1 truncate hover:underline"
                  >
                    {l.title}
                  </Link>
                  <span className="shrink-0 text-xs tabular-nums text-dim">{l.occurred_on.slice(5)}</span>
                </li>
              ))}
              {notes.map((n) => (
                <li key={`note-${n.rel_path}`} className="flex items-center gap-2.5">
                  <Badge>筆記</Badge>
                  <Link
                    href={`/notes/${n.rel_path.split("/").map(encodeURIComponent).join("/")}`}
                    className="flex-1 truncate hover:underline"
                  >
                    {n.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>用 ⌘K 新增第一筆紀錄</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-dim">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-dim">{sub}</div> : null}
    </Card>
  );
}
