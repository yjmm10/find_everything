import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DigestMeta, DigestUpdate } from "./types";
import { digestWindowLabel } from "./entryDisplay";
import { simpleMarkdownToHtml } from "./markdownRender";

export interface MarkdownDigestViewProps {
  digests: DigestMeta[];
  updates: DigestUpdate[];
  selectedSlug: string;
  onSelectSlug: (slug: string) => void;
  onBackToEntries?: () => void;
}

function stripKeywordHints(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      if (!line.includes("关键词")) return line;
      let next = line;
      next = next.replace(
        /(?:，|,)?\s*关键词(?:组|为|是)?(?:为)?\s*[「“"'`(（]?[^\n，。]*?[」”"'`)）]?(?=(?:，|,)\s*时间窗口|[。.]|$)/g,
        "",
      );
      next = next.replace(/，\s*，/g, "，").replace(/\s{2,}/g, " ");
      next = next.replace(/^[，,\s]+/, "");
      return next;
    })
    .join("\n");
}

function markdownBodyFor(update: DigestUpdate, digests: DigestMeta[]): string {
  const embedded = update.markdownBody?.trim();
  if (embedded) return embedded;
  return digests.find((d) => d.slug === update.slug)?.markdownBody?.trim() ?? "";
}

export default function MarkdownDigestView({
  digests,
  updates,
  selectedSlug,
  onSelectSlug,
  onBackToEntries,
}: MarkdownDigestViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const ignoreSpyRef = useRef(false);
  const spyTimerRef = useRef<number | null>(null);
  const initialScrollDone = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const sections = useMemo(() => {
    return updates
      .map((u) => {
        const raw = markdownBodyFor(u, digests);
        if (!raw) return null;
        return {
          update: u,
          html: simpleMarkdownToHtml(stripKeywordHints(raw)),
          label: digestWindowLabel(u.dateStart, u.dateEnd, u.slug),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s != null);
  }, [updates, digests]);

  const scrollToSlug = useCallback((slug: string, smooth = true) => {
    const el = document.getElementById(`md-section-${slug}`);
    if (!el) return;
    ignoreSpyRef.current = true;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    if (spyTimerRef.current) window.clearTimeout(spyTimerRef.current);
    spyTimerRef.current = window.setTimeout(() => {
      ignoreSpyRef.current = false;
    }, smooth ? 700 : 100);
  }, []);

  const handleSidebarSelect = useCallback(
    (slug: string) => {
      onSelectSlug(slug);
      scrollToSlug(slug);
    },
    [onSelectSlug, scrollToSlug],
  );

  useEffect(() => {
    if (initialScrollDone.current || sections.length === 0) return;
    const exists = sections.some((s) => s.update.slug === selectedSlug);
    const slug = exists ? selectedSlug : sections[0].update.slug;
    if (!exists && slug !== selectedSlug) {
      onSelectSlug(slug);
    }
    requestAnimationFrame(() => {
      scrollToSlug(slug, false);
      initialScrollDone.current = true;
    });
  }, [sections, selectedSlug, scrollToSlug, onSelectSlug]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (ignoreSpyRef.current) return;
        let best: IntersectionObserverEntry | undefined;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }
        if (!best) return;
        const slug = best.target.getAttribute("data-md-slug");
        if (slug && slug !== selectedSlug) {
          onSelectSlug(slug);
        }
      },
      {
        root,
        rootMargin: "-12% 0px -55% 0px",
        threshold: [0, 0.15, 0.35, 0.55, 0.75],
      },
    );

    for (const { update } of sections) {
      const node = root.querySelector(`[data-md-slug="${update.slug}"]`);
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, [sections, selectedSlug, onSelectSlug]);

  useEffect(
    () => () => {
      if (spyTimerRef.current) window.clearTimeout(spyTimerRef.current);
    },
    [],
  );

  return (
    <div className="md-view">
      <nav className="md-view__toolbar">
        {onBackToEntries && (
          <button type="button" className="md-view__back" onClick={onBackToEntries}>
            ← 返回条目浏览
          </button>
        )}
        <button
          type="button"
          className="md-view__sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
          aria-controls="md-view-sidebar"
        >
          {sidebarOpen ? "收起期次" : "期次列表"}
        </button>
        <span className="md-view__flow-hint">连续阅读 · 滚动到底进入下一期</span>
      </nav>

      <div className={`md-view__body ${sidebarOpen ? "" : "md-view__body--wide"}`}>
        {sidebarOpen && (
          <aside id="md-view-sidebar" className="md-view__sidebar">
            <ul className="md-view__list">
              {sections.map(({ update }) => (
                <li key={update.id}>
                  <button
                    type="button"
                    className={`md-view__item ${selectedSlug === update.slug ? "md-view__item--active" : ""}`}
                    onClick={() => handleSidebarSelect(update.slug)}
                  >
                    <span className="md-view__item-slug">
                      {digestWindowLabel(update.dateStart, update.dateEnd, update.slug, {
                        compact: true,
                      })}
                    </span>
                    <span className="md-view__item-meta">
                      {update.entryCount} 条
                      {update.crawlDate ? ` · ${update.crawlDate}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <article className="md-view__article" aria-label="Markdown 周报原文">
          <div ref={contentRef} className="md-view__content md-view__content--waterfall">
            {sections.length === 0 && <p className="muted">暂无 Markdown 原文。</p>}
            {sections.map(({ update, html, label }, index) => (
              <section
                key={update.slug}
                id={`md-section-${update.slug}`}
                className="md-waterfall__section"
                data-md-slug={update.slug}
                aria-label={label}
              >
                <header className="md-waterfall__head">
                  <h2 className="md-waterfall__title">{label}</h2>
                  <p className="md-waterfall__meta">
                    {update.entryCount} 条
                    {update.crawlDate ? ` · 抓取 ${update.crawlDate}` : ""}
                  </p>
                </header>
                <div className="md-render" dangerouslySetInnerHTML={{ __html: html }} />
                {index < sections.length - 1 && (
                  <p className="md-waterfall__next-hint" aria-hidden="true">
                    ↓ 继续向下 · 下一期
                  </p>
                )}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
