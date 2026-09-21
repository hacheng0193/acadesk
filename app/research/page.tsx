import Link from "next/link";
import { BackupToggle } from "@/components/BackupToggle";
import { ProjectForm } from "@/components/ProjectForm";
import { Badge, Card, Empty, PageHeader, buttonClass, cx } from "@/components/ui";
import { formatHours } from "@/lib/dates";
import { listMilestones, listProjects } from "@/lib/queries/research";
import { projectHours } from "@/lib/queries/time";
import {
  PROJECT_KINDS,
  PROJECT_KIND_LABEL,
  colorOf,
  linkHost,
  parseLinks,
  type ProjectKind,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS = {
  active: { label: "進行中", tone: "ok" },
  paused: { label: "暫停", tone: "warn" },
  done: { label: "已完成", tone: "neutral" },
} as const;

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const all = listProjects();
  const active = PROJECT_KINDS.some((k) => k.key === kind) ? (kind as ProjectKind) : null;
  const projects = active ? all.filter((p) => p.kind === active) : all;

  const chips = [
    { key: null, label: "全部", count: all.length },
    ...PROJECT_KINDS.map((k) => ({
      key: k.key,
      label: k.label,
      count: all.filter((p) => p.kind === k.key).length,
    })),
  ];

  return (
    <>
      <PageHeader
        title="研究"
        subtitle={`${projects.filter((p) => p.status === "active").length} 個進行中的主題`}
        actions={
          <ProjectForm trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增主題</span>} />
        }
      />

      {all.length ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Link
              key={c.key ?? "all"}
              href={c.key ? `/research?kind=${c.key}` : "/research"}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                active === c.key
                  ? "border-transparent bg-[var(--accent)] text-white"
                  : "border-line text-dim hover:text-ink",
              )}
            >
              {c.label}
              <span className="ml-1 tabular-nums opacity-70">{c.count}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const milestones = listMilestones(p.id);
            const done = milestones.filter((m) => m.status === "done").length;
            const progress = milestones.length ? (done / milestones.length) * 100 : 0;
            const next = milestones.find((m) => m.status !== "done");
            const links = parseLinks(p.links_json);
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
                      <Badge>{PROJECT_KIND_LABEL[p.kind]}</Badge>
                      <BackupToggle
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

                {links.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {links.map((l, i) => (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="max-w-[12rem] truncate rounded-lg border border-line px-2 py-0.5 text-[11px] text-dim transition-colors hover:text-ink"
                      >
                        {l.label || linkHost(l.url)} ↗
                      </a>
                    ))}
                  </div>
                ) : null}

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
        <Empty>
          {active
            ? `沒有「${PROJECT_KIND_LABEL[active]}」類別的主題。`
            : "還沒有研究主題。新增後就能記錄里程碑、實驗日誌與投入時數。"}
        </Empty>
      )}
    </>
  );
}
