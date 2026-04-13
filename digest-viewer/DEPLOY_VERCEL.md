# Vercel 一键部署：技术周报前端（digest-viewer）

本文说明如何把本仓库中的 **`digest-viewer`** 子目录部署到 Vercel。站点在构建时会读取仓库根目录的 **`docs/weekly-digest-*.md`**，生成可检索的静态页面。

---

## 前置条件

- 代码已托管在 **GitHub**（或 Vercel 支持的其它 Git 提供商）。
- 仓库根目录下存在 **`docs/`** 与若干 **`weekly-digest-*.md`**（无则站点仍可部署，但列表为空）。

---

## 方式一：一键部署（推荐）

1. 将下面按钮链接里的 **`YOUR_USER/YOUR_REPO`** 换成你的 GitHub 仓库路径（例如 `octocat/find_everything`）。
2. 在浏览器中打开该链接，按 Vercel 提示登录并导入项目。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USER%2FYOUR_REPO&root-directory=digest-viewer)

**可直接复制的链接模板**（请替换用户名与仓库名）：

```text
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USER%2FYOUR_REPO&root-directory=digest-viewer
```

导入向导中请确认 **Root Directory** 为 **`digest-viewer`**（若使用上述带 `root-directory` 的链接，一般会预填）。

---

## 方式二：在 Vercel 控制台手动导入

1. 打开 [Vercel — New Project](https://vercel.com/new)。
2. **Import** 你的 Git 仓库。
3. 在 **Configure Project** 中设置：
   | 项 | 值 |
   | --- | --- |
   | **Root Directory** | `digest-viewer`（点击 Edit 选择该子目录） |
   | **Framework Preset** | Vite（通常会自动识别） |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |
   | **Install Command** | `npm install`（默认即可） |

   子目录内的 [`vercel.json`](./vercel.json) 已与上述配置一致；若界面与 `vercel.json` 冲突，以能成功构建为准。

4. 点击 **Deploy**。首次构建会执行 `prebuild`，运行 `scripts/parse-digests.mjs` 生成 `public/digests.json`。

**说明**：本前端为纯静态站点，**一般不需要**在 Vercel 中配置 `OPENAI_API_KEY` 等环境变量；周报内容由仓库里的 Markdown 在构建期解析。

---

## 部署后如何更新线上内容

- 在默认生产分支上 **修改或新增** `docs/weekly-digest-*.md` 并 **push**，Vercel 会对该仓库触发 **新的 Deployment**，构建完成后站点即展示最新索引。
- 若希望不提交代码也能触发构建，可在 Vercel 项目 **Settings → Git → Deploy Hooks** 创建 Hook，用 HTTP 请求触发重新部署。

---

## 常见问题

### 构建报错找不到 `docs/` 下的文件

解析脚本从**仓库根目录**读取 `docs/`，即路径为 `../../docs`（相对 `digest-viewer`）。请确认周报文件已提交并推送到连接 Vercel 的分支，且 **Root Directory** 仅为 `digest-viewer`（不要把整个 monorepo 根当成输出目录而改错结构）。

### 本地能跑、Vercel 上条目为空

检查线上构建日志里 `parse-digests` 是否输出「0 个周报文件」。通常是 **`weekly-digest-*.md` 未进入该分支** 或命名不符合 `weekly-digest-<slug>.md`（不含单独的 `weekly-digest.md` 作为归档源）。

### 自定义域名

在 Vercel 项目 **Settings → Domains** 绑定域名并按提示配置 DNS 即可。

---

## 相关文件

- [`README.md`](./README.md) — 功能说明与本地开发
- [`vercel.json`](./vercel.json) — 构建与输出目录配置
- [`scripts/parse-digests.mjs`](./scripts/parse-digests.mjs) — Markdown → `digests.json`
