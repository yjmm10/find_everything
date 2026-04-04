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
from digest_sources.util import log

_SCRIPT_DIR = Path(__file__).resolve().parent

DEFAULT_DIGEST_CONFIG = {
    "keywords": "AI, LLM",
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
        "keywords": None,
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
        "url": "https://github.com/trending?since=weekly",
        "max_repos": 8,
        "request_timeout": 60,
        "user_agent": "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)",
        "api_enrich": True,
        "api_timeout": 20,
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


def get_date_range():
    """计算上周五到本周四的日期范围"""
    today = datetime.date.today()
    thursday = today - datetime.timedelta(days=1)
    friday = thursday - datetime.timedelta(days=6)
    start = friday.strftime("%Y%m%d0000")
    end = thursday.strftime("%Y%m%d2359")
    return friday.strftime("%Y-%m-%d"), thursday.strftime("%Y-%m-%d"), f"{start}TO{end}"


def summarize_with_ai(raw_sections: str, keyword_context: str, date_str: str):
    model = os.getenv("AI_MODEL", "gpt-4o-mini")
    log(f"🤖 [AI] 调用模型 {model} 生成周报（可能需数十秒）…")
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1"),
    )

    prompt = f"""你是一个资深技术研究员。请根据以下原始数据，整理一份【{date_str}】技术周报。
关键词与抓取说明：{keyword_context}
要求：
1. 输出纯 Markdown 格式，结构清晰，适合手机端竖屏阅读。
2. 包含三个板块：📄 Arxiv 前沿论文、📰 优质资讯/论坛、🔥 GitHub 热门仓库。
3. 每条包含：标题、核心亮点/一句话总结、链接。语言精炼，总字数 800~1200 字。
4. 忽略重复、低质内容，优先保留 Star 增长快、讨论度高或具有突破性进展的条目。
5. 「GitHub 热门仓库」板块：每条必须写出原始数据中提供的 Star 数、Fork 数（若有）；若有主语言也可一并写出。
6. 仅输出 Markdown 内容，不要包含任何解释性前缀。

原始数据：
{raw_sections}"""

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1500,
    )
    log("✅ [AI] 生成完成")
    return response.choices[0].message.content


def save_and_commit(md_content):
    log("💾 Saving & committing to repo...")
    os.makedirs("docs", exist_ok=True)
    md_path = "docs/weekly-digest.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    html_content = markdown.markdown(md_content, extensions=["tables", "fenced_code", "toc"])
    mobile_css = """
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; background: #f8f9fa; color: #24292e; }
      a { color: #0366d6; text-decoration: none; } a:hover { text-decoration: underline; }
      h1, h2, h3 { border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; margin-top: 24px; }
      ul { padding-left: 20px; } li { margin-bottom: 8px; }
      code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
    </style>
    """
    html_full = f"<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>{mobile_css}</head><body>{html_content}</body></html>"
    with open("docs/weekly-digest.html", "w", encoding="utf-8") as f:
        f.write(html_full)

    os.system("git config user.name 'github-actions[bot]'")
    os.system("git config user.email 'github-actions[bot]@users.noreply.github.com'")
    os.system("git add docs/")
    os.system("git commit -m '📦 Auto-update weekly digest' || echo 'No changes to commit'")
    os.system("git push")


def send_notification(md_content):
    smtp = os.getenv("SMTP_SERVER")
    user = os.getenv("EMAIL_USER")
    pwd = os.getenv("EMAIL_PASS")
    to = os.getenv("RECIPIENT_EMAIL")
    webhook = os.getenv("WEBHOOK_URL")

    if all([smtp, user, pwd, to]):
        log("📧 Sending Email...")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📅 Weekly Tech Digest ({datetime.date.today().strftime('%Y-%m-%d')})"
        msg["From"] = user
        msg["To"] = to
        html_body = markdown.markdown(md_content, extensions=["tables", "fenced_code"])
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
        payload = {
            "content": (
                f"📅 **Weekly Tech Digest Updated**\n{md_content[:500]}...\n"
                f"👉 查看完整报告: https://raw.githubusercontent.com/{os.getenv('GITHUB_REPOSITORY')}/main/docs/weekly-digest.md"
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
        start, end, date_range = get_date_range()
        log(f"⏱️ Date range: {start} to {end}")

        ctx = FetchContext(
            cfg=cfg,
            default_cfg=DEFAULT_DIGEST_CONFIG,
            global_keywords=keywords,
            date_range=date_range,
            start_date=start,
            end_date=end,
        )

        arxiv_kw = source_keywords(cfg["arxiv"], keywords)
        gh_kw = source_keywords(cfg["github_trending"], keywords)

        raw_sections = run_sources(ctx)

        arxiv_sec = cfg.get("arxiv")
        arxiv_backend = (
            str(arxiv_sec.get("backend", "api")).strip() or "api"
            if isinstance(arxiv_sec, dict)
            else "api"
        )
        keyword_context = (
            f"全局默认：{keywords}；"
            f"Arxiv 检索使用：{arxiv_kw}（后端：{arxiv_backend}）；"
            f"GitHub Trending 数据为榜单抓取（不按词筛选）；该板块在叙述时可侧重：{gh_kw}；"
            f"GitHub 条目已附 Star/Fork（来自 GitHub API）；"
            f"RSS 每条订阅可单独设 keywords，未设时依次使用 rss.keywords、全局 keywords（标题匹配）。"
        )
        digest_md = summarize_with_ai(raw_sections, keyword_context, f"{start} ~ {end}")
        save_and_commit(digest_md)
        send_notification(digest_md)
        log("🎉 Weekly digest generation completed!")
    except Exception as e:
        log(f"💥 Fatal error: {e}")
        sys.exit(1)
