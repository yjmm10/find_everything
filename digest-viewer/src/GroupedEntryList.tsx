import { useMemo, useState } from "react";
import type { DigestEntry, DigestSource } from "./types";
import type { EntryLayout } from "./ResultsHeader";
import EntryCard from "./EntryCard";
import { entryListClass } from "./entryListLayout";

const GROUP_ORDER: DigestSource[] = [
  "arxiv",
  "semantic_scholar",
  "openalex",
  "rss",
  "github_weekly",
  "github_search",
  "github",
];

const GROUP_LABEL: Record<DigestSource, string> = {
  arxiv: "Arxiv 论文",
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex",
  rss: "RSS 资讯",
  github_weekly: "GitHub 周榜",
  github_search: "GitHub 检索",
  github: "GitHub",
};

export interface GroupedEntryListProps {
  entries: DigestEntry[];
  showDigest: boolean;
  layout?: EntryLayout;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function GroupedEntryList({
  entries,
  showDigest,
  layout = "list",
  favoriteIds,
  onToggleFavorite,
  onTagClick,
}: GroupedEntryListProps) {
  const bySource = useMemo(() => {
    const map = new Map<DigestSource, DigestEntry[]>();
    for (const e of entries) {
      const list = map.get(e.source) ?? [];
      list.push(e);
      map.set(e.source, list);
    }
    return map;
  }, [entries]);

  const activeSources = GROUP_ORDER.filter((s) => bySource.has(s));
  const [collapsed, setCollapsed] = useState<Set<DigestSource>>(() => new Set());

  const toggleSection = (source: DigestSource) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(activeSources));

  if (activeSources.length === 0) return null;

  return (
    <div className="grouped-list">
      <div className="grouped-list__toolbar">
        <span className="grouped-list__toolbar-label">{activeSources.length} 个来源</span>
        <button type="button" className="grouped-list__toolbar-btn" onClick={expandAll}>
          全部展开
        </button>
        <button type="button" className="grouped-list__toolbar-btn" onClick={collapseAll}>
          全部折叠
        </button>
      </div>

      {activeSources.map((source) => {
        const items = bySource.get(source)!;
        const isOpen = !collapsed.has(source);
        return (
          <section
            key={source}
            className={`grouped-list__section grouped-list__section--${source}${isOpen ? " grouped-list__section--open" : ""}`}
          >
            <button
              type="button"
              className="grouped-list__heading"
              onClick={() => toggleSection(source)}
              aria-expanded={isOpen}
            >
              <span className={`source-badge source-badge--${source}`}>
                {GROUP_LABEL[source]}
              </span>
              <span className="grouped-list__count">{items.length}</span>
              <span className="grouped-list__chevron" aria-hidden>
                {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <ul className={entryListClass(layout)}>
                {items.map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    showDigest={showDigest}
                    layout={layout}
                    isFavorite={favoriteIds?.has(e.id)}
                    onToggleFavorite={onToggleFavorite}
                    onTagClick={onTagClick}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
