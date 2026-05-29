#!/usr/bin/env bash
# 从 gh-pages 恢复历史 data/；若无 data/ 则尝试恢复 docs/ 供迁移脚本使用。
set -euo pipefail

mkdir -p data

if ! git fetch origin gh-pages 2>/dev/null; then
  echo "No gh-pages branch yet; using workspace data/ if any."
  exit 0
fi

if git rev-parse --verify "origin/gh-pages:data^{tree}" >/dev/null 2>&1; then
  count="$(git ls-tree -r --name-only origin/gh-pages data 2>/dev/null | wc -l)"
  echo "Restoring data/ from origin/gh-pages (${count} files)"
  rm -rf data
  git checkout origin/gh-pages -- data
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
