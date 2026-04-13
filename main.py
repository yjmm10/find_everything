import os
import sys
import copy
import datetime
from pathlib import Path
import requests
import yaml
import smtplib
import markdown
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from openai import OpenAI
from dotenv import load_dotenv

from digest_sources import DEFAULT_SOURCES, FetchContext
from digest_sources.config_helpers import source_keywords
from digest_sources.date_range import build_digest_date_window
from digest_sources.util import log

_SCRIPT_DIR = Path(__file__).resolve().parent

DEFAULT_DIGEST_CONFIG = {
    "keywords": "AI, LLM",
    # 数据窗口：preset 为执行日前一完整 day/week/month；也可用 start+end 指定绝对区间
    "date_range": {
        "preset": "week",
    },
    "rss_max_items": 8,
    "rss_feeds": [
        "https://hnrss.org/frontpage",
        "https://feeds.feedburner.com/TechCrunch/",
        "https://www.reddit.com/r/MachineLearning/.rss",
        "https://www.reddit.com/r/LocalLLaMA/.rss",
    ],
    "arxiv": {
        "enabled": True,
        # backend: 首选 api 或 library；另一路自动作备用（网络/解析失败时切换）
        "backend": "api",
        "keywords": "uav,llm",
        "max_results": 8,
        "sort_by": "submittedDate",
        "sort_order": "descending",
        "library_delay_seconds": 3.0,
        "library_page_size": 100,
        "library_num_retries": 3,
    },
    "rss": {
        "enabled": True,
        "max_items": 8,
        "keywords": None,
        "feeds": [
            {"url": "https://hnrss.org/frontpage"},
            {"url": "https://feeds.feedburner.com/TechCrunch/"},
            {"url": "https://www.reddit.com/r/MachineLearning/.rss"},
            {"url": "https://www.reddit.com/r/LocalLLaMA/.rss"},
        ],
    },
    "github_trending": {
        "enabled": True,
        "keywords": None,
        # Trending RSS：榜单原样取数，不按关键词筛；默认 GitHubTrendingRSS
        "url": "https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml",
        "max_repos": 8,
        "request_timeout": 60,
        "user_agent": "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)",
        "api_enrich": True,
        "api_timeout": 20,
    },
    "github_repository_search": {
        # 全站 search/repositories，非 Trending RSS
        "enabled": False,
        "keywords": None,
        "max_repos": 8,
        "user_agent": "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)",
        "api_timeout": 20,
        "search_sort": "stars",
        "search_order": "desc",
        "search_restrict_pushed": True,
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_digest_config() -> dict:
    """加载订阅配置：默认 DIGEST_CONFIG 指向脚本同目录下的 digest_config.yaml。"""
    name = os.getenv("DIGEST_CONFIG", "digest_config.yaml")
    path = Path(name) if Path(name).is_absolute() else _SCRIPT_DIR / name
    cfg = copy.deepcopy(DEFAULT_DIGEST_CONFIG)
    if path.is_file():
        with open(path, encoding="utf-8") as f:
            user = yaml.safe_load(f)
        if user is None:
            user = {}
        if not isinstance(user, dict):
            raise ValueError(f"配置文件根节点必须是 YAML 映射（键值对象）: {path}")
        cfg = _deep_merge(cfg, user)
        log(f"📋 已加载配置: {path}")
    else:
        log(f"📋 未找到 {path}，使用内置默认配置（可创建该文件自定义订阅）")
    return cfg


def _openai_base_url() -> str:
    """与官方 SDK 一致：base_url 应指向 …/v1（无末尾空格），否则会拼出错误路径导致 404。"""
    raw = (os.getenv("OPENAI_API_BASE") or "https://api.openai.com/v1").strip()
    return raw.rstrip("/")


def summarize_with_ai(raw_sections: str, keyword_context: str, date_str: str):
    model = (os.getenv("AI_MODEL", "gpt-4o-mini") or "gpt-4o-mini").strip()
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    base_url = _openai_base_url()
    log(f"🤖 [AI] 调用模型 {model} 生成周报（可能需数十秒）…")
    log(f"🤖 [AI] 实际请求约: {base_url}/chat/completions")
    client = OpenAI(api_key=api_key or None, base_url=base_url)

    prompt = f"""你是一个资深技术研究员。请根据以下原始数据，整理一份【{date_str}】技术周报。
关键词与抓取说明：{keyword_context}

要求（务必遵守）：
1. 输出纯 Markdown，适合手机阅读；不要任何前言/后语。
2. 必须包含四个板块，顺序固定：## 📄 Arxiv 前沿论文 → ## 📰 优质资讯/论坛 → ## 🔥 GitHub 周榜 → ## 🔎 GitHub 指定日期检索。
2b. **两个 GitHub 板块含义不同**，板块说明中必须写清楚：① **周榜**＝Trending 类 RSS 的榜单原始条目，**不做**关键词过滤或删减；② **指定日期检索**＝官方 `search/repositories` 在**全站公开仓库**范围内按关键词与时间条件（多为 `pushed:`）筛出的结果，**不是**周榜/日榜榜单本身。
3. **每个板块**在表格前先写 1～2 句「板块说明」：本表数据来自哪类源、与配置关键词/时间窗的关系（勿编造配置里不存在的规则）。
4. **每个板块**用一张 **Markdown 表格** 汇总条目；表头列名请**原样使用**下列中文（便于下游解析）：
   - 通用列（**所有板块**）：**评分**｜**标题**｜**说明**｜**链接**｜**标签**
   - **评分**：0～10 整数；**GitHub 周榜**侧重热度与代表性；**GitHub 指定日期检索**侧重与检索关键词及时间条件；**Arxiv / RSS** 侧重与当周主题贴合度、新颖度、可验证性；**同行按评分降序**。
   - **说明**：一行中文要点（勿空泛）。
   - **链接**：必须与原始数据 URL 一致，**禁止编造**。
   - **标签**：2～5 个技术向词，**中文或通用英文**，**英文逗号**分隔；请根据该行「标题 + 说明」**自行归纳**（勿照抄整句标题），用于用户后续检索。
   - **Arxiv 前沿论文**板块在以上五列之外，还须增加两列：**发表时间**（YYYY-MM-DD，须与下方原始数据中该条「发表日期」一致）｜**学科类别**（须与原始「学科主分类(arXiv)」一致，如 cs.LG；原始缺省时填「-」）。
5. 两个 **GitHub** 板块在通用列之外，还须包含 **Star**、**Fork**、**主语言** 三列（原始有则填数/语言名，无则「-」）。
6. 若某板块原始数据为空或仅含「(无)」，写一句说明并给出仅表头的空表或省略表体，勿虚构条目。
7. 可忽略明显重复、低质或与原始数据不符的项；信息量允许时总篇幅约 1200～2500 字当量（表格为主）。

原始数据：
{raw_sections}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=int(os.getenv("AI_MAX_TOKENS", "4000")),
        )
    except Exception as e:
        log(f"❌ [AI] chat.completions 调用失败: {type(e).__name__}: {e}")
        log(
            "💡 [AI] 若为 404：① 核对网关文档里的 OpenAI 兼容 base 是否以 /v1 结尾、"
            "且 .env 中无行尾空格；② 模型名 AI_MODEL 须为该网关上实际可用的 id（"
            "错误 id 时部分网关会返回 404）；③ 官方 OpenAI 请使用 https://api.openai.com/v1 。"
        )
        return ""

    log("✅ [AI] 生成完成")

    if response is None:
        log("⚠️ [AI] 响应对象为 None")
        return ""

    choices = getattr(response, "choices", None)
    if choices is None:
        log(
            "⚠️ [AI] response.choices 为 None（网关/兼容层未返回标准 ChatCompletion），"
            f"response 类型: {type(response).__name__}"
        )
        return ""
    if not isinstance(choices, (list, tuple)) or len(choices) == 0:
        log(
            "⚠️ [AI] response.choices 非列表或为空，"
            f"实际类型: {type(choices).__name__}"
        )
        return ""

    ch0 = choices[0]
    if ch0 is None:
        log("⚠️ [AI] choices[0] 为 None")
        return ""

    msg = getattr(ch0, "message", None)
    text = None
    if msg is not None:
        text = getattr(msg, "content", None)
    if text is None and hasattr(ch0, "text"):
        text = getattr(ch0, "text", None)

    if text is None or not str(text).strip():
        fr = getattr(ch0, "finish_reason", None)
        log(
            "⚠️ [AI] 模型返回空内容或无 message.content，将写入空文档"
            f"（finish_reason={fr!r}；请核对模型名、API 兼容、额度）"
        )
        return ""
    return str(text)


def _inject_crawl_timestamp(md_body: str) -> str:
    """在首个 Markdown 标题行后插入爬取时间（UTC），区分数据窗口与生成时刻。"""
    text = md_body if isinstance(md_body, str) else ""
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    stamp_line = f"> **爬取时间**：{ts}"
    t = text.rstrip("\n")
    if not t.strip():
        return stamp_line + "\n"
    first_nl = t.find("\n")
    if first_nl == -1:
        first, rest = t, ""
    else:
        first, rest = t[:first_nl], t[first_nl + 1 :]
    if first.lstrip().startswith("#"):
        parts = [first, "", stamp_line]
        if rest.strip():
            parts.extend(["", rest.lstrip("\n")])
        return "\n".join(parts) + "\n"
    return "\n".join([stamp_line, "", t]) + "\n"


def _digest_markdown_is_effectively_empty(md_body: str) -> bool:
    """
    AI 失败或网关返回空时，_inject_crawl_timestamp 可能只产出「爬取时间」一行。
    此类内容不应写入仓库，以免覆盖已有周报。
    """
    t = (md_body or "").strip()
    if not t:
        return True
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    if len(lines) == 1 and "爬取时间" in lines[0]:
        return True
    return False


def save_and_commit(md_content: str, digest_slug: str) -> str:
    """
    写入 docs/weekly-digest-{slug}.md/html，并同步 docs/weekly-digest.md/html 为最新副本。
    digest_slug 建议为「数据窗起止」如 2026-04-01_2026-04-07（仅字母数字与下划线、连字符）。
    返回带日期档名的相对路径（.md）。
    """
    log("💾 Saving & committing to repo...")
    os.makedirs("docs", exist_ok=True)
    body = md_content if isinstance(md_content, str) else ""
    safe_slug = digest_slug.replace("/", "-").replace(" ", "")
    dated_md = f"docs/weekly-digest-{safe_slug}.md"
    dated_html = f"docs/weekly-digest-{safe_slug}.html"
    latest_md = "docs/weekly-digest.md"
    latest_html = "docs/weekly-digest.html"

    for path in (dated_md, latest_md):
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)

    html_content = markdown.markdown(body, extensions=["tables", "fenced_code", "toc"])
    mobile_css = """
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; background: #f8f9fa; color: #24292e; }
      a { color: #0366d6; text-decoration: none; } a:hover { text-decoration: underline; }
      h1, h2, h3 { border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; margin-top: 24px; }
      ul { padding-left: 20px; } li { margin-bottom: 8px; }
      code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.92em; background: #fff; }
      th, td { border: 1px solid #d0d7de; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { background: #f6f8fa; font-weight: 600; }
      tr:nth-child(even) { background: #fafbfc; }
    </style>
    """
    html_full = f"<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>{mobile_css}</head><body>{html_content}</body></html>"
    for path in (dated_html, latest_html):
        with open(path, "w", encoding="utf-8") as f:
            f.write(html_full)

    log(f"📄 已写入 {dated_md}（并同步 {latest_md}）")
    os.system("git config user.name 'github-actions[bot]'")
    os.system("git config user.email 'github-actions[bot]@users.noreply.github.com'")
    os.system("git add docs/")
    os.system("git commit -m '📦 Auto-update weekly digest' || echo 'No changes to commit'")
    os.system("git push")
    return dated_md


def send_notification(md_content: str, *, digest_md_relpath: str = "docs/weekly-digest.md"):
    smtp = os.getenv("SMTP_SERVER")
    user = os.getenv("EMAIL_USER")
    pwd = os.getenv("EMAIL_PASS")
    to = os.getenv("RECIPIENT_EMAIL")
    webhook = os.getenv("WEBHOOK_URL")
    safe_md = md_content if isinstance(md_content, str) else ""

    if all([smtp, user, pwd, to]):
        log("📧 Sending Email...")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📅 Weekly Tech Digest ({datetime.date.today().strftime('%Y-%m-%d')})"
        msg["From"] = user
        msg["To"] = to
        html_body = markdown.markdown(safe_md, extensions=["tables", "fenced_code"])
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        try:
            with smtplib.SMTP(smtp, 587) as server:
                server.starttls()
                server.login(user, pwd)
                server.send_message(msg)
            log("✅ Email sent.")
        except Exception as e:
            log(f"❌ Email failed: {e}")

    if webhook:
        log("🌐 Sending Webhook...")
        preview = safe_md
        repo = os.getenv("GITHUB_REPOSITORY", "")
        fname = digest_md_relpath.split("/")[-1] if digest_md_relpath else "weekly-digest.md"
        raw_url = (
            f"https://raw.githubusercontent.com/{repo}/main/{digest_md_relpath}"
            if repo
            else ""
        )
        link_line = f"👉 完整报告: {raw_url}" if raw_url else f"👉 本地文件: {digest_md_relpath}"
        payload = {
            "content": (
                f"📅 **Weekly Tech Digest Updated**（`{fname}`）\n{preview[:500]}...\n{link_line}"
            )
        }
        try:
            requests.post(webhook, json=payload, timeout=10)
            log("✅ Webhook sent.")
        except Exception as e:
            log(f"❌ Webhook failed: {e}")


def run_sources(ctx: FetchContext) -> str:
    """按注册顺序抓取各信息源，拼接为 AI 原始数据块。"""
    n = len(DEFAULT_SOURCES)
    blocks = []
    for i, src in enumerate(DEFAULT_SOURCES, 1):
        log(f"━━━━━━━━ {i}/{n} 抓取 {src.label} ━━━━━━━━")
        items = src.fetch(ctx)
        body = src.format_for_prompt(items)
        blocks.append(f"【{src.prompt_header}】\n{body}")
    return "\n".join(blocks)


if __name__ == "__main__":
    load_dotenv()
    try:
        cfg = load_digest_config()
        keywords = os.getenv("KEYWORDS", "").strip() or cfg.get("keywords", "AI, LLM")
        win = build_digest_date_window(cfg, DEFAULT_DIGEST_CONFIG)
        log(
            f"⏱️ 数据窗口 [{win.mode}]: {win.start_date} ~ {win.end_date} "
            f"（Arxiv submittedDate: {win.arxiv_submitted_inner}）"
        )

        ctx = FetchContext(
            cfg=cfg,
            default_cfg=DEFAULT_DIGEST_CONFIG,
            global_keywords=keywords,
            date_range=win.arxiv_submitted_inner,
            start_date=win.start_date,
            end_date=win.end_date,
            date_range_mode=win.mode,
        )

        arxiv_kw = source_keywords(cfg.get("arxiv") or {}, keywords)
        gh_week_kw = source_keywords(cfg.get("github_trending") or {}, keywords)
        gh_search_kw = source_keywords(cfg.get("github_repository_search") or {}, keywords)

        raw_sections = run_sources(ctx)

        arxiv_sec = cfg.get("arxiv")
        arxiv_backend = (
            str(arxiv_sec.get("backend", "api")).strip() or "api"
            if isinstance(arxiv_sec, dict)
            else "api"
        )
        keyword_context = (
            f"数据时间窗口（根配置；各信息源块内可另设 date_range 覆盖）："
            f"{ctx.date_range_mode}，{ctx.start_date} ~ {ctx.end_date}；"
            f"关键词式：`|` 或；逗号或 `&` 或 `&a,b` 均为与（AND）；"
            f"全局默认：{keywords}；"
            f"Arxiv 检索使用：{arxiv_kw}（后端：{arxiv_backend}）；"
            f"原始 Arxiv 条目中已含「发表日期」「学科主分类/标签」，输出表须保留为「发表时间」「学科类别」列；"
            f"GitHub 周榜（github_trending）：Trending RSS 榜单原样取数，**不做**关键词/本地筛选；"
            f"github_trending.keywords 若有仅作文风叙述参考：{gh_week_kw or '（未单独配置）'}；"
            f"GitHub 指定日期检索（github_repository_search）：官方 search/repositories，"
            f"在**全站公开仓库**内按关键词检索，默认 q 附带 pushed:日期窗（见该块 date_range，未写则用根窗口）；"
            f"**非**周榜/日榜 RSS，与 Trending 榜单无对应关系；关键词式（块内 / 全局）：{gh_search_kw}；"
            f"若 github_repository_search.enabled 为 false，原始数据中该块为 (无) 属正常；"
            f"RSS：每条可设 keywords、date_range；未设 keywords 时依次用 rss.keywords、全局（标题匹配）。"
        )
        digest_md = summarize_with_ai(
            raw_sections, keyword_context, f"{ctx.start_date} ~ {ctx.end_date}"
        )
        digest_md = _inject_crawl_timestamp(digest_md)
        if _digest_markdown_is_effectively_empty(digest_md):
            log(
                "⚠️ AI 汇总结果为空或仅含爬取时间（请检查 OPENAI_API_KEY、OPENAI_API_BASE、"
                "AI_MODEL 及网关是否返回标准 chat.completions）。已跳过写入 docs/，"
                "避免用空文档覆盖已有周报。"
            )
            sys.exit(1)
        digest_slug = f"{ctx.start_date}_{ctx.end_date}"
        dated_md_path = save_and_commit(digest_md, digest_slug)
        send_notification(digest_md, digest_md_relpath=dated_md_path)
        log("🎉 Weekly digest generation completed!")
    except Exception as e:
        log(f"💥 Fatal error: {e}")
        sys.exit(1)
