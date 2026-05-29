import type { DigestEntry, DigestSource } from "./types";
import EntryCard from "./EntryCard";

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
  compact?: boolean;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function GroupedEntryList({
  entries,
  showDigest,
  compact = false,
  favoriteIds,
  onToggleFavorite,
  onTagClick,
}: GroupedEntryListProps) {
  const bySource = new Map<DigestSource, DigestEntry[]>();
  for (const e of entries) {
    const list = bySource.get(e.source) ?? [];
    list.push(e);
    bySource.set(e.source, list);
  }

  return (
    <div className="grouped-list">
      {GROUP_ORDER.filter((s) => bySource.has(s)).map((source) => (
        <section key={source} className="grouped-list__section">
          <h3 className="grouped-list__heading">
            <span className={`source-badge source-badge--${source}`}>
              {GROUP_LABEL[source]}
            </span>
            <span className="grouped-list__count">{bySource.get(source)!.length}</span>
          </h3>
          <ul className="card-list">
            {bySource.get(source)!.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                showDigest={showDigest}
                compact={compact}
                isFavorite={favoriteIds?.has(e.id)}
                onToggleFavorite={onToggleFavorite}
                onTagClick={onTagClick}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
