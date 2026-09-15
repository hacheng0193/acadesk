/**
 * Paper metadata lookup.
 *
 * This is the only outbound network call in the whole app. What leaves the
 * machine is exactly one identifier - a DOI or arXiv id - and nothing else.
 * BibTeX and pasted citations are parsed locally and never sent anywhere.
 */

export type PaperMeta = {
  title: string;
  authors: string;
  venue: string;
  year: number | null;
  doi: string;
  url: string;
  /** Author keywords, when the source carries them - they become tags. */
  keywords: string[];
  source: "crossref" | "arxiv" | "bibtex" | "citation";
};

export type LookupResult = { ok: true; meta: PaperMeta } | { ok: false; error: string };

const TIMEOUT_MS = 12_000;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

/** What did the user paste? BibTeX is obvious; the rest is pattern matching. */
export function classifyInput(
  raw: string,
): "bibtex" | "citation" | "arxiv" | "doi" | "unknown" {
  const text = raw.trim();
  if (/^\s*@\w+\s*\{/m.test(text)) return "bibtex";
  // A formatted reference has its title in quotes; a bare DOI or URL does not.
  // Parsing it locally beats a Crossref round trip and keeps the keywords.
  if (/["“][^"”]{8,}["”]/.test(text)) return "citation";
  if (/arxiv\.org|^arxiv:/i.test(text) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(text)) return "arxiv";
  if (/10\.\d{4,9}\/\S+/.test(text)) return "doi";
  return "unknown";
}

export function extractDoi(raw: string): string | null {
  const m = /10\.\d{4,9}\/[^\s"'<>,;)\]]+/.exec(raw.trim());
  return m ? m[0].replace(/[.,;]$/, "") : null;
}

export function extractArxivId(raw: string): string | null {
  const text = raw.trim();
  const m =
    /(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)?(\d{4}\.\d{4,5})(v\d+)?/i.exec(text) ??
    /(?:arxiv\.org\/(?:abs|pdf)\/)([a-z-]+\/\d{7})/i.exec(text);
  return m ? m[1] : null;
}

/* ---------- Crossref ---------- */

type CrossrefWork = {
  title?: string[];
  subtitle?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  "short-container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  DOI?: string;
  URL?: string;
};

/** Crossref and arXiv both return HTML-escaped text (&amp;, &#39;, …). */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ");
}

function formatAuthors(authors: CrossrefWork["author"]): string {
  if (!authors?.length) return "";
  const names = authors.map((a) =>
    a.name ? a.name : [a.family, a.given].filter(Boolean).join(", "),
  );
  return names.length > 6 ? `${names.slice(0, 3).join("; ")} et al.` : names.join("; ");
}

async function fromCrossref(doi: string): Promise<LookupResult> {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    signal: timeoutSignal(),
    headers: { accept: "application/json" },
  });
  if (res.status === 404) return { ok: false, error: `Crossref 查不到這個 DOI：${doi}` };
  if (!res.ok) return { ok: false, error: `Crossref 回應 ${res.status}` };

  const work = ((await res.json()) as { message?: CrossrefWork }).message;
  if (!work) return { ok: false, error: "Crossref 回應格式看不懂" };

  const parts = work.issued?.["date-parts"]?.[0] ?? work.published?.["date-parts"]?.[0];
  // Crossref splits "Optuna: A Next-generation Framework" across title and
  // subtitle; taking title alone loses most of the name.
  const title = [work.title?.[0], work.subtitle?.[0]]
    .map((t) => t?.trim())
    .filter(Boolean)
    .join(": ");
  return {
    ok: true,
    meta: {
      title: decodeEntities(title),
      authors: decodeEntities(formatAuthors(work.author)),
      venue: decodeEntities(
        (work["short-container-title"]?.[0] || work["container-title"]?.[0] || "").trim(),
      ),
      year: parts?.[0] ?? null,
      doi: work.DOI ?? doi,
      url: work.URL ?? `https://doi.org/${doi}`,
      keywords: [],
      source: "crossref",
    },
  };
}

/* ---------- arXiv ---------- */

function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

async function fromArxiv(id: string): Promise<LookupResult> {
  const res = await fetch(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`,
    { signal: timeoutSignal() },
  );
  if (!res.ok) return { ok: false, error: `arXiv 回應 ${res.status}` };

  const xml = await res.text();
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
  if (!entry) return { ok: false, error: `arXiv 查不到：${id}` };

  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim());
  const published = tag(entry, "published");
  const journal = tag(entry, "arxiv:journal_ref");

  return {
    ok: true,
    meta: {
      title: decodeEntities(tag(entry, "title")),
      authors: decodeEntities(
        authors.length > 6 ? `${authors.slice(0, 3).join("; ")} et al.` : authors.join("; "),
      ),
      venue: journal || "arXiv",
      year: published ? Number(published.slice(0, 4)) : null,
      doi: tag(entry, "arxiv:doi"),
      url: `https://arxiv.org/abs/${id}`,
      keywords: [],
      source: "arxiv",
    },
  };
}

/* ---------- BibTeX (parsed locally, never sent anywhere) ---------- */

function stripBraces(v: string): string {
  let out = v.trim().replace(/,$/, "").trim();
  while (
    (out.startsWith("{") && out.endsWith("}")) ||
    (out.startsWith('"') && out.endsWith('"'))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Keywords arrive `;`-separated (IEEE Xplore) or `,`-separated (most others).
 * Tags are stored comma-separated, so commas never survive inside one, and
 * IEEE repeats terms in different case ("Quality of experience" and
 * "quality of experience") - keep the first spelling only.
 */
export function splitKeywords(raw: string): string[] {
  const parts = raw.includes(";") ? raw.split(";") : raw.split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const k = part.replace(/[{}]/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

export function parseBibtex(text: string): LookupResult {
  const entry = text.slice(text.search(/@\w+\s*\{/));
  const body = entry.slice(entry.indexOf("{") + 1);
  const fields: Record<string, string> = {};

  // Field values may be brace-delimited or quoted, and either kind can contain
  // commas ("LeCun, Yann and Bengio, Yoshua"), so a naive split on "," tears
  // author lists apart. Track both brace depth and quote state.
  let key = "";
  let value = "";
  let depth = 0;
  let inQuotes = false;
  let inValue = false;

  const commit = () => {
    const k = key.trim().toLowerCase();
    if (k) fields[k] = stripBraces(value);
    key = "";
    value = "";
    inValue = false;
  };

  for (const ch of body) {
    if (!inValue) {
      if (ch === "=") {
        inValue = true;
        value = "";
        depth = 0;
        inQuotes = false;
      } else if (ch === ",") {
        key = "";
      } else if (ch === "}") {
        break;
      } else {
        key += ch;
      }
      continue;
    }

    if (ch === '"' && depth === 0) {
      inQuotes = !inQuotes;
      value += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        if (depth === 0) {
          // Closing brace of the whole entry.
          commit();
          break;
        }
        depth -= 1;
      } else if (ch === "," && depth === 0) {
        commit();
        continue;
      }
    }
    value += ch;
  }
  if (inValue) commit();

  if (!fields.title) return { ok: false, error: "BibTeX 裡找不到 title 欄位" };

  const year = Number(String(fields.year ?? "").replace(/\D/g, ""));
  return {
    ok: true,
    meta: {
      title: fields.title,
      authors: (fields.author ?? "")
        .split(/\s+and\s+/i)
        .map((a) => a.trim())
        .filter(Boolean)
        .join("; "),
      venue: fields.journal || fields.booktitle || fields.publisher || "",
      year: Number.isFinite(year) && year > 0 ? year : null,
      doi: fields.doi ?? "",
      url: fields.url || (fields.doi ? `https://doi.org/${fields.doi}` : ""),
      keywords: splitKeywords(fields.keywords ?? ""),
      source: "bibtex",
    },
  };
}

/* ---------- Plain-text citation (parsed locally, never sent anywhere) ---------- */

/**
 * "C. -H. Hsu" -> "Hsu, C.-H.", matching the "Family, Given" order Crossref
 * and BibTeX give. Leading initials are the given name; the rest is family.
 */
function reorderName(name: string): string {
  const clean = name.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  if (clean.includes(",")) return clean;
  const tokens = clean.split(" ");
  let i = 0;
  while (i < tokens.length - 1 && /^(?:[A-Z]\.)(?:-?[A-Z]\.)*$/.test(tokens[i])) i += 1;
  if (i === 0) return clean;
  return `${tokens.slice(i).join(" ")}, ${tokens.slice(0, i).join(" ")}`;
}

/** "A. B, C. D, and E. F" / "A. B and C. D" -> "B, A.; D, C.; F, E." */
function parseCitationAuthors(raw: string): string {
  const names = raw
    .replace(/\bet al\.?/i, "")
    .split(/,\s*and\s+|\s+and\s+|,\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
  const formatted = names.map(reorderName);
  return formatted.length > 6 ? `${formatted.slice(0, 3).join("; ")} et al.` : formatted.join("; ");
}

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";

/**
 * An IEEE-style reference, as Xplore's "Cite This" gives it:
 *
 *   A. Author and B. Author, "Title," in Venue, vol. 23, pp. 1-2, 2021,
 *   doi: 10.1109/X.
 *   keywords: {a;b;c},
 *
 * Other styles that quote the title (ACM, most "plain text" exports) mostly
 * work too, since only the quotes anchor the split.
 */
export function parseCitation(text: string): LookupResult {
  const flat = text.replace(/\s+/g, " ").trim();
  const quoted = /["“]([^"”]+?)[,.]?["”]/.exec(flat);
  if (!quoted) return { ok: false, error: "引用文字裡找不到用引號括起來的標題" };

  const keywordMatch = /keywords\s*[:=]\s*\{([^}]*)\}/i.exec(flat);
  const head = flat.slice(0, quoted.index).replace(/[,.\s]+$/, "");
  let tail = flat.slice(quoted.index + quoted[0].length);
  if (keywordMatch) tail = tail.replace(keywordMatch[0], "");

  const doi = extractDoi(tail) ?? "";
  const url = /https?:\/\/\S+/.exec(tail)?.[0].replace(/[.,;]$/, "") ?? "";

  // The venue runs from "in" to the first volume/issue/pages/date/doi part.
  const afterIn = tail.replace(/^[,.\s]*(?:in:?\s+)?/i, "");
  const stop = new RegExp(
    `,\\s*(?:vol\\.|no\\.|pp\\.|p\\.|doi:|${MONTH}\\s|(?:19|20)\\d{2}\\b|https?:)`,
    "i",
  );
  let venue = afterIn.slice(0, afterIn.search(stop) === -1 ? undefined : afterIn.search(stop));
  // Conference entries carry the location after the acronym:
  // "2021 IEEE Int. Conf. on X (ICX), Montreal, QC, Canada".
  const acronym = /^(.*\([A-Za-z0-9 '&-]+\))\s*,/.exec(venue);
  if (acronym) venue = acronym[1];
  venue = venue.replace(/[,.\s]+$/, "").trim();

  const years = [...tail.replace(doi, "").matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));

  return {
    ok: true,
    meta: {
      title: quoted[1].trim(),
      authors: parseCitationAuthors(head),
      venue,
      year: years.length ? years[years.length - 1] : null,
      doi,
      url: url || (doi ? `https://doi.org/${doi}` : ""),
      keywords: keywordMatch ? splitKeywords(keywordMatch[1]) : [],
      source: "citation",
    },
  };
}

/* ---------- entry point ---------- */

export async function lookup(raw: string): Promise<LookupResult> {
  const text = raw.trim();
  if (!text) return { ok: false, error: "請先貼上 DOI、arXiv 編號、BibTeX 或引用文字" };

  try {
    switch (classifyInput(text)) {
      case "bibtex":
        return parseBibtex(text);
      case "citation":
        return parseCitation(text);
      case "arxiv": {
        const id = extractArxivId(text);
        return id ? await fromArxiv(id) : { ok: false, error: "看不出 arXiv 編號" };
      }
      case "doi": {
        const doi = extractDoi(text);
        return doi ? await fromCrossref(doi) : { ok: false, error: "看不出 DOI" };
      }
      default:
        return {
          ok: false,
          error:
            "認不出這是什麼。支援 DOI（10.xxxx/…）、arXiv 編號、整段 BibTeX，或標題有引號的引用文字（如 IEEE 格式）。",
        };
    }
  } catch (e) {
    // Offline, DNS failure, timeout - all land here.
    const offline = e instanceof Error && /fetch|network|abort|timeout/i.test(e.message);
    return {
      ok: false,
      error: offline ? "連不上網路或查詢逾時，請改用手動輸入" : "查詢失敗，請改用手動輸入",
    };
  }
}
