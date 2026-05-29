#!/usr/bin/env bash
# 本地完整流程：构建前端 → 打包 deploy/ → 推送到 gh-pages
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

NODE="${NODE:-node}"
if ! command -v npm >/dev/null 2>&1; then
  VITE_BIN="digest-viewer/node_modules/vite/bin/vite.js"
  if [ ! -f "$VITE_BIN" ]; then
    echo "Run: cd digest-viewer && npm ci" >&2
    exit 1
  fi
  run_vite() { "$NODE" "$VITE_BIN" "$@"; }
else
  run_vite() { (cd digest-viewer && npm run "$@"); }
fi

echo "==> Build viewer-data + Vite"
(cd digest-viewer && "$NODE" scripts/migrate-docs-to-json.mjs && "$NODE" scripts/build-viewer-data.mjs)
if command -v npm >/dev/null 2>&1; then
  (cd digest-viewer && VITE_BASE=/find_everything/ npm run build)
else
  (cd digest-viewer && VITE_BASE=/find_everything/ "$NODE" node_modules/vite/bin/vite.js build)
fi

echo "==> Prepare deploy bundle"
bash .github/scripts/prepare-gh-pages-deploy.sh

echo "==> Push to gh-pages"
cd deploy
if [ ! -d .git ]; then
  git init -q
  git config user.name "${GIT_USER_NAME:-github-actions[bot]}"
  git config user.email "${GIT_USER_EMAIL:-github-actions[bot]@users.noreply.github.com}"
fi
git add -A
if git diff --cached --quiet; then
  echo "No deploy changes."
  exit 0
fi
git commit -q -m "Deploy digest viewer + data $(date -u +%Y-%m-%dT%H:%MZ)"
git branch -M gh-pages
git push -f origin gh-pages
echo "Done: https://yjmm10.github.io/find_everything/"
