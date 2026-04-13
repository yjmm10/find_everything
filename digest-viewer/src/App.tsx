import { useEffect, useMemo, useState } from "react";
import type { DigestEntry, DigestSource, DigestsPayload } from "./types";
import "./App.css";

const SOURCE_LABEL: Record<DigestSource, string> = {
  arxiv: "Arxiv 论文",
  rss: "RSS 资讯",
  github: "GitHub（旧版标题）",
  github_weekly: "GitHub 周榜",
  github_search: "GitHub 指定日期检索",
};

function sourceBadgeClass(s: DigestSource): string {
  return `source-badge source-badge--${s}`;
}

function overlapsRange(
  start: string,
  end: string,
  filterFrom: string,
  filterTo: string,
): boolean {
  if (!filterFrom && !filterTo) return true;
  if (!start || !end) return true;
  const fs = filterFrom || "0000-01-01";
  const fe = filterTo || "9999-12-31";
  return start <= fe && end >= fs;
}

function matchesKeyword(entry: DigestEntry, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const hay = [
    entry.title,
    entry.summary,
    entry.keywords,
    entry.tags ?? "",
    entry.publishedAt ?? "",
    entry.subject ?? "",
    entry.digestSlug.replace(/_/g, " "),
    SOURCE_LABEL[entry.source],
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(t);
}

export default function App() {
  const [data, setData] = useState<DigestsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sources, setSources] = useState<Record<DigestSource, boolean>>({
    arxiv: true,
    rss: true,
    github: true,
    github_weekly: true,
    github_search: true,
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}digests.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: DigestsPayload) => setData(j))
      .catch((e) => setLoadError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((e) => {
      if (!sources[e.source]) return false;
      if (!matchesKeyword(e, keyword)) return false;
      if (!overlapsRange(e.dateStart, e.dateEnd, dateFrom, dateTo)) return false;
      return true;
    });
  }, [data, keyword, dateFrom, dateTo, sources]);

  const toggleSource = (s: DigestSource) => {
    setSources((prev) => ({ ...prev, [s]: !prev[s] }));
  };

  if (loadError) {
    return (
      <div className="page">
        <header className="hero">
          <h1>技术周报归档</h1>
          <p className="hero__sub">无法加载数据：{loadError}</p>
        </header>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page page--center">
        <p className="muted">正在加载周报数据…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <h1 className="hero__title">技术周报归档</h1>
        <p className="hero__sub">
          共 {data.digests.length} 期周报、{data.entries.length} 条条目
          {data.generatedAt ? ` · 索引生成于 ${data.generatedAt.slice(0, 19)}Z` : ""}
        </p>
      </header>

      <section className="filters" aria-label="筛选">
        <div className="filters__row">
          <label className="field">
            <span className="field__label">关键字</span>
            <input
              type="search"
              className="field__input"
              placeholder="标题、说明、关键词组…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="filters__row filters__row--split">
          <label className="field">
            <span className="field__label">时间（与条目数据窗重叠即显示）</span>
            <div className="field__inline">
              <input
                type="date"
                className="field__input field__input--narrow"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="field__sep">至</span>
              <input
                type="date"
                className="field__input field__input--narrow"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </label>
          <fieldset className="field field--sources">
            <legend className="field__label">信息源</legend>
            <div className="chips">
              {(Object.keys(SOURCE_LABEL) as DigestSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip ${sources[s] ? "chip--on" : ""} chip--${s}`}
                  onClick={() => toggleSource(s)}
                  aria-pressed={sources[s]}
                >
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <p className="result-count">
        当前显示 <strong>{filtered.length}</strong> 条
      </p>

      <ul className="card-list">
        {filtered.map((e) => (
          <li key={e.id} className="card">
            <div className="card__top">
              <span className={sourceBadgeClass(e.source)}>{SOURCE_LABEL[e.source]}</span>
              {e.score != null && <span className="score">评分 {e.score}</span>}
            </div>
            <h2 className="card__title">{e.title}</h2>
            {e.summary ? <p className="card__summary">{e.summary}</p> : null}
            <dl className="card__meta">
              <div>
                <dt>数据窗</dt>
                <dd>
                  {e.dateStart && e.dateEnd ? `${e.dateStart} ~ ${e.dateEnd}` : "—"}
                </dd>
              </div>
              <div>
                <dt>关键词组</dt>
                <dd>{e.keywords || "—"}</dd>
              </div>
              <div>
                <dt>周报档</dt>
                <dd>{e.digestSlug}</dd>
              </div>
              {e.tags ? (
                <div>
                  <dt>标签</dt>
                  <dd>{e.tags}</dd>
                </div>
              ) : null}
              {e.publishedAt ? (
                <div>
                  <dt>发表时间</dt>
                  <dd>{e.publishedAt}</dd>
                </div>
              ) : null}
              {e.subject ? (
                <div>
                  <dt>学科类别</dt>
                  <dd>{e.subject}</dd>
                </div>
              ) : null}
              {(e.star || e.fork || e.language) && (
                <div>
                  <dt>仓库</dt>
                  <dd>
                    {[e.star && `Star ${e.star}`, e.fork && `Fork ${e.fork}`, e.language]
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
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="empty muted">没有符合筛选条件的条目，请放宽关键字或时间范围。</p>
      )}
    </div>
  );
}
