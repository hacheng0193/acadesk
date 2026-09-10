import { deleteCourse, toggleArchiveCourse } from "@/app/actions/courses";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CourseForm } from "@/components/CourseForm";
import { Timetable } from "@/components/Timetable";
import { Badge, Card, Empty, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { listCourses, parseSlots } from "@/lib/queries/courses";
import { colorOf, WEEKDAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function CoursesPage() {
  const all = listCourses(true);
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const withSlots = active.map((c) => ({ ...c, slots: parseSlots(c.schedule_json) }));
  const credits = active.reduce((sum, c) => sum + c.credits, 0);

  return (
    <>
      <PageHeader
        title="課程"
        subtitle={`本學期 ${active.length} 門課　·　共 ${credits} 學分`}
        actions={
          <CourseForm trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增課程</span>} />
        }
      />

      {withSlots.some((c) => c.slots.length) ? (
        <Card className="mb-6 p-4">
          <SectionTitle title="週課表" />
          <Timetable courses={withSlots} />
        </Card>
      ) : null}

      {active.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {withSlots.map((course) => (
            <Card key={course.id} className="flex flex-col p-4">
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-1 h-8 w-1 shrink-0 rounded-full"
                  style={{ background: colorOf(course.color) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{course.name}</div>
                  <div className="mt-0.5 truncate text-xs text-dim">
                    {[course.code, course.instructor, `${course.credits} 學分`]
                      .filter(Boolean)
                      .join("　·　")}
                  </div>
                </div>
              </div>

              {course.slots.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {course.slots.map((s, i) => (
                    <Badge key={i}>
                      週{WEEKDAYS[s.day]} {s.start}–{s.end}
                      {s.room ? ` · ${s.room}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-1 border-t border-line pt-2">
                <CourseForm
                  course={course}
                  trigger={<span className={buttonClass({ variant: "ghost", size: "sm" })}>編輯</span>}
                />
                <ConfirmButton
                  action={async () => {
                    "use server";
                    await toggleArchiveCourse(course.id);
                  }}
                  message={`封存「${course.name}」？`}
                >
                  封存
                </ConfirmButton>
                <ConfirmButton
                  className="ml-auto text-danger"
                  action={async () => {
                    "use server";
                    await deleteCourse(course.id);
                  }}
                  message={`刪除「${course.name}」？該課程的作業會保留但失去課程標記。`}
                >
                  刪除
                </ConfirmButton>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>還沒有課程。新增課程後，作業就能掛在課程底下。</Empty>
      )}

      {archived.length ? (
        <div className="mt-8">
          <SectionTitle title="已封存" />
          <div className="flex flex-wrap gap-2">
            {archived.map((c) => (
              <ConfirmButton
                key={c.id}
                action={async () => {
                  "use server";
                  await toggleArchiveCourse(c.id);
                }}
                message={`取消封存「${c.name}」？`}
                variant="outline"
              >
                {c.name} · 取消封存
              </ConfirmButton>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
