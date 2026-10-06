import { parseCells, parseColumns, type Paper, type Review, type ReviewPaperRow } from "./types";

/** Authors are stored "Family, Given; Family, Given" (see lib/metadata.ts). */
function authorList(authors: string): string[] {
  const raw = authors.replace(/\s*et al\.?$/i, "").trim();
  if (!raw) return [];
  if (raw.includes(";")) return raw.split(";").map((a) => a.trim()).filter(Boolean);
  if (/\s+and\s+/i.test(raw)) return raw.split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean);
  return [raw];
}

function surname(name: string): string {
  if (name.includes(",")) return name.split(",")[0].trim();
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

/** "Chen et al. 2023" - the short form used for citing inside the synthesis. */
export function shortCite(paper: Pick<Paper, "authors" | "year">): string {
  const list = authorList(paper.authors);
  const who = list.length
    ? surname(list[0]) + (list.length > 2 ? " et al." : list.length === 2 ? ` & ${surname(list[1])}` : "")
    : "Anon.";
  return paper.year ? `${who} ${paper.year}` : who;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, "<br>").trim();
}

export function toMarkdownTable(review: Review, rows: ReviewPaperRow[]): string {
  const columns = parseColumns(review.columns_json);
  const head = ["論文", ...columns.map((c) => c.label)];
  const lines = [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((p) => {
      const cells = parseCells(p.cells_json);
      return `| ${[`${p.title} (${shortCite(p)})`, ...columns.map((c) => cells[c.id] ?? "")]
        .map(cell)
        .join(" | ")} |`;
    }),
  ];
  return `## ${review.title}\n\n${lines.join("\n")}\n`;
}

function asciiKey(s: string): string {
  return s.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
}

function bibValue(v: string): string {
  return v.replace(/[{}]/g, "").trim();
}

export function toBibtex(papers: Paper[]): string {
  const used = new Map<string, number>();
  return papers
    .map((p) => {
      const authors = authorList(p.authors);
      const firstWord = p.title.split(/\s+/).find((w) => asciiKey(w).length > 3) ?? p.title;
      const base =
        (asciiKey(surname(authors[0] ?? "")).toLowerCase() || "anon") +
        (p.year ?? "") +
        asciiKey(firstWord).toLowerCase();
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      const key = n ? `${base}${String.fromCharCode(96 + n)}` : base;

      const fields: [string, string][] = [
        ["title", `{${bibValue(p.title)}}`],
        ["author", authors.map(bibValue).join(" and ")],
        ["journal", bibValue(p.venue)],
        ["year", p.year ? String(p.year) : ""],
        ["doi", bibValue(p.doi)],
        ["url", bibValue(p.url)],
      ];
      const body = fields
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(",\n");
      return `@${p.venue ? "article" : "misc"}{${key},\n${body}\n}`;
    })
    .join("\n\n")
    .concat("\n");
}
