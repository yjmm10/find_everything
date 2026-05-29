/**
 * 扫描仓库 docs/weekly-digest-*.md，生成 public/digests.json（结构化条目含 keywords、source、时间窗）。
 * 在 vite build 前由 npm prebuild 调用。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeEntriesByLink } from "./dedupe-entries.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(REPO_ROOT, "docs");
const OUT = path.resolve(__dirname, "../public/digests.json");

const SOURCE_BY_HEADING = {
  "📄 Arxiv 前沿论文": "arxiv",
  "🎓 Semantic Scholar": "semantic_scholar",
  "📚 OpenAlex": "openalex",
  "📰 优质资讯/论坛": "rss",
  "🔥 GitHub 热门仓库": "github",
  "🔥 GitHub 周榜": "github_weekly",
  "🔎 GitHub 指定日期检索": "github_search",
};

const ALL_SOURCES = [
  "arxiv",
  "semantic_scholar",
  "openalex",
  "rss",
  "github",
  "github_weekly",
  "github_search",
];

function listDigestFiles() {
  if (!fs.existsSync(DOCS)) return [];
  return fs
    .readdirSync(DOCS)
    .filter((f) => /^weekly-digest-.+\.md$/i.test(f) && f !== "weekly-digest.md");
}

function slugFromFilename(name) {
  return name.replace(/^weekly-digest-/i, "").replace(/\.md$/i, "");
}

function parseMeta(block) {
  const kwM =
    block.match(/关键词组为[「『]([^」』]+)[」』]/) ||
    block.match(/检索关键词为[「『]([^」』]+)[」』]/);
  const kwDefault = block.match(/全局默认[「『]([^」』]+)[」』]/);
  const keywords = (kwM || kwDefault)?.[1]?.trim() ?? "";
  const win = block.match(
    /时间窗口\s*(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})/,
  );
  return {
    keywords,
    dateStart: win?.[1] ?? "",
    dateEnd: win?.[2] ?? "",
  };
}

function parseFileMeta(text) {
  const win = text.match(
    /时间窗口\s*(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})/,
  );
  const kwM =
    text.match(/关键词组为[「『]([^」』]+)[」』]/) ||
    text.match(/检索关键词为[「『]([^」』]+)[」』]/);
  return {
    keywords: kwM?.[1]?.trim() ?? "",
    dateStart: win?.[1] ?? "",
    dateEnd: win?.[2] ?? "",
  };
}

function isPlaceholderValue(v) {
  const t = String(v ?? "").trim();
  if (!t) return true;
  if (/^[-—–_\s.]+$/.test(t)) return true;
  return t === "无" || /^n\/?a$/i.test(t);
}

function isValidHttpLink(link) {
  const t = String(link ?? "").trim();
  if (isPlaceholderValue(t)) return false;
  return /^https?:\/\//i.test(t);
}

function crawlDateFromSlug(slug) {
  const m = slug.match(/_(\d{4})(\d{2})(\d{2})T\d{6}Z$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const win = slug.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/);
  if (win) return win[2];
  return "";
}

function extractSectionSummary(body) {
  const lines = body.split("\n");
  const parts = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("|")) break;
    if (t.startsWith(">")) continue;
    parts.push(t.replace(/^本表/, "本表"));
  }
  return parts.join(" ").trim();
}

function parseSections(text) {
  const parts = text.split(/^##\s+/m);
  const sections = [];
  for (const part of parts) {
    const lineEnd = part.indexOf("\n");
    const heading = (lineEnd === -1 ? part : part.slice(0, lineEnd)).trim();
    const body = lineEnd === -1 ? "" : part.slice(lineEnd + 1);
    const source = SOURCE_BY_HEADING[heading];
    if (!source) continue;
    const meta = parseMeta(body);
    const summary = extractSectionSummary(body);
    sections.push({
      source,
      heading,
      summary,
      dateStart: meta.dateStart,
      dateEnd: meta.dateEnd,
      keywords: meta.keywords,
      entryCount: 0,
    });
  }
  return sections;
}

function splitCells(line) {
  const raw = line.trim();
  if (!raw.startsWith("|")) return [];
  const inner = raw.slice(1, raw.endsWith("|") ? -1 : undefined);
  return inner.split("|").map((c) => c.trim());
}

function isSeparatorRow(line) {
  const cells = splitCells(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")));
}

function parseTable(block) {
  const lines = block.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  if (i >= lines.length) return { headers: [], rows: [] };
  const headers = splitCells(lines[i]);
  i++;
  if (i < lines.length && isSeparatorRow(lines[i])) i++;
  const rows = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) break;
    if (isSeparatorRow(line)) {
      i++;
      continue;
    }
    rows.push(splitCells(line));
    i++;
  }
  return { headers, rows };
}

function rowToEntry(headers, cells, source, meta, digestSlug, rowIndex) {
  const h = {};
  headers.forEach((key, j) => {
    if (key) h[key] = cells[j] ?? "";
  });
  const title = (h["标题"] ?? "").trim();
  const link = (h["链接"] ?? "").trim();
  const summary = (h["说明"] ?? "").trim();
  if (isPlaceholderValue(title) && !isValidHttpLink(link)) return null;
  if (isPlaceholderValue(title) && isPlaceholderValue(summary) && !isValidHttpLink(link)) {
    return null;
  }
  const scoreRaw = h["评分"] ?? "";
  const score = parseInt(String(scoreRaw).trim(), 10);
  const id = `${digestSlug}-${source}-${rowIndex}`;
  const tags = (h["标签"] ?? "").trim() || null;
  const publishedAt = (h["发表时间"] ?? "").trim() || null;
  const subject = (h["学科类别"] ?? "").trim() || null;
  const starRaw = h["Star"]?.trim() ?? "";
  const forkRaw = h["Fork"]?.trim() ?? "";
  const langRaw = h["主语言"]?.trim() ?? "";
  return {
    id,
    digestSlug,
    dateStart: meta.dateStart,
    dateEnd: meta.dateEnd,
    keywords: meta.keywords,
    source,
    score: Number.isFinite(score) ? score : null,
    title: isPlaceholderValue(title) ? "(无标题)" : title,
    summary: isPlaceholderValue(summary) ? "" : summary,
    link: isValidHttpLink(link) ? link : null,
    star: isPlaceholderValue(starRaw) ? null : starRaw,
    fork: isPlaceholderValue(forkRaw) ? null : forkRaw,
    language: isPlaceholderValue(langRaw) ? null : langRaw,
    tags,
    publishedAt,
    subject,
  };
}

function parseMarkdownFile(filePath, digestSlug, crawlDate) {
  const text = fs.readFileSync(filePath, "utf-8");
  const parts = text.split(/^##\s+/m);
  const entries = [];
  for (const part of parts) {
    const lineEnd = part.indexOf("\n");
    const heading = (lineEnd === -1 ? part : part.slice(0, lineEnd)).trim();
    const body = lineEnd === -1 ? "" : part.slice(lineEnd + 1);
    const source = SOURCE_BY_HEADING[heading];
    if (!source) continue;
    const meta = parseMeta(body);
    const { headers, rows } = parseTable(body);
    if (headers.length === 0) continue;
    rows.forEach((cells, idx) => {
      const e = rowToEntry(headers, cells, source, meta, digestSlug, idx);
      if (e) entries.push({ ...e, crawlDate });
    });
  }
  return entries;
}

function main() {
  const files = listDigestFiles().sort();
  const digests = [];
  const allEntries = [];

  for (const name of files) {
    const slug = slugFromFilename(name);
    const full = path.join(DOCS, name);
    const fileText = fs.readFileSync(full, "utf-8");
    const fileMeta = parseFileMeta(fileText);
    const crawlDate = crawlDateFromSlug(slug);
    const sections = parseSections(fileText);
    const rawEntries = parseMarkdownFile(full, slug, crawlDate);
    const { entries } = dedupeEntriesByLink(rawEntries, { digestSlug: slug });
    const meta =
      entries.length > 0
        ? {
          dateStart: entries[0].dateStart || fileMeta.dateStart,
          dateEnd: entries[0].dateEnd || fileMeta.dateEnd,
        }
        : { dateStart: fileMeta.dateStart, dateEnd: fileMeta.dateEnd };

    const entryCountBySource = {};
    for (const e of entries) {
      entryCountBySource[e.source] = (entryCountBySource[e.source] ?? 0) + 1;
    }
    for (const sec of sections) {
      sec.entryCount = entryCountBySource[sec.source] ?? 0;
    }

    digests.push({
      slug,
      file: name,
      markdownUrl: `docs/${name}`,
      crawlDate,
      dateStart: meta.dateStart,
      dateEnd: meta.dateEnd,
      entryCount: entries.length,
      sections,
    });
    allEntries.push(...entries);
  }

  digests.sort((a, b) => (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0));

  /** 跨期合并：设 DIGEST_DEDUPE_LINK=1 时在全部期次间按链接去重（默认保留各次抓取） */
  let entries = allEntries;
  if (process.env.DIGEST_DEDUPE_LINK === "1") {
    const { entries: deduped, removed } = dedupeEntriesByLink(allEntries, {
      global: true,
    });
    entries = deduped;
    if (removed > 0) {
      console.log(
        `parse-digests: 跨期按链接去重 ${allEntries.length} → ${entries.length} 条（DIGEST_DEDUPE_LINK=1）`,
      );
    }
  }

  const generatedAt = new Date().toISOString();
  const entriesByDigest = new Map();
  for (const entry of entries) {
    const list = entriesByDigest.get(entry.digestSlug) ?? [];
    list.push(entry);
    entriesByDigest.set(entry.digestSlug, list);
  }

  const updates = digests.map((d) => {
    const digestEntries = entriesByDigest.get(d.slug) ?? [];
    const sourceCounts = {};
    for (const source of ALL_SOURCES) {
      const count = digestEntries.filter((e) => e.source === source).length;
      if (count > 0) sourceCounts[source] = count;
    }
    const firstKeywords = digestEntries.find(
      (e) => typeof e.keywords === "string" && e.keywords.trim(),
    )?.keywords;
    return {
      id: d.slug,
      slug: d.slug,
      file: d.file,
      markdownUrl: d.markdownUrl,
      crawlDate: d.crawlDate,
      dateStart: d.dateStart,
      dateEnd: d.dateEnd,
      entryCount: digestEntries.length,
      sourceCounts,
      topKeywords: firstKeywords ?? "",
      sections: d.sections,
      updatedAt: generatedAt,
    };
  });

  const payload = {
    generatedAt,
    digests,
    updates,
    entries,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");

  const docsPublic = path.resolve(__dirname, "../public/docs");
  fs.mkdirSync(docsPublic, { recursive: true });
  for (const name of files) {
    fs.copyFileSync(path.join(DOCS, name), path.join(docsPublic, name));
  }

  console.log(
    `parse-digests: ${files.length} 个周报文件 → ${entries.length} 条条目 → ${OUT}（docs 已复制到 public/docs/）`,
  );
}

main();
