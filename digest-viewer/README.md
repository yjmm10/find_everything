# 技术周报前端（digest-viewer）

从 **`docs/weekly-digest-*.md`** 解析结构化条目，构建静态站点，支持关键字、时间、信息源与期次筛选。页面展示**全部**抓取记录与条目。

## 分支与 CI 流程

| 分支 | 职责 |
|------|------|
| **`master`** | 抓取与构建**源码**（Python、`digest-viewer`、workflow） |
| **`gh-pages`** | **数据 + 展示**：`docs/` 周报归档 + 构建后的静态站点（GitHub Pages） |

**定时抓取**（[weekly-digest.yml](../.github/workflows/weekly-digest.yml)）：

1. 检出并同步 **master**（最新抓取代码）
2. 从 **gh-pages** 恢复历史 `docs/`
3. 运行 `python main.py` 追加本期周报（`DIGEST_NO_GIT=1`，不写 master）
4. `npm run build` 生成前端
5. 将 `dist/` + `docs/` 发布到 **gh-pages**

**仅改前端时**（[digest-site.yml](../.github/workflows/digest-site.yml)）：master 代码 + gh-pages 已有 `docs/` → 构建 → 更新 gh-pages。

**GitHub Pages**（项目站地址）：

- 线上：**https://yjmm10.github.io/find_everything/**
- 配置：仓库 **Settings → Pages** → Source **Deploy from a branch** → Branch **`gh-pages`** → **`/(root)`**
- CI 构建时设 `VITE_BASE=/find_everything/`，保证静态资源与 `digests.json` 路径正确

## 本地开发

```bash
cd digest-viewer
npm install
npm run dev
```

本地需在仓库根目录有 `docs/weekly-digest-*.md`（可从 `gh-pages` 分支拷贝 `docs/`，或使用 master 上遗留文件）。`dev` / `build` 前会自动运行 `parse-digests.mjs`。

## Vercel 部署

见 [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)。Vercel 从**当前分支**读取 `docs/`；若数据只在 gh-pages，需先检出 gh-pages 的 `docs/` 或改用 GitHub Pages。

## 数据说明

- **每次成功抓取**：`docs/weekly-digest-{数据窗}_{UTC时间}.md`，累积在 **gh-pages** 的 `docs/` 下。
- **混合数据**：列表/卡片/日历读 `digests.json`；完整周报读 `docs/*.md`（`markdownUrl` 字段）。
- **按日定位**：日历默认 **发表/发布日**（精确到某一天）；可切换 **抓取执行日** 或 **数据窗（整周）**。
- **板块说明**：JSON 内 `sections` 含 Markdown 各 `##` 段的摘要（如「本周无新增」）。
