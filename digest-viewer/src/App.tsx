import { useEffect, useMemo, useState } from "react";
import DigestCalendar from "./DigestCalendar";
import DigestFilterBar from "./DigestFilterBar";
import MarkdownDigestView from "./MarkdownDigestView";
import RunStrip from "./RunStrip";
import type { DigestEntry, DigestSection, DigestSource, DigestsPayload } from "./types";
import { parseDay } from "./dateUtils";
import { parseRouteHash, setRouteHash } from "./routeHash";
import {
  type DateFilterMode,
  entryMatchesDateRange,
  overlapsRange,
} from "./filterUtils";
import "./App.css";

function digestOptionLabel(slug: string, dateStart?: string, dateEnd?: string): string {
  if (dateStart && dateEnd) return `${dateStart} ~ ${dateEnd}`;
  return slug.replace(/_\d{8}T\d{6}Z$/, "");
}

function isPlaceholderEntry(e: DigestEntry): boolean {
  const t = e.title.trim();
  if ((t === "(无)" || t === "（无）") && !e.link) return true;
  return false;
}

const SOURCE_LABEL: Record<DigestSource, string> = {
  arxiv: "Arxiv 论文",
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex",
  rss: "RSS 资讯",
  github: "GitHub（旧版标题）",
  github_weekly: "GitHub 周榜",
  github_search: "GitHub 指定日期检索",
};

function sourceBadgeClass(s: DigestSource): string {
  return `source-badge source-badge--${s}`;
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
  const [selectedDigestSlug, setSelectedDigestSlug] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("window");
  const initialRoute = parseRouteHash();
  const [pageView, setPageView] = useState<"entries" | "markdown">(initialRoute.view);
  const [markdownSlug, setMarkdownSlug] = useState(initialRoute.slug);
  const [sources, setSources] = useState<Record<DigestSource, boolean>>({
    arxiv: true,
    semantic_scholar: true,
    openalex: true,
    rss: true,
    github: true,
    github_weekly: true,
    github_search: true,
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}viewer-data.json`)
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
      if (isPlaceholderEntry(e)) return false;
      if (selectedDigestSlug && e.digestSlug !== selectedDigestSlug) return false;
      if (!sources[e.source]) return false;
      if (!matchesKeyword(e, keyword)) return false;
      if (dateFrom || dateTo) {
        if (!entryMatchesDateRange(e, dateFrom, dateTo, dateFilterMode)) return false;
      }
      return true;
    });
  }, [data, keyword, selectedDigestSlug, dateFrom, dateTo, sources, dateFilterMode]);

  const digestOptions = useMemo(() => {
    if (!data) return [];
    return data.digests.map((d) => ({
      slug: d.slug,
      label: digestOptionLabel(d.slug, d.dateStart, d.dateEnd),
    }));
  }, [data]);

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      selectedDigestSlug ||
      dateFrom ||
      dateTo ||
      calendarDay ||
      (Object.keys(sources) as DigestSource[]).some((s) => !sources[s]),
  );

  const clearFilters = () => {
    setKeyword("");
    setSelectedDigestSlug("");
    setDateFrom("");
    setDateTo("");
    setCalendarDay(null);
    setSources({
      arxiv: true,
      semantic_scholar: true,
      openalex: true,
      rss: true,
      github: true,
      github_weekly: true,
      github_search: true,
    });
  };

  const selectDigestSlug = (slug: string) => {
    setSelectedDigestSlug(slug);
    setCalendarDay(null);
    setDateFrom("");
    setDateTo("");
  };

  const allUpdates = useMemo(() => {
    if (!data?.updates) return [];
    return data.updates;
  }, [data]);

  const handleCalendarDay = (day: string | null) => {
    setCalendarDay(day);
    if (day) {
      setDateFrom(day);
      setDateTo(day);
      setSelectedDigestSlug("");
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    if (from && to && from === to) {
      setCalendarDay(from);
      const d = parseDay(from);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth() + 1);
    } else {
      setCalendarDay(null);
    }
  };

  const goToMarkdownPage = (slug: string) => {
    setMarkdownSlug(slug);
    setPageView("markdown");
    setRouteHash("markdown", slug);
  };

  useEffect(() => {
    const onHashChange = () => {
      const route = parseRouteHash();
      setPageView(route.view);
      if (route.slug) setMarkdownSlug(route.slug);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const visibleSections = useMemo(() => {
    if (!data) return [];
    type Row = DigestSection & { digestSlug: string };
    const rows: Row[] = [];
    for (const d of data.digests) {
      if (selectedDigestSlug && d.slug !== selectedDigestSlug) continue;
      if (calendarDay && !selectedDigestSlug) {
        if (dateFilterMode === "crawl" && d.crawlDate !== calendarDay) continue;
        if (
          dateFilterMode === "window" &&
          !overlapsRange(d.dateStart, d.dateEnd, calendarDay, calendarDay)
        ) {
          continue;
        }
        if (dateFilterMode === "published") {
          const hasPub = data.entries.some(
            (e) =>
              e.digestSlug === d.slug &&
              e.publishedAt?.slice(0, 10) === calendarDay,
          );
          if (!hasPub) continue;
        }
      }
      for (const s of d.sections ?? []) {
        rows.push({ ...s, digestSlug: d.slug });
      }
    }
    return rows;
  }, [data, selectedDigestSlug, calendarDay, dateFilterMode]);

  useEffect(() => {
    if (!data?.updates?.length) return;
    const latest = data.updates[0].updatedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(latest)) {
      const d = parseDay(latest);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth() + 1);
    }
    if (!markdownSlug) {
      setMarkdownSlug(data.updates[0].slug);
    }
  }, [data, markdownSlug]);

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
      <header className="hero hero--compact">
        <div className="hero__row">
          <div>
            <h1 className="hero__title">技术周报归档</h1>
            <p className="hero__sub">
              {data.digests.length} 次抓取 · {data.entries.length} 条
              {data.generatedAt ? ` · 更新 ${data.generatedAt.slice(0, 10)}` : ""}
            </p>
          </div>
          <nav className="view-tabs" aria-label="视图切换">
          <button
            type="button"
            className={`view-tabs__btn ${pageView === "entries" ? "view-tabs__btn--active" : ""}`}
            onClick={() => {
              setPageView("entries");
              setRouteHash("entries");
            }}
          >
            条目浏览
          </button>
          <button
            type="button"
            className={`view-tabs__btn ${pageView === "markdown" ? "view-tabs__btn--active" : ""}`}
            onClick={() => {
              setPageView("markdown");
              if (selectedDigestSlug) setMarkdownSlug(selectedDigestSlug);
              else if (!markdownSlug && data.updates[0]) setMarkdownSlug(data.updates[0].slug);
              setRouteHash("markdown", markdownSlug || selectedDigestSlug || data.updates[0]?.slug);
            }}
          >
            Markdown 原文
          </button>
          </nav>
        </div>
      </header>

      {pageView === "markdown" ? (
        <MarkdownDigestView
          digests={data.digests}
          updates={allUpdates}
          selectedSlug={markdownSlug || allUpdates[0]?.slug || ""}
          onSelectSlug={(slug) => {
            setMarkdownSlug(slug);
            setRouteHash("markdown", slug);
          }}
          onBackToEntries={() => {
            setPageView("entries");
            setRouteHash("entries");
          }}
        />
      ) : (
      <div className="layout">
        <aside className="sidebar">
          <DigestCalendar
            updates={allUpdates}
            entries={data.entries}
            selectedDay={calendarDay}
            viewYear={viewYear}
            viewMonth={viewMonth}
            dateFilterMode={dateFilterMode}
            onSelectDay={handleCalendarDay}
            onViewMonthChange={(y, m) => {
              setViewYear(y);
              setViewMonth(m);
            }}
          />
        </aside>

        <div className="main">
          <DigestFilterBar
            keyword={keyword}
            onKeywordChange={setKeyword}
            selectedDigestSlug={selectedDigestSlug}
            digestOptions={digestOptions}
            onDigestChange={selectDigestSlug}
            dateFilterMode={dateFilterMode}
            onDateFilterModeChange={setDateFilterMode}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateRangeChange={handleDateRangeChange}
            sources={sources}
            onToggleSource={toggleSource}
            filteredCount={filtered.length}
            totalCount={data.entries.length}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />

          <RunStrip
            updates={allUpdates}
            selectedSlug={selectedDigestSlug}
            onSelectSlug={selectDigestSlug}
            onOpenMarkdown={goToMarkdownPage}
          />

      {visibleSections.length > 0 && (
        <details className="section-summaries section-summaries--collapsible">
          <summary className="section-summaries__toggle">
            板块说明（{visibleSections.length} 个来源板块）
          </summary>
          <ul className="section-summaries__list">
            {visibleSections.map((s) => (
              <li key={`${s.digestSlug}-${s.source}`} className="section-summary section-summary--compact">
                <div className="section-summary__top">
                  <span className={sourceBadgeClass(s.source)}>{SOURCE_LABEL[s.source]}</span>
                  <span className="section-summary__count">{s.entryCount} 条</span>
                </div>
                {s.summary ? <p className="section-summary__text">{s.summary}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ul className="card-list">
        {filtered.map((e) => (
          <li key={e.id} className="card">
            <div className="card__top">
              <span className={sourceBadgeClass(e.source)}>{SOURCE_LABEL[e.source]}</span>
              {e.score != null && <span className="score">评分 {e.score}</span>}
            </div>
            <h2 className="card__title">{e.title === "(无标题)" ? "（无标题）" : e.title}</h2>
            {e.summary ? <p className="card__summary">{e.summary}</p> : null}
            <dl className="card__meta card__meta--grid">
              {!selectedDigestSlug && (
                <div>
                  <dt>期次</dt>
                  <dd>{digestOptionLabel(e.digestSlug, e.dateStart, e.dateEnd)}</dd>
                </div>
              )}
              {e.publishedAt ? (
                <div>
                  <dt>发表</dt>
                  <dd>{e.publishedAt.slice(0, 10)}</dd>
                </div>
              ) : null}
              {e.tags ? (
                <div>
                  <dt>标签</dt>
                  <dd>{e.tags}</dd>
                </div>
              ) : null}
              {e.subject ? (
                <div>
                  <dt>学科</dt>
                  <dd>{e.subject}</dd>
                </div>
              ) : null}
              {(e.star || e.fork || e.language) && (
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
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="empty muted">
          没有符合筛选条件的条目。
          {selectedDigestSlug && (
            <>
              {" "}
              该期可能仅有「无数据」占位行，请
              <button
                type="button"
                className="empty__link"
                onClick={() => goToMarkdownPage(selectedDigestSlug)}
              >
                查看 Markdown 原文
              </button>
              了解说明文字。
            </>
          )}
          {!selectedDigestSlug && " 请放宽关键字、日历日期或时间范围。"}
        </p>
      )}
        </div>
      </div>
      )}
    </div>
  );
}
