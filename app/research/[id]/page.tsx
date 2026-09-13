import Link from "next/link";
import { notFound } from "next/navigation";
import { BackupToggle } from "@/components/BackupToggle";
import { LogForm } from "@/components/LogForm";
import { Markdown } from "@/components/Markdown";
import { MilestoneTimeline } from "@/components/MilestoneTimeline";
import { NoteLinkPicker } from "@/components/NoteLinkPicker";
import { ProjectForm } from "@/components/ProjectForm";
import { StartTimerButton } from "@/components/StartTimerButton";
import { Badge, Card, Empty, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { formatHours } from "@/lib/dates";
import { foldersFor, notesFor } from "@/lib/queries/notes";
import { papersForProject } from "@/lib/queries/papers";
import { getProject, listLogs, listMilestones, listProjects } from "@/lib/queries/research";
import { projectHours } from "@/lib/queries/time";
import { colorOf } from "@/lib/types";
import { listFolders } from "@/lib/vault";

export const dynamic = "force-dynamic";

const KIND = {
  experiment: { label: "實驗", tone: "accent" },
  meeting: { label: "Meeting", tone: "warn" },
  idea: { label: "想法", tone: "neutral" },
} as const;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(Number(id));
  if (!project) notFound();

  const milestones = listMilestones(project.id);
  const logs = listLogs({ projectId: project.id, limit: 100 });
  const papers = papersForProject(project.id);
  const notes = notesFor("project", project.id);
  const noteFolders = foldersFor("project", project.id);
  const vaultFolders = listFolders();
  const hours = projectHours(project.id);
  const allProjects = listProjects();

  return (
    <>
      <Link href="/research" className="mb-3 inline-block text-xs text-dim hover:text-ink">
        ← 研究
      </Link>
      <PageHeader
        title={project.title}
        subtitle={
          [
            project.advisor && `指導：${project.advisor}`,
            project.started_on && `始於 ${project.started_on}`,
            `累計投入 ${formatHours(hours)}`,
          ]
            .filter(Boolean)
            .join("　·　")
        }
        actions={
          <>
            <BackupToggle
              kind="project"
              id={project.id}
              enabled={!!project.backup_enabled}
              label={project.title}
            />
            <StartTimerButton projectId={project.id} />
            <LogForm
              projects={allProjects}
              defaultProjectId={project.id}
              trigger={<span className={buttonClass({ variant: "primary" })}>＋ 新增紀錄</span>}
            />
            <ProjectForm
              project={project}
              trigger={<span className={buttonClass({ variant: "outline" })}>編輯</span>}
            />
          </>
        }
      />

      {project.description_md ? (
        <Card className="mb-6 p-4">
          <Markdown>{project.description_md}</Markdown>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionTitle title="研究日誌" hint={`${logs.length} 筆`} />
          {logs.length ? (
            <div className="space-y-3">
              {logs.map((log) => (
                <Card key={log.id} className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge tone={KIND[log.kind].tone}>{KIND[log.kind].label}</Badge>
                    <LogForm
                      log={log}
                      projects={allProjects}
                      trigger={<span className="flex-1 cursor-pointer truncate text-sm font-medium hover:underline">{log.title}</span>}
                    />
                    <BackupToggle
                      kind="log"
                      id={log.id}
                      enabled={!!log.backup_enabled}
                      label={log.title}
                      inheritedOff={!project.backup_enabled}
                    />
                    <span className="shrink-0 text-xs tabular-nums text-dim">{log.occurred_on}</span>
                  </div>
                  {log.body_md ? (
                    <div className="mt-2 border-t border-line pt-2">
                      <Markdown>{log.body_md}</Markdown>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          ) : (
            <Empty>還沒有紀錄。做完實驗或開完會就順手記一筆。</Empty>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <SectionTitle title="里程碑" />
            <MilestoneTimeline projectId={project.id} milestones={milestones} />
          </Card>

          <Card className="p-4">
            <SectionTitle title="相關筆記" />
            <NoteLinkPicker
              entityType="project"
              entityId={project.id}
              linked={notes}
              folders={noteFolders}
              vaultFolders={vaultFolders}
              backTo={{ href: `/research/${project.id}`, label: project.title }}
            />
          </Card>

          <Card className="p-4">
            <SectionTitle title="相關論文" hint={`${papers.length} 篇`} />
            {papers.length ? (
              <ul className="space-y-2 text-sm">
                {papers.map((p) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: colorOf(project.color) }}
                    />
                    <Link href="/papers" className="flex-1 hover:underline">
                      {p.title}
                      {p.year ? <span className="text-dim">（{p.year}）</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-dim">在「文獻」頁把論文關聯到這個主題。</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
