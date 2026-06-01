import type { DigestUpdate } from "./types";
import { digestWindowLabel } from "./entryDisplay";

export interface RunStripProps {
  updates: DigestUpdate[];
  selectedSlug: string;
  onSelectSlug: (slug: string) => void;
  onOpenMarkdown: (slug: string) => void;
}

function runLabel(u: DigestUpdate): string {
  return digestWindowLabel(u.dateStart, u.dateEnd, u.slug, { compact: true });
}

export default function RunStrip({
  updates,
  selectedSlug,
  onSelectSlug,
  onOpenMarkdown,
}: RunStripProps) {
  if (updates.length === 0) return null;

  return (
    <section className="run-strip" aria-label="抓取期次">
      <div className="run-strip__head">
        <span className="run-strip__label">期次（整周 Markdown）</span>
        <span className="run-strip__hint">点胶囊筛条目 · 原文看周报</span>
      </div>
      <div className="run-strip__scroll">
        {updates.map((u) => {
          const active = selectedSlug === u.slug;
          return (
            <div key={u.id} className={`run-pill ${active ? "run-pill--active" : ""}`}>
              <button
                type="button"
                className="run-pill__main"
                onClick={() => onSelectSlug(active ? "" : u.slug)}
                title={u.slug}
              >
                <span className="run-pill__range">{runLabel(u)}</span>
                <span className="run-pill__count">{u.entryCount} 条</span>
              </button>
              <button
                type="button"
                className="run-pill__md"
                onClick={() => onOpenMarkdown(u.slug)}
                title="查看完整 Markdown 周报"
                aria-label={`查看 ${runLabel(u)} 完整周报`}
              >
                原文
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
