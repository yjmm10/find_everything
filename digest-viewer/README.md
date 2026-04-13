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

## 数据说明

- **关键字**：匹配标题、说明、该板块解析出的关键词组、周报 slug、信息源名称。
- **时间**：选择与条目「数据窗」有重叠的日期范围即显示该条目。
- **信息源**：Arxiv / RSS / GitHub 可多选切换。
