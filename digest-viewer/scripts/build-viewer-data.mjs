/**
 * 合并 data/index.json + data/runs/*.json → public/viewer-data.json
 * 供前端一次加载、客户端全量筛选。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareScoreDesc,
  dedupeEntriesByLink,
  dedupeEntriesGlobalKeepEarliest,
} from "./dedupe-entries.mjs";
import { sundayForGithubWeekly } from "./date-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(REPO_ROOT, "data");
const OUT = path.resolve(__dirname, "../public/viewer-data.json");

const ALL_SOURCES = [
  "arxiv",
  "semantic_scholar",
  "openalex",
  "rss",
  "github",
  "github_weekly",
  "github_search",
];

function runExecutedAt(run) {
  return run.crawl?.executedAt ?? run.id ?? "";
}

/** 同一数据窗只保留最早一次抓取 */
function dedupeRunsByWindow(runs) {
  const byWindow = new Map();
  let removed = 0;
  for (const run of runs) {
    const start = run.window?.dateStart ?? "";
    const end = run.window?.dateEnd ?? "";
    const key = `${start}\0${end}`;
    const prev = byWindow.get(key);
    if (!prev) {
      byWindow.set(key, run);
      continue;
    }
    removed += 1;
    if (runExecutedAt(run) < runExecutedAt(prev)) {
      byWindow.set(key, run);
    }
  }
  const out = [...byWindow.values()];
  out.sort((a, b) => runExecutedAt(b).localeCompare(runExecutedAt(a)));
  return { runs: out, removed };
}

function loadRuns() {
  const indexPath = path.join(DATA, "index.json");
  const runsDir = path.join(DATA, "runs");
  if (!fs.existsSync(indexPath) || !fs.existsSync(runsDir)) {
    return [];
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const runs = [];
  for (const summary of index.runs ?? []) {
    const p = path.join(runsDir, `${summary.id}.json`);
    if (!fs.existsSync(p)) continue;
    runs.push(JSON.parse(fs.readFileSync(p, "utf-8")));
  }
  if (runs.length === 0) {
    const files = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      runs.push(JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf-8")));
    }
  }
  const { runs: deduped } = dedupeRunsByWindow(runs);
  return deduped;
}

function sectionToFrontend(sec) {
  return {
    source: sec.source,
    heading: sec.heading,
    summary: sec.summary ?? "",
    dateStart: sec.dateStart ?? "",
    dateEnd: sec.dateEnd ?? "",
    keywords: sec.keywords ?? "",
    entryCount: sec.entryCount ?? (sec.entries?.length ?? 0),
  };
}

function flattenEntries(run) {
  const crawlDate = run.crawl?.crawlDate ?? "";
  const winStart = run.window?.dateStart ?? "";
  const winEnd = run.window?.dateEnd ?? "";
  const entries = [];
  for (const sec of run.sections ?? []) {
    const secStart = sec.dateStart || winStart;
    const secEnd = sec.dateEnd || winEnd;
    for (const e of sec.entries ?? []) {
      let publishedAt = e.publishedAt ?? null;
      if (
        (sec.source === "github_weekly" || sec.source === "github") &&
        !publishedAt
      ) {
        publishedAt = sundayForGithubWeekly(secStart, secEnd);
      }
      entries.push({
        id: e.id,
        digestSlug: run.id,
        dateStart: secStart,
        dateEnd: secEnd,
        keywords: e.keywords || sec.keywords || "",
        source: sec.source,
        score: e.score ?? null,
        title: e.title,
        summary: e.summary ?? "",
        link: e.link ?? null,
        star: e.extra?.star ?? null,
        fork: e.extra?.fork ?? null,
        language: e.extra?.language ?? null,
        tags: e.tags ?? null,
        publishedAt,
        subject: e.extra?.subject ?? null,
        crawlDate,
      });
    }
  }
  return entries;
}

function topKeywords(run, entries) {
  for (const sec of run.sections ?? []) {
    if (sec.keywords?.trim()) return sec.keywords.trim();
  }
  for (const e of entries) {
    if (e.keywords?.trim()) return e.keywords.trim();
  }
  return "";
}

function sectionsWithEntryCounts(run, entries) {
  const bySource = {};
  for (const e of entries) {
    bySource[e.source] = (bySource[e.source] ?? 0) + 1;
  }
  return (run.sections ?? []).map((sec) => ({
    ...sectionToFrontend(sec),
    entryCount: bySource[sec.source] ?? 0,
  }));
}

function main() {
  const indexPath = path.join(DATA, "index.json");
  const runsDir = path.join(DATA, "runs");
  let rawRunCount = 0;
  if (fs.existsSync(runsDir)) {
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      rawRunCount = (index.runs ?? []).filter((s) =>
        fs.existsSync(path.join(runsDir, `${s.id}.json`)),
      ).length;
    } else {
      rawRunCount = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json")).length;
    }
  }
  const runs = loadRuns();
  if (rawRunCount > runs.length) {
    console.log(
      `build-viewer-data: 同期次去重 ${rawRunCount - runs.length} 个重复 run`,
    );
  }
  const generatedAt = new Date().toISOString();
  const allEntries = [];
  let perRunRemoved = 0;

  const digests = runs.map((run) => {
    const raw = flattenEntries(run);
    const { entries, removed } = dedupeEntriesByLink(raw, { digestSlug: run.id });
    perRunRemoved += removed;
    allEntries.push(...entries);
    return {
      slug: run.id,
      runId: run.id,
      file: `runs/${run.id}.json`,
      markdownUrl: "",
      markdownBody: run.content?.markdownBody ?? "",
      crawlDate: run.crawl?.crawlDate ?? "",
      dateStart: run.window?.dateStart ?? "",
      dateEnd: run.window?.dateEnd ?? "",
      entryCount: entries.length,
      sections: sectionsWithEntryCounts(run, entries),
    };
  });

  let entries = allEntries;
  let globalRemoved = 0;
  const skipGlobal = process.env.DIGEST_DEDUPE_LINK === "0";
  if (!skipGlobal) {
    const deduped = dedupeEntriesGlobalKeepEarliest(allEntries);
    entries = deduped.entries;
    globalRemoved = deduped.removed;
  }
  entries.sort(compareScoreDesc);

  if (perRunRemoved > 0) {
    console.log(
      `build-viewer-data: 单期内按链接去重 ${perRunRemoved} 条重复`,
    );
  }
  if (globalRemoved > 0) {
    console.log(
      `build-viewer-data: 跨期按链接去重 ${globalRemoved} 条（保留时间最早）`,
    );
  }

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
    const run = runs.find((r) => r.id === d.slug);
    return {
      id: d.slug,
      slug: d.slug,
      runId: d.slug,
      file: d.file,
      markdownUrl: "",
      markdownBody: d.markdownBody,
      crawlDate: d.crawlDate,
      dateStart: d.dateStart,
      dateEnd: d.dateEnd,
      entryCount: digestEntries.length,
      sourceCounts,
      topKeywords: topKeywords(run ?? { sections: d.sections }, digestEntries),
      sections: d.sections,
      updatedAt: run?.crawl?.executedAt ?? generatedAt,
    };
  });

  const payload = {
    schemaVersion: "1",
    generatedAt,
    digests,
    updates,
    entries,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
  console.log(
    `build-viewer-data: ${runs.length} runs → ${entries.length} entries → ${OUT}`,
  );
}

main();
