#!/usr/bin/env bash
# 从 gh-pages 恢复历史 data/，并与工作区已有 data/ 合并（按 run id 去重，保留较新 executedAt）。
# 若无 data/ 则尝试恢复 docs/ 供迁移脚本使用。
set -euo pipefail

mkdir -p data/runs

merge_data_dirs() {
  local src="$1"
  local label="$2"
  if [ ! -d "$src/runs" ]; then
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}${PWD}" python - <<'PY' "$src/runs" "data/runs" "$label"
import sys
from pathlib import Path
from digest_export.storage import merge_runs_directory

src_runs, dest_runs, label = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
counts = merge_runs_directory(src_runs, dest_runs)
print(
    f"Merged runs from {label}: "
    f"+{counts['added']} new, {counts['updated']} updated, {counts['kept']} kept"
)
PY
  else
    local n=0
    for f in "$src/runs"/*.json; do
      [ -f "$f" ] || continue
      base="$(basename "$f")"
      if [ ! -f "data/runs/$base" ]; then
        cp "$f" "data/runs/$base"
        n=$((n + 1))
      fi
    done
    echo "Merged ${n} run(s) from ${label} (python unavailable; no executedAt merge)"
  fi
  if [ -f "$src/index.json" ] && [ ! -f "data/index.json" ]; then
    cp "$src/index.json" "data/index.json"
  fi
}

if ! git fetch origin gh-pages 2>/dev/null; then
  echo "No gh-pages branch yet; using workspace data/ if any."
  exit 0
fi

TMP_RESTORE=""
cleanup() {
  if [ -n "$TMP_RESTORE" ] && [ -d "$TMP_RESTORE" ]; then
    rm -rf "$TMP_RESTORE"
  fi
}
trap cleanup EXIT

if git rev-parse --verify "origin/gh-pages:data^{tree}" >/dev/null 2>&1; then
  count="$(git ls-tree -r --name-only origin/gh-pages data 2>/dev/null | wc -l)"
  echo "Restoring data/ from origin/gh-pages (${count} files) and merging with workspace"
  TMP_RESTORE="$(mktemp -d)"
  git archive origin/gh-pages data | tar -x -C "$TMP_RESTORE"
  merge_data_dirs "$TMP_RESTORE/data" "gh-pages"
elif git rev-parse --verify "origin/gh-pages:docs^{tree}" >/dev/null 2>&1; then
  count="$(git ls-tree -r --name-only origin/gh-pages docs 2>/dev/null | wc -l)"
  echo "gh-pages has no data/ yet; restoring docs/ for migration (${count} files)"
  mkdir -p docs
  rm -rf docs
  git checkout origin/gh-pages -- docs
else
  existing="$(find data/runs -name '*.json' 2>/dev/null | wc -l || echo 0)"
  echo "gh-pages has no data/ or docs/; keeping workspace data/ (${existing} runs)"
fi

# 用 Python 重建 index.json（合并后索引与 runs 一致）
if command -v python >/dev/null 2>&1; then
  python -m digest_export.migrate 2>/dev/null || true
fi
