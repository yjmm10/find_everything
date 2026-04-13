export type DigestSource =
  | "arxiv"
  | "rss"
  | "github"
  | "github_weekly"
  | "github_search";

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
  /** AI 归纳，逗号分隔 */
  tags: string | null;
  /** 论文发表日 YYYY-MM-DD（主要来自 Arxiv 表） */
  publishedAt: string | null;
  /** arXiv 主分类等（主要来自 Arxiv 表「学科类别」列） */
  subject: string | null;
}

export interface DigestMeta {
  slug: string;
  file: string;
  dateStart: string;
  dateEnd: string;
  entryCount: number;
}

export interface DigestsPayload {
  generatedAt: string;
  digests: DigestMeta[];
  entries: DigestEntry[];
}
