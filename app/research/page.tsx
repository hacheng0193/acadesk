import Link from "next/link";
import { BackupToggle } from "@/components/BackupToggle";
import { ProjectForm } from "@/components/ProjectForm";
import { Badge, Card, Empty, PageHeader, buttonClass } from "@/components/ui";
import { formatHours } from "@/lib/dates";
import { listMilestones, listProjects } from "@/lib/queries/research";
import { projectHours } from "@/lib/queries/time";
import { colorOf } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS = {
  active: { label: "進行中", tone: "ok" },
  paused: { label: "暫停", tone: "warn" },
  done: { label: "已完成", tone: "neutral" },
} as const;

export default function ResearchPage() {
  const projects = listProjects();

  return (
    <>
      <PageHeader
        title="研究"
        subtitle={`${projects.filter((p) => p.status === "active").length} 個進行中的主題`}
        actions={
          <ProjectForm trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增主題</span>} />
        }
      />

      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const milestones = listMilestones(p.id);
            const done = milestones.filter((m) => m.status === "done").length;
            const progress = milestones.length ? (done / milestones.length) * 100 : 0;
            const next = milestones.find((m) => m.status !== "done");
            return (
              <Card key={p.id} className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-10 w-1 shrink-0 rounded-full"
                    style={{ background: colorOf(p.color) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/research/${p.id}`} className="truncate font-medium hover:underline">
                        {p.title}
                      </Link>
                      <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                      <BackupToggle
                        kind="project"
                        id={p.id}
                        enabled={!!p.backup_enabled}
                        label={p.title}
                      />
                    </div>
                    <div className="mt-0.5 text-xs text-dim">
                      {[p.advisor && `指導：${p.advisor}`, p.started_on && `始於 ${p.started_on}`]
                        .filter(Boolean)
                        .join("　·　") || "尚未填寫細節"}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px] text-dim">
                    <span>里程碑 {done}/{milestones.length}</span>
                    <span className="tabular-nums">投入 {formatHours(projectHours(p.id))}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${progress}%`, background: colorOf(p.color) }}
                    />
                  </div>
                </div>

                {next ? (
                  <div className="mt-3 truncate text-xs text-dim">
                    下一步：<span className="text-ink">{next.title}</span>
                    {next.target_date ? `　·　${next.target_date}` : ""}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>還沒有研究主題。新增後就能記錄里程碑、實驗日誌與投入時數。</Empty>
      )}
    </>
  );
}
