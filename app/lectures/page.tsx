import Link from "next/link";
import { coolPanelState } from "@/app/actions/cool";
import { CoolSyncPanel } from "@/components/CoolSyncPanel";
import { LectureBrowser } from "@/components/LectureBrowser";
import { Empty, PageHeader, cx } from "@/components/ui";
import { lectureFiles } from "@/lib/cool";
import { colorOf } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LecturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const courseId = Number(sp.course) || null;
  const showIgnored = sp.ignored === "1";
  const { courses, files } = lectureFiles();
  const cool = await coolPanelState();

  const shown = courseId ? courses.filter((c) => c.id === courseId) : courses;
  const downloaded = files.filter((f) => f.status === "downloaded").length;
  const fresh = files.filter((f) => f.status === "new").length;

  const href = (params: { course?: number | null; ignored?: boolean }) => {
    const q = new URLSearchParams();
    const c = params.course === undefined ? courseId : params.course;
    const ig = params.ignored ?? showIgnored;
    if (c) q.set("course", String(c));
    if (ig) q.set("ignored", "1");
    const s = q.toString();
    return s ? `/lectures?${s}` : "/lectures";
  };

  return (
    <>
      <PageHeader
        title="講義"
        subtitle={`已下載 ${downloaded} 個　·　COOL 上新的 ${fresh} 個`}
        actions={<CoolSyncPanel initial={cool} />}
      />

      {courses.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <FilterChip href={href({ course: null })} active={!courseId}>
              全部
            </FilterChip>
            {courses.map((c) => (
              <FilterChip key={c.id} href={href({ course: c.id })} active={courseId === c.id}>
                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(c.color) }} />
                {c.name}
              </FilterChip>
            ))}
            <Link
              href={href({ ignored: !showIgnored })}
              className="ml-auto text-xs text-dim hover:text-ink"
            >
              {showIgnored ? "隱藏已略過" : "顯示已略過"}
            </Link>
          </div>

          <LectureBrowser
            courses={shown}
            files={files.filter((f) => shown.some((c) => c.id === f.course_id))}
            showIgnored={showIgnored}
          />
        </>
      ) : (
        <Empty>
          還沒有講義。先在課程頁按「同步 NTU COOL」，課程對應到 COOL 後，模組裡的檔案就會列在這裡。
        </Empty>
      )}
    </>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-transparent bg-accent-soft font-medium text-[var(--accent)]"
          : "border-line text-dim hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
