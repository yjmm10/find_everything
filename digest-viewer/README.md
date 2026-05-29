# 技术周报前端（digest-viewer）

从仓库根目录的 `docs/weekly-digest-*.md` 解析结构化条目（含 **关键词组**、**信息源**、**数据时间窗**），构建静态站点并支持关键字检索与时间、信息源筛选。页面顶部展示 **更新记录**（每次 action 生成/更新一期 digest 对应一条），可点击快速筛到该期。

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

## GitHub Pages（推荐：代码与周报展示分离）

| 分支 | 内容 | 用途 |
|------|------|------|
| **`master`** | 源码、`docs/weekly-digest-*.md` 周报数据 | 开发与 CI 写入数据 |
| **`gh-pages`** | 仅 `digest-viewer/dist` 静态文件 | **线上展示**（Pages 站点读此分支） |

**Settings → Pages**：Source 选 **Deploy from a branch**，Branch **`gh-pages`** / **`/(root)`**。访问地址一般为 `https://<owner>.github.io/<repo>/`。

更新站点的方式：

1. **定时 / 手动周报**（[`.github/workflows/weekly-digest.yml`](../.github/workflows/weekly-digest.yml)）：以 `master` 为基准 → 生成并 **仅提交 `docs/` 到 master** → 构建 → 推 **gh-pages**。  
   *`GITHUB_TOKEN` 的 push 不会触发其它 workflow，故定时任务必须在同一 job 内完成发布。*
2. **改文档或前端后**（[`.github/workflows/digest-site.yml`](../.github/workflows/digest-site.yml)）：在 **`master`** 推送 `docs/` 或 `digest-viewer/` 时构建并发布 **gh-pages**；也可 Actions 手动运行。

**首次启用**

1. 仓库 **Settings → Pages**：Source 选 **Deploy from a branch**，Branch 选 **`gh-pages`** / **`/(root)`**。
2. 跑一次 **weekly-digest**（需成功生成周报）或 **digest-site** workflow，生成 `gh-pages` 分支。
3. 站点一般为：`https://<owner>.github.io/<repo>/`（`vite` 已设 `base: './'`）。

**归档与展示**：每次成功抓取会写入独立的 `docs/weekly-digest-{数据窗}_{UTC时间}.md` 并保留在 `master`；前端默认展示**全部**抓取记录与**全部**条目（不按链接去重）。若需合并重复链接，在 workflow 或本地构建时设 `DIGEST_DEDUPE_LINK=1`。

## 数据说明

- **更新记录**：`digests.json` 中的 `updates` 数组，**每次成功抓取**一条（含数据窗、抓取 UTC 时间 slug、条目数、来源分布）。页面展示全部记录，不限条数。
- **关键字**：匹配标题、说明、该板块解析出的关键词组、周报 slug、信息源名称。
- **时间**：选择与条目「数据窗」有重叠的日期范围即显示该条目。
- **信息源**：Arxiv / RSS / GitHub 可多选切换。
- **指定期次**：下拉或点击更新记录，只显示该 `weekly-digest-*.md` 对应条目。
