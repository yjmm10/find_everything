import os
import sys
import json
import copy
import datetime
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import feedparser
import smtplib
import markdown
from bs4 import BeautifulSoup
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from openai import OpenAI
from urllib.parse import quote
from dotenv import load_dotenv

def log(msg): print(f"[INFO] {msg}", flush=True)

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
        "max_results": 8,
        "sort_by": "submittedDate",
        "sort_order": "descending",
    },
    "github_trending": {
        "enabled": True,
        "url": "https://github.com/trending?since=weekly",
        "max_repos": 8,
        "request_timeout": 60,
        "user_agent": "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)",
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
    """加载订阅配置：默认 DIGEST_CONFIG 指向脚本同目录下的 digest_config.json。"""
    name = os.getenv("DIGEST_CONFIG", "digest_config.json")
    path = Path(name) if Path(name).is_absolute() else _SCRIPT_DIR / name
    cfg = copy.deepcopy(DEFAULT_DIGEST_CONFIG)
    if path.is_file():
        with open(path, encoding="utf-8") as f:
            user = json.load(f)
        if not isinstance(user, dict):
            raise ValueError(f"配置文件必须是 JSON 对象: {path}")
        cfg = _deep_merge(cfg, user)
        log(f"📋 已加载配置: {path}")
    else:
        log(f"📋 未找到 {path}，使用内置默认配置（可创建该文件自定义订阅）")
    return cfg

def _http_session():
    r = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    s = requests.Session()
    s.mount("https://", HTTPAdapter(max_retries=r))
    s.mount("http://", HTTPAdapter(max_retries=r))
    return s

def get_date_range():
    """计算上周五到本周四的日期范围"""
    today = datetime.date.today()
    # 假设脚本在周五运行，则 yesterday 是周四
    thursday = today - datetime.timedelta(days=1)
    friday = thursday - datetime.timedelta(days=6)
    start = friday.strftime("%Y%m%d0000")
    end = thursday.strftime("%Y%m%d2359")
    return friday.strftime("%Y-%m-%d"), thursday.strftime("%Y-%m-%d"), f"{start}TO{end}"

def fetch_arxiv(keywords, date_range, arxiv_cfg: dict):
    if not arxiv_cfg.get("enabled", True):
        log("⏭️ Arxiv 已在配置中关闭，跳过")
        return []
    log("🔍 Fetching Arxiv...")
    query = f"all:({keywords}) AND submittedDate:[{date_range}]"
    sort_by = arxiv_cfg.get("sort_by", "submittedDate")
    sort_order = arxiv_cfg.get("sort_order", "descending")
    max_results = int(arxiv_cfg.get("max_results", 8))
    url = (
        f"https://export.arxiv.org/api/query?search_query={quote(query)}"
        f"&sortBy={quote(sort_by)}&sortOrder={quote(sort_order)}&max_results={max_results}"
    )
    connect_s = float(os.getenv("ARXIV_CONNECT_TIMEOUT", "20"))
    read_s = float(os.getenv("ARXIV_READ_TIMEOUT", "120"))
    resp = _http_session().get(url, timeout=(connect_s, read_s))
    resp.raise_for_status()
    feed = feedparser.parse(resp.content)
    results = []
    for entry in feed.entries:
        results.append({
            "title": entry.title,
            "link": entry.link,
            "authors": ", ".join(a.name for a in entry.authors[:3]),
            "summary": entry.summary.replace("\n", " ")[:150] + "..."
        })
    return results

def fetch_news_rss(keywords, date_range, feeds: list, max_items: int):
    """基于 RSS 源过滤关键词资讯；feeds / max_items 来自配置文件。"""
    log("🔍 Fetching Tech News/RSS...")
    if not feeds:
        log("⏭️ rss_feeds 为空，跳过资讯抓取")
        return []
    kw_list = [k.strip().lower() for k in keywords.split(",") if k.strip()]
    results = []
    for f_url in feeds:
        try:
            feed = feedparser.parse(f_url)
            for entry in feed.entries:
                title_low = entry.title.lower()
                if any(kw in title_low for kw in kw_list):
                    results.append({
                        "title": entry.title,
                        "link": entry.link,
                        "source": feed.feed.get("title", "Unknown"),
                        "published": entry.get("published", "")
                    })
        except Exception:
            pass
    return results[:max_items]

def fetch_github_trending(gh_cfg: dict):
    if not gh_cfg.get("enabled", True):
        log("⏭️ GitHub Trending 已在配置中关闭，跳过")
        return []
    log("🔍 Fetching GitHub Trending (Weekly)...")
    url = gh_cfg.get("url", "https://github.com/trending?since=weekly")
    timeout = float(gh_cfg.get("request_timeout", 60))
    headers = {"User-Agent": gh_cfg.get("user_agent", "Mozilla/5.0 (compatible; GitHubDigestBot/1.0)")}
    max_repos = int(gh_cfg.get("max_repos", 8))
    resp = _http_session().get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    results = []
    for row in soup.select("article.Box-row")[:max_repos]:
        repo = row.select_one("h2 a")["href"].strip("/")
        desc_tag = row.select_one("p.col-9")
        results.append({
            "repo": repo,
            "desc": desc_tag.text.strip() if desc_tag else "No description",
            "link": f"https://github.com/{repo}"
        })
    return results

def summarize_with_ai(arxiv, news, github, keywords, date_str):
    log("🤖 Summarizing with AI...")
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    )
    
    prompt = f"""你是一个资深技术研究员。请根据以下原始数据，整理一份【{date_str}】技术周报。
关键词：{keywords}
要求：
1. 输出纯 Markdown 格式，结构清晰，适合手机端竖屏阅读。
2. 包含三个板块：📄 Arxiv 前沿论文、📰 优质资讯/论坛、🔥 GitHub 热门仓库。
3. 每条包含：标题、核心亮点/一句话总结、链接。语言精炼，总字数 800~1200 字。
4. 忽略重复、低质内容，优先保留 Star 增长快、讨论度高或具有突破性进展的条目。
5. 仅输出 Markdown 内容，不要包含任何解释性前缀。

原始数据：
【Arxiv】\n{arxiv}
【资讯】\n{news}
【GitHub】\n{github}"""

    response = client.chat.completions.create(
        model=os.getenv("AI_MODEL", "gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1500
    )
    return response.choices[0].message.content

def save_and_commit(md_content):
    log("💾 Saving & committing to repo...")
    os.makedirs("docs", exist_ok=True)
    md_path = "docs/weekly-digest.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    
    # 生成移动端友好的 HTML
    html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code', 'toc'])
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
        html_body = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        try:
            with smtplib.SMTP(smtp, 587) as server:
                server.starttls()
                server.login(user, pwd)
                server.send_message(msg)
            log("✅ Email sent.")
        except Exception as e: log(f"❌ Email failed: {e}")

    if webhook:
        log("🌐 Sending Webhook...")
        payload = {"content": f"📅 **Weekly Tech Digest Updated**\n{md_content[:500]}...\n👉 查看完整报告: https://raw.githubusercontent.com/{os.getenv('GITHUB_REPOSITORY')}/main/docs/weekly-digest.md"}
        try:
            requests.post(webhook, json=payload, timeout=10)
            log("✅ Webhook sent.")
        except Exception as e: log(f"❌ Webhook failed: {e}")

if __name__ == "__main__":
    load_dotenv()
    try:
        cfg = load_digest_config()
        keywords = os.getenv("KEYWORDS", "").strip() or cfg.get("keywords", "AI, LLM")
        start, end, date_range = get_date_range()
        log(f"⏱️ Date range: {start} to {end}")

        arxiv = fetch_arxiv(keywords, date_range, cfg["arxiv"])
        news = fetch_news_rss(
            keywords,
            date_range,
            cfg.get("rss_feeds", []),
            int(cfg.get("rss_max_items", 8)),
        )
        github = fetch_github_trending(cfg["github_trending"])

        digest_md = summarize_with_ai(arxiv, news, github, keywords, f"{start} ~ {end}")
        save_and_commit(digest_md)
        send_notification(digest_md)
        log("🎉 Weekly digest generation completed!")
    except Exception as e:
        log(f"💥 Fatal error: {e}")
        sys.exit(1)