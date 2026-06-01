import { useEffect, useState } from "react";
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

export default function MarkdownDigestView({
  digests,
  updates,
  selectedSlug,
  onSelectSlug,
  onBackToEntries,
}: MarkdownDigestViewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const meta = digests.find((d) => d.slug === selectedSlug) ?? digests[0];
  const embeddedBody = meta?.markdownBody?.trim() ?? "";
  const markdownUrl = meta?.markdownUrl || (meta ? `docs/${meta.file}` : "");

  useEffect(() => {
    if (embeddedBody) {
      setContent(embeddedBody);
      setError(null);
      setLoading(false);
      return;
    }
    if (!markdownUrl) return;
    const url = `${import.meta.env.BASE_URL}${markdownUrl.replace(/^\//, "")}`;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`无法加载 Markdown (${r.status})`);
        return r.text();
      })
      .then((text) => setContent(text))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [embeddedBody, markdownUrl, selectedSlug]);

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
      </nav>

      <div className={`md-view__body ${sidebarOpen ? "" : "md-view__body--wide"}`}>
        {sidebarOpen && (
          <aside id="md-view-sidebar" className="md-view__sidebar">
            <ul className="md-view__list">
              {updates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`md-view__item ${selectedSlug === u.slug ? "md-view__item--active" : ""}`}
                    onClick={() => onSelectSlug(u.slug)}
                  >
                    <span className="md-view__item-slug">
                      {digestWindowLabel(u.dateStart, u.dateEnd, u.slug, { compact: true })}
                    </span>
                    <span className="md-view__item-meta">
                      {u.entryCount} 条
                      {u.crawlDate ? ` · ${u.crawlDate}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <article className="md-view__article" aria-label="Markdown 周报原文">
          <header className="md-view__article-head">
            <h2 className="md-view__article-title">
              {meta ? digestWindowLabel(meta.dateStart, meta.dateEnd, meta.slug) : "—"}
            </h2>
            {meta && (
              <p className="md-view__article-meta">
                {meta.entryCount} 条
                {meta.crawlDate ? ` · 抓取 ${meta.crawlDate}` : ""}
              </p>
            )}
          </header>

          <div className="md-view__content">
            {loading && <p className="muted">正在加载 Markdown…</p>}
            {error && (
              <p className="doc-panel__error">
                {error}
                <span className="muted"> · 请确认 gh-pages 已发布 data/ 或 viewer-data.json</span>
              </p>
            )}
            {content && (
              <div
                className="md-render"
                dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }}
              />
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
