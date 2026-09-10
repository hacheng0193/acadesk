import { AssignmentBoard, type BoardCard } from "@/components/AssignmentBoard";
import { AssignmentCalendar } from "@/components/AssignmentCalendar";
import { AssignmentForm } from "@/components/AssignmentForm";
import { CalendarSubscribeHint } from "@/components/CalendarSubscribeHint";
import { ViewToggle } from "@/components/ViewToggle";
import { Empty, PageHeader, buttonClass } from "@/components/ui";
import { addDays, today } from "@/lib/dates";
import {
  doneOccurrenceKeys,
  listAssignments,
  nextDateFor,
  occurrencesBetween,
  overdueCount,
} from "@/lib/queries/assignments";
import { listCourses } from "@/lib/queries/courses";

export const dynamic = "force-dynamic";

export default function AssignmentsPage() {
  const rows = listAssignments();
  const courses = listCourses();
  const doneKeys = doneOccurrenceKeys();

  const cards: BoardCard[] = rows.map((row) => {
    const nextDay = nextDateFor(row);
    return {
      row,
      nextDay,
      occurrenceDone: nextDay ? doneKeys.has(`${row.id}|${nextDay}`) : false,
    };
  });

  // A wide window so the calendar can page months without a server round trip.
  const day = today();
  const occurrences = occurrencesBetween(addDays(day, -200), addDays(day, 400));

  const open = cards.filter(
    (c) => !(c.row.repeat_rule === "none" ? c.row.status === "done" : c.occurrenceDone),
  ).length;
  const overdue = overdueCount();

  return (
    <>
      <PageHeader
        title="行程"
        subtitle={`${open} 件待辦${overdue ? `　·　${overdue} 件已逾期` : ""}`}
        actions={
          <>
            <CalendarSubscribeHint />
            <AssignmentForm
              courses={courses}
              trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增事項</span>}
            />
          </>
        }
      />

      {rows.length ? (
        <ViewToggle
          views={[
            { key: "board", label: "看板", node: <AssignmentBoard cards={cards} courses={courses} /> },
            {
              key: "calendar",
              label: "月曆",
              node: <AssignmentCalendar occurrences={occurrences} courses={courses} />,
            },
          ]}
        />
      ) : (
        <Empty>
          還沒有任何事項。作業、考試、演講、週報繳交、實驗室 meeting 都可以放進來，
          週報跟例會記得選「每週」重複。
        </Empty>
      )}
    </>
  );
}
