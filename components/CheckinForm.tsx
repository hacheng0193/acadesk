"use client";

import { deleteCheckin, saveCheckin } from "@/app/actions/time";
import { today } from "@/lib/dates";
import type { Checkin } from "@/lib/types";
import { ConfirmButton } from "./ConfirmButton";
import { Field, inputClass } from "./ui";
import { Modal, ModalActions } from "./ui/Modal";

export function CheckinForm({ checkin, trigger }: { checkin?: Checkin; trigger: React.ReactNode }) {
  return (
    <Modal title={checkin ? "編輯打卡" : "補登打卡"} trigger={trigger} triggerClassName="contents">
      {(close) => (
        <form action={(fd) => saveCheckin(fd).then(close)} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="日期">
              <input
                type="date"
                name="day"
                defaultValue={checkin?.day ?? today()}
                readOnly={!!checkin}
                className={inputClass}
              />
            </Field>
            <Field label="進場">
              <input
                type="time"
                name="in_time"
                defaultValue={checkin?.check_in_at.slice(11, 16) ?? "09:00"}
                className={inputClass}
              />
            </Field>
            <Field label="離開" hint="可留空">
              <input
                type="time"
                name="out_time"
                defaultValue={checkin?.check_out_at?.slice(11, 16) ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
          <ModalActions
            close={close}
            extra={
              checkin ? (
                <ConfirmButton
                  className="mr-auto text-danger"
                  message={`刪除 ${checkin.day} 的打卡？`}
                  action={async () => {
                    await deleteCheckin(checkin.day);
                    close();
                  }}
                >
                  刪除
                </ConfirmButton>
              ) : null
            }
          />
        </form>
      )}
    </Modal>
  );
}
