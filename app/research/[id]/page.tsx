import Link from "next/link";
import { notFound } from "next/navigation";
import { BackupToggle } from "@/components/BackupToggle";
import { LogForm } from "@/components/LogForm";
import { Markdown } from "@/components/Markdown";
import { MilestoneTimeline } from "@/components/MilestoneTimeline";
import { NewNoteButton } from "@/components/NewNoteButton";
import { NoteLinkPicker } from "@/components/NoteLinkPicker";
import { ProjectForm } from "@/components/ProjectForm";
import { StartTimerButton } from "@/components/StartTimerButton";
import { Badge, Card, Empty, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { formatHours } from "@/lib/dates";
import { foldersFor, notesFor } from "@/lib/queries/notes";
import { papersForProject } from "@/lib/queries/papers";
import { defaultLogFolder, logsFor } from "@/lib/queries/logs";
import { getProject, listMilestones, listProjects } from "@/lib/queries/research";
import { projectHours } from "@/lib/queries/time";
import { LOG_KIND, colorOf } from "@/lib/types";
import { listFolders } from "@/lib/vault";

export const dynamic = "force-dynamic";

/** Entries shown before "show all" - the page is for scanning, the note for reading. */
const LOG_PAGE = 10;

function noteHref(rel: string, project: { id: number; title: string }): string {
  const q = new URLSearchParams({ from: `/research/${project.id}`, fromLabel: project.title });
  return `/notes/${rel.split("/").map(encodeURIComponent).join("/")}?${q}`;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const showAll = (await searchParams).logs === "all";
  const project = getProject(Number(id));
  if (!project) notFound();

  const milestones = listMilestones(project.id);
  const logs = logsFor(project.id);
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
              id={project.id}
              enabled={!!project.backup_enabled}
              label={project.title}
            />
            <StartTimerButton projectId={project.id} />
            <LogForm
              projects={allProjects.map((p) => ({ id: p.id, title: p.title, folder: defaultLogFolder(p) }))}
              defaultProjectId={project.id}
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
            <>
              <ul className="space-y-2">
                {(showAll ? logs : logs.slice(0, LOG_PAGE)).map((log) => (
                  <li key={log.rel_path}>
                    <Link
                      href={noteHref(log.rel_path, project)}
                      className="block rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-[var(--accent)]"
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={LOG_KIND[log.kind].tone}>{LOG_KIND[log.kind].label}</Badge>
                        <span className="flex-1 truncate text-sm font-medium">{log.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-dim">{log.date}</span>
                      </div>
                      {log.preview ? (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-dim">{log.preview}</p>
                      ) : null}
                      <p className="mt-1.5 truncate font-mono text-[10px] text-dim/70">{log.rel_path}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              {logs.length > LOG_PAGE ? (
                <Link
                  href={showAll ? `/research/${project.id}` : `/research/${project.id}?logs=all`}
                  scroll={false}
                  className="mt-3 inline-block text-xs text-dim hover:text-ink"
                >
                  {showAll ? "收合" : `顯示全部 ${logs.length} 筆`}
                </Link>
              ) : null}
            </>
          ) : (
            <Empty>
              還沒有紀錄。做完實驗或開完會就順手記一筆 — 會存成 vault 裡的筆記（
              <code className="font-mono">{defaultLogFolder(project)}/</code>）。
            </Empty>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <SectionTitle title="里程碑" />
            <MilestoneTimeline projectId={project.id} milestones={milestones} />
          </Card>

          <Card className="p-4">
            <SectionTitle
              title="相關筆記"
              action={
                <NewNoteButton
                  entityType="project"
                  entityId={project.id}
                  folders={noteFolders}
                  vaultFolders={vaultFolders}
                  backTo={{ href: `/research/${project.id}`, label: project.title }}
                />
              }
            />
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
