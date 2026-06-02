import type { DigestEntry } from "./types";

/** 从搜索框解析关键字：空格/逗号分隔；双引号或单引号内为短语 */
export function parseSearchTokens(query: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|([^\s,，]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3])?.trim();
    if (!raw) continue;
    const t = raw.toLowerCase();
    if (!tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

export function hasSearchQuery(query: string): boolean {
  return parseSearchTokens(query).length > 0;
}

export function formatKeywordFilterLabel(query: string): string {
  const tokens = parseSearchTokens(query);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return `「${tokens[0]}」`;
  return tokens.map((t) => `「${t}」`).join(" ") + "（均需匹配）";
}

export interface EntrySearchFields {
  title: string;
  summary: string;
  keywords: string;
  tags: string | null;
  publishedAt: string | null;
  subject: string | null;
  digestSlug: string;
  sourceLabel: string;
}

export function buildEntrySearchHaystack(entry: EntrySearchFields): string {
  return [
    entry.title,
    entry.summary,
    entry.keywords,
    entry.tags ?? "",
    entry.publishedAt ?? "",
    entry.subject ?? "",
    entry.digestSlug.replace(/_/g, " "),
    entry.sourceLabel,
  ]
    .join(" ")
    .toLowerCase();
}

/** 多个关键字 AND：每条均需在标题、摘要、标签等字段中出现 */
export function entryMatchesSearchTokens(
  entry: EntrySearchFields,
  tokens: readonly string[],
): boolean {
  if (tokens.length === 0) return true;
  const hay = buildEntrySearchHaystack(entry);
  return tokens.every((t) => hay.includes(t));
}

export function entryMatchesSearchQuery(entry: EntrySearchFields, query: string): boolean {
  return entryMatchesSearchTokens(entry, parseSearchTokens(query));
}

export function digestEntryMatchesSearchTokens(
  entry: DigestEntry,
  tokens: readonly string[],
  sourceLabel: string,
): boolean {
  return entryMatchesSearchTokens(
    {
      title: entry.title,
      summary: entry.summary,
      keywords: entry.keywords,
      tags: entry.tags,
      publishedAt: entry.publishedAt,
      subject: entry.subject,
      digestSlug: entry.digestSlug,
      sourceLabel,
    },
    tokens,
  );
}

export function digestEntryMatchesSearchQuery(
  entry: DigestEntry,
  query: string,
  sourceLabel: string,
): boolean {
  return digestEntryMatchesSearchTokens(entry, parseSearchTokens(query), sourceLabel);
}
