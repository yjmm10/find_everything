import { useEffect, useState } from "react";

export interface DigestDocViewerProps {
  markdownUrl: string;
  slug: string;
  markdownBody?: string;
  onClose: () => void;
}

export default function DigestDocViewer({
  markdownUrl,
  slug,
  markdownBody,
  onClose,
}: DigestDocViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const embedded = markdownBody?.trim() ?? "";
    if (embedded) {
      setContent(embedded);
      setError(null);
      setLoading(false);
      return;
    }
    const url = `${import.meta.env.BASE_URL}${markdownUrl.replace(/^\//, "")}`;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`无法加载文档 (${r.status})`);
        return r.text();
      })
      .then((text) => setContent(text))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [markdownUrl, markdownBody]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="doc-overlay" role="dialog" aria-modal="true" aria-label={`周报 ${slug}`}>
      <div className="doc-panel">
        <header className="doc-panel__head">
          <div>
            <h2 className="doc-panel__title">完整周报（Markdown）</h2>
            <p className="doc-panel__sub">{slug}</p>
          </div>
          <button type="button" className="doc-panel__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="doc-panel__body">
          {loading && <p className="muted">正在加载 Markdown…</p>}
          {error && (
            <p className="doc-panel__error">
              {error}
              <br />
              <span className="muted">请确认 CI 已将 data/ 发布到 gh-pages。</span>
            </p>
          )}
          {content && <pre className="doc-md__raw">{content}</pre>}
        </div>
      </div>
      <button type="button" className="doc-overlay__backdrop" onClick={onClose} aria-label="关闭" />
    </div>
  );
}
