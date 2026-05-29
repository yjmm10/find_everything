import type { DigestUpdate } from "./types";

export interface RunStripProps {
  updates: DigestUpdate[];
  selectedSlug: string;
  onSelectSlug: (slug: string) => void;
  onOpenMarkdown: (slug: string) => void;
}

function runLabel(u: DigestUpdate): string {
  if (u.dateStart && u.dateEnd) return `${u.dateStart} ~ ${u.dateEnd}`;
  return u.slug.replace(/_\d{8}T\d{6}Z$/, "").replace(/_/g, " ");
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
