import type { DigestEntry, DigestSource } from "./types";

export type ScoreTier = "high" | "mid" | "low" | "none";

export function scoreTier(score: number | null | undefined): ScoreTier {
  if (score == null || Number.isNaN(Number(score))) return "none";
  const n = Number(score);
  if (n >= 8) return "high";
  if (n >= 6) return "mid";
  if (n >= 1) return "low";
  return "none";
}

export function parseTagList(tags: string | null | undefined): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(/[,，;；|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function digestWindowLabel(dateStart?: string, dateEnd?: string, slug?: string): string {
  if (dateStart && dateEnd) return `${dateStart} ~ ${dateEnd}`;
  if (slug) return slug.replace(/_\d{8}T\d{6}Z$/, "");
  return "—";
}

export function countBySource(entries: DigestEntry[]): Partial<Record<DigestSource, number>> {
  const out: Partial<Record<DigestSource, number>> = {};
  for (const e of entries) {
    out[e.source] = (out[e.source] ?? 0) + 1;
  }
  return out;
}
