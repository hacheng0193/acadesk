import { AttendanceHeatmap } from "@/components/charts/AttendanceHeatmap";
import { HoursBars } from "@/components/charts/HoursBars";
import { ProjectHoursBars } from "@/components/charts/ProjectHoursBars";
import { Card, Empty, PageHeader, SectionTitle } from "@/components/ui";
import { addDays, formatHours, startOfWeek, today } from "@/lib/dates";
import {
  attendanceStreak,
  checkinsBetween,
  dailyHours,
  hoursByProject,
  totalHours,
} from "@/lib/queries/time";

export const dynamic = "force-dynamic";

const WEEKS = 12;
const MONTHS = 6;

export default function StatsPage() {
  const day = today();
  const weekStart = startOfWeek(day);
  const heatFrom = addDays(weekStart, -7 * (WEEKS - 1));

  const daily = dailyHours(heatFrom, day);
  const hoursByDay = Object.fromEntries(daily);

  // Weekly totals for the same 12-week window the heatmap covers.
  const weeklyBars = Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(heatFrom, i * 7);
    const end = addDays(start, 6);
    let value = 0;
    for (let d = 0; d < 7; d++) value += daily.get(addDays(start, d)) ?? 0;
    return {
      key: start,
      label: `${start.slice(5)} – ${end.slice(5)}`,
      value,
      sublabel: i % 2 === 0 ? start.slice(5) : "",
    };
  });

  const monthlyBars = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(`${day.slice(0, 7)}-01T12:00:00`);
    d.setMonth(d.getMonth() - (MONTHS - 1 - i));
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return {
      key: month,
      label: month,
      value: totalHours(`${month}-01`, `${month}-${last}`),
      sublabel: month.slice(2),
    };
  });

  const byProject = hoursByProject(heatFrom, day);
  const checkins = checkinsBetween(heatFrom, day);
  const withOut = checkins.filter((c) => c.check_out_at);
  const avgStay =
    withOut.length > 0
      ? withOut.reduce(
          (sum, c) =>
            sum +
            (new Date(c.check_out_at!).getTime() - new Date(c.check_in_at).getTime()) / 3_600_000,
          0,
        ) / withOut.length
      : 0;

  const total = weeklyBars.reduce((s, b) => s + b.value, 0);
  const hasData = total > 0 || checkins.length > 0;

  return (
    <>
      <PageHeader title="統計" subtitle={`近 ${WEEKS} 週共投入 ${formatHours(total)}`} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="近 12 週總時數" value={formatHours(total)} />
        <Stat label="週平均" value={formatHours(total / WEEKS)} />
        <Stat label="出勤天數" value={`${checkins.length} 天`} sub={`平均在室 ${formatHours(avgStay)}`} />
        <Stat label="連續出勤" value={`${attendanceStreak()} 天`} />
      </div>

      {hasData ? (
        <div className="space-y-6">
          <Card className="p-4">
            <SectionTitle title="每週投入時數" hint={`${heatFrom} 起的 ${WEEKS} 週`} />
            <HoursBars bars={weeklyBars} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <SectionTitle title="每月投入時數" hint={`近 ${MONTHS} 個月`} />
              <HoursBars bars={monthlyBars} height={150} />
            </Card>

            <Card className="p-4">
              <SectionTitle title="時數分配" hint="依研究主題與課程" />
              {byProject.length ? (
                <ProjectHoursBars
                  slices={byProject.map((b) => ({ label: b.label, hours: b.hours, color: b.color }))}
                />
              ) : (
                <p className="text-xs text-dim">這段期間還沒有計時紀錄</p>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <SectionTitle title="每日熱區" hint="顏色越深代表當天投入越多" />
            <AttendanceHeatmap from={heatFrom} weeks={WEEKS} hoursByDay={hoursByDay} />
          </Card>
        </div>
      ) : (
        <Empty>還沒有足夠的資料。開始計時或打卡之後，這裡就會有圖表。</Empty>
      )}
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
