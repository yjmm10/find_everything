#!/usr/bin/env bash
# 打包 GitHub Pages 发布目录：站点静态资源 + 全部 data/（JSON 归档）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ ! -d digest-viewer/dist ]; then
  echo "digest-viewer/dist not found; run npm run build first." >&2
  exit 1
fi

rm -rf deploy
mkdir -p deploy
cp -r digest-viewer/dist/* deploy/
if [ -d data ]; then
  cp -r data deploy/data
fi

echo "Deploy bundle ready: $(find deploy -type f | wc -l) files"
