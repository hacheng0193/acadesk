import { CheckinButton } from "@/components/CheckinButton";
import { CheckinForm } from "@/components/CheckinForm";
import { SessionForm } from "@/components/SessionForm";
import { Badge, Card, Empty, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { addDays, formatHours, startOfWeek, today } from "@/lib/dates";
import { listCourses } from "@/lib/queries/courses";
import { listProjects } from "@/lib/queries/research";
import {
  checkinFor,
  checkinHours,
  checkinsBetween,
  recentSessions,
  sessionSeconds,
  totalHours,
} from "@/lib/queries/time";
import { colorOf } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function TimePage() {
  const day = today();
  const weekStart = startOfWeek(day);
  const projects = listProjects();
  const courses = listCourses();
  const sessions = recentSessions(80);
  const checkins = checkinsBetween(addDays(day, -60), day);
  const checkin = checkinFor(day);

  return (
    <>
      <PageHeader
        title="時間"
        subtitle={`今日 ${formatHours(totalHours(day, day))}　·　本週 ${formatHours(
          totalHours(weekStart, addDays(weekStart, 6)),
        )}`}
        actions={
          <>
            <CheckinButton
              state={{ in: checkin?.check_in_at ?? null, out: checkin?.check_out_at ?? null }}
            />
            <SessionForm
              projects={projects}
              courses={courses}
              trigger={<span className={buttonClass({ variant: "primary" })}>＋ 補登時段</span>}
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <SectionTitle title="計時紀錄" hint="點擊任一列可編輯" />
          {sessions.length ? (
            <div className="divide-y divide-[var(--border)]">
              {sessions.map((s) => (
                <SessionForm
                  key={s.id}
                  session={s}
                  projects={projects}
                  courses={courses}
                  trigger={
                    <div className="flex w-full cursor-pointer items-center gap-3 py-2 text-left text-sm hover:bg-surface-2">
                      <span
                        className="h-6 w-1 shrink-0 rounded-full"
                        style={{ background: colorOf(s.project_color ?? s.course_color) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          {s.project_title ?? s.course_name ?? "未分類"}
                          {s.note ? <span className="text-dim">　{s.note}</span> : null}
                        </div>
                        <div className="text-xs tabular-nums text-dim">
                          {s.started_at.slice(0, 16).replace("T", " ")} –{" "}
                          {s.ended_at ? s.ended_at.slice(11, 16) : "計時中"}
                        </div>
                      </div>
                      {s.source === "manual" ? <Badge>補登</Badge> : null}
                      {!s.ended_at ? <Badge tone="accent">進行中</Badge> : null}
                      <span className="shrink-0 tabular-nums text-dim">
                        {formatHours(sessionSeconds(s) / 3600)}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <Empty>還沒有計時紀錄。用側欄的計時器開始，或補登一段時間。</Empty>
          )}
        </Card>

        <Card className="h-fit p-4">
          <SectionTitle
            title="出勤打卡"
            action={
              <CheckinForm
                trigger={<span className={buttonClass({ variant: "ghost", size: "sm" })}>補登</span>}
              />
            }
          />
          {checkins.length ? (
            <div className="divide-y divide-[var(--border)]">
              {checkins.map((c) => (
                <CheckinForm
                  key={c.id}
                  checkin={c}
                  trigger={
                    <div className="flex w-full cursor-pointer items-center gap-2 py-2 text-left text-sm hover:bg-surface-2">
                      <span className="tabular-nums text-dim">{c.day.slice(5)}</span>
                      <span className="flex-1 tabular-nums">
                        {c.check_in_at.slice(11, 16)} – {c.check_out_at?.slice(11, 16) ?? "…"}
                      </span>
                      <span className="tabular-nums text-dim">
                        {c.check_out_at ? formatHours(checkinHours(c)) : "在場"}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <Empty>近 60 天沒有打卡紀錄</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
