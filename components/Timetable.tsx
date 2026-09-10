import { colorOf, WEEKDAYS, type Course, type Slot } from "@/lib/types";

const START_HOUR = 8;
const END_HOUR = 22;
const ROW_PX = 44;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}


type Placed = {
  courseId: number;
  name: string;
  color: string;
  slot: Slot;
  /** Column within its overlap cluster, and how many columns that cluster has. */
  column: number;
  columns: number;
};

/**
 * Lay out one weekday. Overlapping classes are put side by side rather than
 * stacked, or a course that clashes with another simply disappears behind it.
 */
function placeDay(courses: (Course & { slots: Slot[] })[], day: number): Placed[] {
  const entries = courses
    .flatMap((course) =>
      course.slots
        .filter((s) => s.day === day)
        .map((slot) => ({ courseId: course.id, name: course.name, color: course.color, slot })),
    )
    .sort((a, b) => minutes(a.slot.start) - minutes(b.slot.start));

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  // Columns are reused as soon as the class occupying one has finished.
  let columnEnds: number[] = [];

  const closeCluster = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const entry of entries) {
    const start = minutes(entry.slot.start);
    const end = minutes(entry.slot.end);
    if (cluster.length && start >= clusterEnd) closeCluster();

    let column = columnEnds.findIndex((e) => e <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    cluster.push({ ...entry, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  closeCluster();
  return placed;
}

/** Weekly grid. Positions each slot absolutely inside its weekday column. */
export function Timetable({ courses }: { courses: (Course & { slots: Slot[] })[] }) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const height = hours.length * ROW_PX;
  const top = (m: number) => ((m - START_HOUR * 60) / 60) * ROW_PX;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[680px]">
        <div className="w-12 shrink-0 pt-6">
          {hours.map((h) => (
            <div key={h} className="relative text-right" style={{ height: ROW_PX }}>
              <span className="absolute -top-1.5 right-2 font-mono text-[10px] text-dim">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7">
          {WEEKDAYS.map((label, day) => (
            <div key={day} className="border-l border-line first:border-l-0">
              <div className="pb-1 text-center text-xs font-medium text-dim">週{label}</div>
              <div className="relative" style={{ height }}>
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: i * ROW_PX }}
                  />
                ))}
                {placeDay(courses, day).map((p, i) => {
                  const y = top(minutes(p.slot.start));
                  const h = Math.max(22, top(minutes(p.slot.end)) - y);
                  const width = 100 / p.columns;
                  return (
                    <div
                      key={`${p.courseId}-${i}`}
                      className="absolute overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight text-white"
                      style={{
                        top: y,
                        height: h,
                        left: `calc(${p.column * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        background: colorOf(p.color),
                      }}
                      title={`${p.name} ${p.slot.start}–${p.slot.end}${
                        p.slot.room ? ` @${p.slot.room}` : ""
                      }`}
                    >
                      <div className="truncate font-medium">{p.name}</div>
                      {h > 36 ? (
                        <div className="truncate opacity-85">
                          {p.slot.start}–{p.slot.end}
                          {p.slot.room ? ` · ${p.slot.room}` : ""}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
