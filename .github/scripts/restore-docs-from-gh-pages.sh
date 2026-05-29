#!/usr/bin/env bash
# 从 gh-pages 恢复历史周报 docs/；若 gh-pages 尚无 docs/ 则保留当前工作区（首次部署或旧版仅含 dist）。
set -euo pipefail

mkdir -p docs

if ! git fetch origin gh-pages 2>/dev/null; then
  echo "No gh-pages branch yet; using workspace docs/ if any."
  exit 0
fi

# 必须用 rev-parse 判断 docs 是否为 tree；ls-tree 在无匹配时也可能 exit 0，导致误删工作区 docs/
if git rev-parse --verify "origin/gh-pages:docs^{tree}" >/dev/null 2>&1; then
  count="$(git ls-tree -r --name-only origin/gh-pages docs 2>/dev/null | wc -l)"
  echo "Restoring docs/ from origin/gh-pages (${count} files)"
  rm -rf docs
  git checkout origin/gh-pages -- docs
else
  existing="$(find docs -maxdepth 1 -name 'weekly-digest-*.md' 2>/dev/null | wc -l)"
  echo "gh-pages has no docs/ directory yet; keeping workspace docs/ (${existing} weekly-digest-*.md)"
fi
