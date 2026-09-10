import { renderMarkdown } from "@/lib/markdown";
import { cx } from "./ui";

export function Markdown({
  children,
  className,
  resolveWikilink,
  stripFrontmatter,
}: {
  children: string;
  className?: string;
  resolveWikilink?: (name: string) => string | null;
  stripFrontmatter?: boolean;
}) {
  if (!children.trim()) return null;
  return (
    <div
      className={cx("prose-note text-sm text-ink", className)}
      dangerouslySetInnerHTML={{
        __html: renderMarkdown(children, { resolveWikilink, stripFrontmatter }),
      }}
    />
  );
}
