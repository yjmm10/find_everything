/**
 * 将 docs/weekly-digest-*.md 迁移为 data/runs/*.json（若 run 尚不存在）。
 * 构建前调用；逻辑与 digest_export/migrate.py 对齐。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(REPO_ROOT, "docs");
const DATA = path.join(REPO_ROOT, "data");

function tryPythonMigrate() {
  const r = spawnSync("python", ["-m", "digest_export.migrate"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  if (r.status === 0) {
    console.log((r.stdout || "").trim() || "migrate-docs-to-json: python migrate ok");
    return true;
  }
  return false;
}

function listDigestFiles() {
  if (!fs.existsSync(DOCS)) return [];
  return fs
    .readdirSync(DOCS)
    .filter((f) => /^weekly-digest-.+\.md$/i.test(f) && f !== "weekly-digest.md");
}

function main() {
  const files = listDigestFiles();
  const runsDir = path.join(DATA, "runs");
  const missing = files.filter((f) => {
    const slug = f.replace(/^weekly-digest-/i, "").replace(/\.md$/i, "");
    return !fs.existsSync(path.join(runsDir, `${slug}.json`));
  });

  if (missing.length === 0) {
    if (files.length) {
      console.log(`migrate-docs-to-json: ${files.length} docs, all runs present`);
    }
    return;
  }

  if (tryPythonMigrate()) return;

  console.warn(
    `migrate-docs-to-json: ${missing.length} docs need migration but python failed; run: python -m digest_export.migrate`,
  );
  process.exitCode = 1;
}

main();
