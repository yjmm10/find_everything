import type { DigestEntry, DigestSource } from "./types";
import type { EntryLayout } from "./ResultsHeader";
import { effectivePublishedDay } from "./filterUtils";
import { digestWindowLabel, parseTagList, scoreTier } from "./entryDisplay";

const SOURCE_LABEL: Record<DigestSource, string> = {
  arxiv: "Arxiv",
  semantic_scholar: "S2",
  openalex: "OpenAlex",
  rss: "RSS",
  github: "GitHub",
  github_weekly: "GH 周榜",
  github_search: "GH 检索",
};

export interface EntryCardProps {
  entry: DigestEntry;
  showDigest?: boolean;
  layout?: EntryLayout;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

function EntryTitle({ entry: e }: { entry: DigestEntry }) {
  const title = e.title === "(无标题)" ? "（无标题）" : e.title;
  if (e.link) {
    return (
      <a className="card__title-link" href={e.link} target="_blank" rel="noreferrer">
        {title}
      </a>
    );
  }
  return <>{title}</>;
}

function EntryActions({
  entry: e,
  isFavorite,
  onToggleFavorite,
}: {
  entry: DigestEntry;
  isFavorite: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  const copyLink = async () => {
    if (!e.link) return;
    try {
      await navigator.clipboard.writeText(e.link);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="card__actions">
      {onToggleFavorite && (
        <button
          type="button"
          className={`card__action ${isFavorite ? "card__action--on" : ""}`}
          onClick={() => onToggleFavorite(e.id)}
          title={isFavorite ? "取消收藏" : "收藏"}
          aria-label={isFavorite ? "取消收藏" : "收藏"}
          aria-pressed={isFavorite}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      )}
      {e.link && (
        <button
          type="button"
          className="card__action"
          onClick={copyLink}
          title="复制链接"
          aria-label="复制链接"
        >
          ⎘
        </button>
      )}
    </div>
  );
}

export default function EntryCard({
  entry: e,
  showDigest = true,
  layout = "list",
  isFavorite = false,
  onToggleFavorite,
  onTagClick,
}: EntryCardProps) {
  const tier = scoreTier(e.score);
  const tags = parseTagList(e.tags);
  const pub =
    e.source === "github_weekly" || e.source === "github"
      ? effectivePublishedDay(e)
      : e.publishedAt?.slice(0, 10) || null;
  const pubLabel =
    e.source === "github_weekly" ? "周榜" : e.source === "github_search" ? "推送" : "发表";

  const metaParts = [
    pub ? `${pubLabel} ${pub}` : null,
    showDigest ? digestWindowLabel(e.dateStart, e.dateEnd, e.digestSlug) : null,
    e.star ? `★ ${e.star}` : null,
  ].filter(Boolean);

  if (layout === "grid") {
    return (
      <li className={`card card--grid card--${e.source}`}>
        <div className="card__grid-head">
          <span className={`source-badge source-badge--${e.source}`}>
            {SOURCE_LABEL[e.source]}
          </span>
          {tier !== "none" && e.score != null && (
            <span className={`score-badge score-badge--${tier}`} title="AI 相关性评分">
              {e.score}
            </span>
          )}
        </div>
        <h2 className="card__title card__title--grid">
          <EntryTitle entry={e} />
        </h2>
        {e.summary ? <p className="card__summary card__summary--grid">{e.summary}</p> : null}
        {metaParts.length > 0 && <p className="card__foot">{metaParts.join(" · ")}</p>}
        <div className="card__grid-actions">
          <EntryActions
            entry={e}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      </li>
    );
  }

  return (
    <li className={`card card--list card--${e.source}`}>
      <span className={`source-badge source-badge--${e.source}`}>
        {SOURCE_LABEL[e.source]}
      </span>
      <div className="card__list-main">
        <h2 className="card__title card__title--list">
          <EntryTitle entry={e} />
        </h2>
        {metaParts.length > 0 && <p className="card__meta-line">{metaParts.join(" · ")}</p>}
        {tags.length > 0 && (
          <ul className="tag-list tag-list--inline" aria-label="标签">
            {tags.slice(0, 4).map((t) => (
              <li key={t}>
                {onTagClick ? (
                  <button type="button" className="tag-list__item tag-list__btn" onClick={() => onTagClick(t)}>
                    {t}
                  </button>
                ) : (
                  <span className="tag-list__item">{t}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {tier !== "none" && e.score != null && (
        <span className={`score-badge score-badge--${tier}`} title="AI 相关性评分">
          {e.score}
        </span>
      )}
      <EntryActions
        entry={e}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    </li>
  );
}
