# 技术周报前端（digest-viewer）

从仓库根目录的 `docs/weekly-digest-*.md` 解析结构化条目（含 **关键词组**、**信息源**、**数据时间窗**），构建静态站点并支持关键字检索与时间、信息源筛选。

## 本地开发

在仓库根目录执行：

```bash
cd digest-viewer
npm install
npm run dev
```

`dev` / `build` 前会自动运行 `scripts/parse-digests.mjs`，生成 `public/digests.json`。

## Vercel 一键部署

更完整的步骤、按钮链接模板与排错见 **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)**。

1. 将本仓库推送到 GitHub。
2. 在 [Vercel](https://vercel.com/new) 导入该仓库。
3. **Root Directory** 设为 `digest-viewer`。
4. Build Command：`npm run build`，Output Directory：`dist`（与 `vercel.json` 一致即可）。

或使用部署按钮（将 `YOUR_USER/YOUR_REPO` 换成你的仓库）：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USER/YOUR_REPO&root-directory=digest-viewer)

部署后，每次在 `docs/` 下新增或更新 `weekly-digest-*.md` 并推送，重新部署即可刷新索引。

## GitHub Pages（推荐：与仓库同源、无 monorepo 根目录困扰）

站点由 **`gh-pages` 分支**承载（静态 `dist`）。两种方式会更新站点：

1. **定时 / 手动周报**（[`.github/workflows/weekly-digest.yml`](../.github/workflows/weekly-digest.yml)）：在同一 job 里执行完 `python main.py` 后立刻 `npm run build` 并发布。  
   *原因：GitHub 规定用 `GITHUB_TOKEN` 的 push **不会**再触发其它 workflow，因此不能单靠「push docs → 触发第二个 workflow」衔接定时任务。*
2. **仅改文档或前端时**（[`.github/workflows/digest-site.yml`](../.github/workflows/digest-site.yml)）：在**默认分支**上推送 `docs/weekly-digest*.md`、`digest-viewer/` 等路径时构建并发布；也可 **Actions → 手动 Run workflow**。

**首次启用**

1. 仓库 **Settings → Pages**：Source 选 **Deploy from a branch**，Branch 选 **`gh-pages`** / **`/(root)`**。
2. 跑一次 **weekly-digest**（需成功生成周报）或 **digest-site** workflow，生成 `gh-pages` 分支。
3. 站点一般为：`https://<owner>.github.io/<repo>/`（`vite` 已设 `base: './'`）。

**数据合并**：构建前解析脚本支持环境变量 **`DIGEST_DEDUPE_LINK=1`**（workflow 里默认开启）：多份 `weekly-digest-*.md` 合并进 `digests.json` 时，对**相同链接**的条目只保留一条。在 GitHub **Settings → Variables** 中设 `DIGEST_DEDUPE_LINK` 为 `0` 可关闭。

## 数据说明

- **关键字**：匹配标题、说明、该板块解析出的关键词组、周报 slug、信息源名称。
- **时间**：选择与条目「数据窗」有重叠的日期范围即显示该条目。
- **信息源**：Arxiv / RSS / GitHub 可多选切换。
