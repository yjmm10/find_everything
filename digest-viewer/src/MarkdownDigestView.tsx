import { useEffect, useState } from "react";
import type { DigestMeta, DigestUpdate } from "./types";
import { simpleMarkdownToHtml } from "./markdownRender";

export interface MarkdownDigestViewProps {
  digests: DigestMeta[];
  updates: DigestUpdate[];
  selectedSlug: string;
  onSelectSlug: (slug: string) => void;
}

export default function MarkdownDigestView({
  digests,
  updates,
  selectedSlug,
  onSelectSlug,
}: MarkdownDigestViewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
  }, [embeddedBody, markdownUrl]);

  return (
    <div className="md-view">
      <aside className="md-view__sidebar">
        <h2 className="md-view__sidebar-title">抓取归档</h2>
        <p className="md-view__sidebar-sub">每次抓取一份完整 Markdown，不按来源拆分</p>
        <ul className="md-view__list">
          {updates.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={`md-view__item ${selectedSlug === u.slug ? "md-view__item--active" : ""}`}
                onClick={() => onSelectSlug(u.slug)}
              >
                <span className="md-view__item-slug">{u.slug}</span>
                <span className="md-view__item-meta">
                  {u.dateStart && u.dateEnd ? `${u.dateStart} ~ ${u.dateEnd}` : "—"}
                  {u.crawlDate ? ` · 抓取 ${u.crawlDate}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <article className="md-view__article" aria-label="Markdown 周报原文">
        <header className="md-view__article-head">
          <h2 className="md-view__article-title">{meta?.slug ?? "—"}</h2>
          {meta && (
            <p className="md-view__article-meta">
              {embeddedBody ? (
                <>内嵌 JSON 原文 · <code>{meta.file}</code></>
              ) : (
                <>文件 <code>{meta.file}</code></>
              )}
              {meta.dateStart && meta.dateEnd ? ` · 数据窗 ${meta.dateStart} ~ ${meta.dateEnd}` : ""}
            </p>
          )}
        </header>

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
      </article>
    </div>
  );
}
