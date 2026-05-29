export type DigestSource =
  | "arxiv"
  | "semantic_scholar"
  | "openalex"
  | "rss"
  | "github"
  | "github_weekly"
  | "github_search";

export interface DigestSection {
  source: DigestSource;
  heading: string;
  summary: string;
  dateStart: string;
  dateEnd: string;
  keywords: string;
  entryCount: number;
}

export interface DigestEntry {
  id: string;
  digestSlug: string;
  dateStart: string;
  dateEnd: string;
  keywords: string;
  source: DigestSource;
  score: number | null;
  title: string;
  summary: string;
  link: string | null;
  star: string | null;
  fork: string | null;
  language: string | null;
  tags: string | null;
  publishedAt: string | null;
  subject: string | null;
  /** 抓取执行日 YYYY-MM-DD（来自 digest slug 时间戳） */
  crawlDate?: string;
}

export interface DigestMeta {
  slug: string;
  runId?: string;
  file: string;
  markdownUrl: string;
  /** 内嵌 Markdown 原文（JSON-first 权威来源） */
  markdownBody?: string;
  crawlDate: string;
  dateStart: string;
  dateEnd: string;
  entryCount: number;
  sections: DigestSection[];
}

export interface DigestUpdate {
  id: string;
  slug: string;
  runId?: string;
  file: string;
  markdownUrl: string;
  markdownBody?: string;
  crawlDate: string;
  dateStart: string;
  dateEnd: string;
  entryCount: number;
  sourceCounts: Partial<Record<DigestSource, number>>;
  topKeywords: string;
  sections: DigestSection[];
  updatedAt: string;
}

export interface DigestsPayload {
  schemaVersion?: string;
  generatedAt: string;
  digests: DigestMeta[];
  updates: DigestUpdate[];
  entries: DigestEntry[];
}

/** @deprecated 别名，与 DigestsPayload 相同 */
export type ViewerDataPayload = DigestsPayload;
