/**
 * 合并 data/index.json + data/runs/*.json → public/viewer-data.json
 * 供前端一次加载、客户端全量筛选。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    runs.sort((a, b) => (a.crawl?.executedAt < b.crawl?.executedAt ? 1 : -1));
  }
  return runs;
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
    for (const e of sec.entries ?? []) {
      entries.push({
        id: e.id,
        digestSlug: run.id,
        dateStart: sec.dateStart || winStart,
        dateEnd: sec.dateEnd || winEnd,
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
        publishedAt: e.publishedAt ?? null,
        subject: e.extra?.subject ?? null,
        crawlDate,
      });
    }
  }
  return entries;
}

function topKeywords(run) {
  for (const sec of run.sections ?? []) {
    if (sec.keywords?.trim()) return sec.keywords.trim();
  }
  for (const e of flattenEntries(run)) {
    if (e.keywords?.trim()) return e.keywords.trim();
  }
  return "";
}

function main() {
  const runs = loadRuns();
  const generatedAt = new Date().toISOString();
  const allEntries = [];

  const digests = runs.map((run) => {
    const sections = (run.sections ?? []).map(sectionToFrontend);
    const entries = flattenEntries(run);
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
      entryCount: run.stats?.entryCount ?? entries.length,
      sections,
    };
  });

  let entries = allEntries;
  if (process.env.DIGEST_DEDUPE_LINK === "1") {
    const seen = new Set();
    entries = [];
    for (const e of allEntries) {
      const link = (e.link && String(e.link).trim()) || "";
      if (link) {
        if (seen.has(link)) continue;
        seen.add(link);
      }
      entries.push(e);
    }
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
      topKeywords: topKeywords(run ?? { sections: d.sections }),
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
