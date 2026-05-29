import type { DigestEntry, DigestSource } from "./types";
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
  compact?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function EntryCard({
  entry: e,
  showDigest = true,
  compact = false,
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
    e.source === "github_weekly" ? "周榜（周日）" : e.source === "github_search" ? "推送" : "发表";

  const copyLink = async () => {
    if (!e.link) return;
    try {
      await navigator.clipboard.writeText(e.link);
    } catch {
      /* ignore */
    }
  };

  return (
    <li className={`card card--${e.source}${compact ? " card--compact" : ""}`}>
      <div className="card__top">
        <span className={`source-badge source-badge--${e.source}`}>
          {SOURCE_LABEL[e.source]}
        </span>
        {tier !== "none" && e.score != null && (
          <span className={`score-badge score-badge--${tier}`} title="AI 相关性评分">
            {e.score}
          </span>
        )}
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
      </div>

      {e.link ? (
        <h2 className="card__title">
          <a className="card__title-link" href={e.link} target="_blank" rel="noreferrer">
            {e.title === "(无标题)" ? "（无标题）" : e.title}
          </a>
        </h2>
      ) : (
        <h2 className="card__title">{e.title === "(无标题)" ? "（无标题）" : e.title}</h2>
      )}

      {!compact && e.summary ? <p className="card__summary">{e.summary}</p> : null}

      {tags.length > 0 && (
        <ul className="tag-list" aria-label="标签">
          {tags.map((t) => (
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

      <dl className="card__meta card__meta--grid">
        {showDigest && (
          <div>
            <dt>期次</dt>
            <dd>{digestWindowLabel(e.dateStart, e.dateEnd, e.digestSlug)}</dd>
          </div>
        )}
        {pub && (
          <div>
            <dt>{pubLabel}</dt>
            <dd>{pub}</dd>
          </div>
        )}
        {!compact && e.subject ? (
          <div>
            <dt>学科</dt>
            <dd>{e.subject}</dd>
          </div>
        ) : null}
        {!compact && (e.star || e.fork || e.language) && (
          <div>
            <dt>仓库</dt>
            <dd>
              {[e.star && `★ ${e.star}`, e.fork && `⑂ ${e.fork}`, e.language]
                .filter(Boolean)
                .join(" · ")}
            </dd>
          </div>
        )}
      </dl>

      {e.link ? (
        <a className="card__link" href={e.link} target="_blank" rel="noreferrer">
          打开链接 →
        </a>
      ) : null}
    </li>
  );
}
