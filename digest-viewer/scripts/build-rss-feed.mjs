/**
 * 从 public/viewer-data.json 生成 RSS 2.0 订阅源，每期为完整 Markdown 周报（HTML 正文）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simpleMarkdownToHtml } from "./markdown-render.mjs";
import { resolveSiteUrl } from "./site-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWER_DATA = path.resolve(__dirname, "../public/viewer-data.json");
const OUT = path.resolve(__dirname, "../public/feed.xml");

const FEED_TITLE = process.env.RSS_TITLE?.trim() || "技术周报归档";
const FEED_DESC =
  process.env.RSS_DESCRIPTION?.trim() ||
  "每周技术周报 Markdown 全文：Arxiv、Semantic Scholar、OpenAlex、RSS 资讯、GitHub 等来源汇总。";

function cdataSafe(text) {
  return text.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

function xmlText(text) {
  return escapeHtml(text);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822Date(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function digestTitle(update) {
  if (update.dateStart && update.dateEnd) {
    return `技术周报 ${update.dateStart} ~ ${update.dateEnd}`;
  }
  return `技术周报 ${update.slug}`;
}

function digestLink(siteUrl, slug) {
  return `${siteUrl}#markdown/${encodeURIComponent(slug)}`;
}

function plainDescription(markdown, update) {
  const lines = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|") && !/^:?-{3,}:?$/.test(l.replace(/\s/g, "")));
  const snippet = lines.find((l) => !l.startsWith("#") && !l.startsWith(">")) ?? "";
  const plain = snippet.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const head = plain.slice(0, 280);
  const suffix = update.entryCount ? `（共 ${update.entryCount} 条）` : "";
  return head ? `${head}${suffix}` : `本期周报${suffix}`;
}

function itemHtml(markdown) {
  const body = simpleMarkdownToHtml(markdown);
  return `<div style="font-family:system-ui,sans-serif;line-height:1.6">${body}</div>`;
}

function buildFeed(payload, siteUrl) {
  const updates = [...(payload.updates ?? [])].sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );

  const feedUrl = `${siteUrl}feed.xml`;
  const lastBuild = rfc822Date(payload.generatedAt);

  const items = updates
    .filter((u) => u.markdownBody?.trim())
    .map((u) => {
      const title = digestTitle(u);
      const link = digestLink(siteUrl, u.slug);
      const pubDate = rfc822Date(u.updatedAt || u.crawlDate);
      const description = plainDescription(u.markdownBody, u);
      const html = itemHtml(u.markdownBody);

      return `
    <item>
      <title>${xmlText(title)}</title>
      <link>${xmlText(link)}</link>
      <guid isPermaLink="true">${xmlText(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${cdataSafe(description)}]]></description>
      <content:encoded><![CDATA[${cdataSafe(html)}]]></content:encoded>
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlText(FEED_TITLE)}</title>
    <link>${xmlText(siteUrl)}</link>
    <description>${xmlText(FEED_DESC)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>find_everything digest-viewer</generator>
    <atom:link href="${xmlText(feedUrl)}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>
`;
}

function main() {
  if (!fs.existsSync(VIEWER_DATA)) {
    console.error(`build-rss-feed: missing ${VIEWER_DATA}; run build-viewer-data first.`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(VIEWER_DATA, "utf-8"));
  const siteUrl = resolveSiteUrl();
  const xml = buildFeed(payload, siteUrl);

  fs.writeFileSync(OUT, xml, "utf-8");
  const count = (payload.updates ?? []).filter((u) => u.markdownBody?.trim()).length;
  console.log(`build-rss-feed: ${count} items → ${OUT} (site: ${siteUrl})`);
}

main();
