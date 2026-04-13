/**
 * 扫描仓库 docs/weekly-digest-*.md，生成 public/digests.json（结构化条目含 keywords、source、时间窗）。
 * 在 vite build 前由 npm prebuild 调用。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(REPO_ROOT, "docs");
const OUT = path.resolve(__dirname, "../public/digests.json");

const SOURCE_BY_HEADING = {
  "📄 Arxiv 前沿论文": "arxiv",
  "📰 优质资讯/论坛": "rss",
  "🔥 GitHub 热门仓库": "github",
  "🔥 GitHub 周榜": "github_weekly",
  "🔎 GitHub 指定日期检索": "github_search",
};

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
  const kwM = block.match(/关键词组为[「『]([^」』]+)[」』]/);
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
  const title = h["标题"] ?? "";
  const link = h["链接"] ?? "";
  if (!title && !link) return null;
  const scoreRaw = h["评分"] ?? "";
  const score = parseInt(String(scoreRaw).trim(), 10);
  const id = `${digestSlug}-${source}-${rowIndex}`;
  const tags = (h["标签"] ?? "").trim() || null;
  const publishedAt = (h["发表时间"] ?? "").trim() || null;
  const subject = (h["学科类别"] ?? "").trim() || null;
  return {
    id,
    digestSlug,
    dateStart: meta.dateStart,
    dateEnd: meta.dateEnd,
    keywords: meta.keywords,
    source,
    score: Number.isFinite(score) ? score : null,
    title: title || "(无标题)",
    summary: h["说明"] ?? "",
    link: link || null,
    star: h["Star"]?.trim() || null,
    fork: h["Fork"]?.trim() || null,
    language: h["主语言"]?.trim() || null,
    tags,
    publishedAt,
    subject,
  };
}

function parseMarkdownFile(filePath, digestSlug) {
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
      if (e) entries.push(e);
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
    const entries = parseMarkdownFile(full, slug);
    const meta =
      entries.length > 0
        ? {
            dateStart: entries[0].dateStart,
            dateEnd: entries[0].dateEnd,
          }
        : { dateStart: "", dateEnd: "" };
    digests.push({
      slug,
      file: name,
      dateStart: meta.dateStart,
      dateEnd: meta.dateEnd,
      entryCount: entries.length,
    });
    allEntries.push(...entries);
  }

  digests.sort((a, b) => (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0));

  const payload = {
    generatedAt: new Date().toISOString(),
    digests,
    entries: allEntries,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
  console.log(
    `parse-digests: ${files.length} 个周报文件 → ${allEntries.length} 条条目 → ${OUT}`,
  );
}

main();
