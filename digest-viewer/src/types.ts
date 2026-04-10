export type DigestSource = "arxiv" | "rss" | "github";

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
