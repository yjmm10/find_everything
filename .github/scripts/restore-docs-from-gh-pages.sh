#!/usr/bin/env bash
# 从 gh-pages 恢复历史周报 docs/；若 gh-pages 尚无数据则保留当前工作区 docs/（便于首次从 master 迁移）。
set -euo pipefail

mkdir -p docs

if ! git fetch origin gh-pages 2>/dev/null; then
  echo "No gh-pages branch yet; using workspace docs/ if any."
  exit 0
fi

if git ls-tree -d origin/gh-pages docs &>/dev/null; then
  echo "Restoring docs/ from origin/gh-pages"
  rm -rf docs
  git checkout origin/gh-pages -- docs
else
  echo "gh-pages has no docs/ yet; using workspace docs/ if any."
fi
