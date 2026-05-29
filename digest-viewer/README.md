# 技术周报前端（digest-viewer）

从 **`data/runs/*.json`**（Schema v1）在构建时合并为 **`public/viewer-data.json`**，前端一次加载、客户端全量筛选（关键字、时间、信息源、期次、日历）。Markdown 原文内嵌于 JSON，不再依赖单独 `.md` 文件。

## 分支与 CI 流程

| 分支 | 职责 |
|------|------|
| **`master`** | 抓取与构建**源码**（Python、`digest-viewer`、workflow） |
| **`gh-pages`** | **数据 + 展示**：`data/` JSON 归档 + 构建后的静态站点（GitHub Pages） |

**定时抓取**（[weekly-digest.yml](../.github/workflows/weekly-digest.yml)）：**每周五 UTC 12:00**（北京时间周五 20:00）自动运行。

1. 检出并同步 **master**（最新抓取代码）
2. 从 **gh-pages** 恢复历史 `data/`（若无则恢复 `docs/` 供迁移）
3. 运行 `python main.py` 追加本期 `data/runs/{runId}.json`（`DIGEST_NO_GIT=1`）
4. `npm run build`：迁移遗留 `docs/` → `data/`（若需要）→ 合并 `viewer-data.json` → Vite 构建
5. 将 `dist/` + `data/` 发布到 **gh-pages**

**仅改前端时**（[digest-site.yml](../.github/workflows/digest-site.yml)）：master 代码 + gh-pages 已有 `data/` → 迁移/构建 → 更新 gh-pages。

**GitHub Pages**（项目站地址）：

- 线上：**https://yjmm10.github.io/find_everything/**
- 配置：仓库 **Settings → Pages** → Branch **`gh-pages`** → **`/(root)`**
- CI 构建时设 `VITE_BASE=/find_everything/`，保证静态资源与 `viewer-data.json` 路径正确

## 本地开发

```bash
cd digest-viewer
npm install
npm run dev
```

仓库根目录需有 `data/runs/*.json`，或先有 `docs/weekly-digest-*.md`（`prebuild` 会调用 `python -m digest_export.migrate` 生成 `data/`）。

```bash
# 仅重建 viewer-data.json
npm run build-data

# 从 docs 迁移到 data（需 Python）
cd .. && python -m digest_export.migrate
```

## 数据布局（gh-pages / 仓库根）

```
data/
  index.json           # 轻量索引
  runs/{runId}.json    # 单次抓取完整记录（含 content.markdownBody）
```

构建产物：`digest-viewer/public/viewer-data.json`（同期次去重、**跨期按链接保留最早一条**、按评分降序；`DIGEST_DEDUPE_LINK=0` 可关闭跨期去重）。

## Vercel 部署

见 [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)。Vercel 需能访问 `data/` 或预构建的 `viewer-data.json`；推荐直接使用 GitHub Pages。
