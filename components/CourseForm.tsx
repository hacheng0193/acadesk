"use client";

import { useRef, useState } from "react";
import { saveCourse } from "@/app/actions/courses";
import { COLORS, WEEKDAYS, colorOf, type Course, type Project, type Slot } from "@/lib/types";
import type { NtuCourse } from "@/lib/ntu-course";
import { NtuCourseImport } from "./NtuCourseImport";
import { Button, Field, cx, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

function parse(json: string): Slot[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function CourseForm({
  course,
  trigger,
  projects,
}: {
  course?: Course;
  trigger: React.ReactNode;
  projects: Project[];
}) {
  return (
    <Modal
      title={course ? "編輯課程" : "新增課程"}
      trigger={trigger}
      triggerClassName="contents"
      width="max-w-xl"
    >
      {(close) => <Inner course={course} projects={projects} close={close} />}
    </Modal>
  );
}

function Inner({
  course,
  projects,
  close,
}: {
  course?: Course;
  projects: Project[];
  close: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(course ? parse(course.schedule_json) : []);
  const [color, setColor] = useState(course?.color ?? "blue");
  const formRef = useRef<HTMLFormElement>(null);

  /** Text fields are uncontrolled, so fill them straight on the DOM nodes;
   *  slots are React state and replace whatever is there. */
  const fillFromNtu = (parsed: NtuCourse) => {
    const form = formRef.current;
    if (form) {
      const set = (name: string, value: string) => {
        const el = form.elements.namedItem(name);
        if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && value) {
          el.value = value;
        }
      };
      set("name", parsed.name);
      set("code", parsed.code);
      set("instructor", parsed.instructor);
      set("semester", parsed.semester);
      set("credits", parsed.credits !== null ? String(parsed.credits) : "");
    }
    if (parsed.slots.length) setSlots(parsed.slots);
  };

  return (
    <form ref={formRef} action={(fd) => saveCourse(fd).then(close)} className="space-y-3">
      {course ? <input type="hidden" name="id" value={course.id} /> : null}
      <NtuCourseImport onFill={fillFromNtu} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="課號">
          <input name="code" defaultValue={course?.code} className={inputClass} placeholder="CS5001" />
        </Field>
        <Field label="課名" className="col-span-2">
          <input name="name" defaultValue={course?.name} required autoFocus className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="授課教師">
          <input name="instructor" defaultValue={course?.instructor} className={inputClass} />
        </Field>
        <Field label="學分">
          <input name="credits" type="number" step="0.5" defaultValue={course?.credits ?? 3} className={inputClass} />
        </Field>
        <Field label="學期">
          <input name="semester" defaultValue={course?.semester} className={inputClass} placeholder="114-1" />
        </Field>
      </div>

      <Field
        label="研究主題"
        hint={
          course?.project_id
            ? "已連結，課程卡片與課表可以直接點過去"
            : "建立後，課程卡片與課表上就能直接連到研究頁面"
        }
      >
        <select
          name="project_choice"
          defaultValue={course?.project_id ? String(course.project_id) : course ? "" : "new"}
          className={inputClass}
        >
          <option value="new">建立同名研究主題</option>
          <option value="">不連結</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              連結到：{p.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="顏色">
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={cx(
                "h-6 w-6 rounded-full border-2 transition-transform",
                color === c ? "scale-110 border-ink" : "border-transparent",
              )}
              style={{ background: colorOf(c) }}
            />
          ))}
        </div>
        <input type="hidden" name="color" value={color} />
      </Field>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-dim">上課時段</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSlots([...slots, { day: 0, start: "09:00", end: "12:00", room: "" }])}
          >
            ＋ 新增時段
          </Button>
        </div>
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <select name="slot_day" defaultValue={slot.day} className={cx(inputClass, "w-20 shrink-0")}>
                {WEEKDAYS.map((d, idx) => (
                  <option key={idx} value={idx}>
                    週{d}
                  </option>
                ))}
              </select>
              <input type="time" name="slot_start" defaultValue={slot.start} className={cx(inputClass, "flex-1 min-w-0")} />
              <input type="time" name="slot_end" defaultValue={slot.end} className={cx(inputClass, "flex-1 min-w-0")} />
              <input name="slot_room" defaultValue={slot.room} placeholder="教室" className={cx(inputClass, "flex-1 min-w-0")} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                aria-label="移除時段"
              >
                ×
              </Button>
            </div>
          ))}
          {slots.length === 0 ? <p className="text-xs text-dim">尚未設定時段</p> : null}
        </div>
      </div>

      <ModalActions close={close} />
    </form>
  );
}
