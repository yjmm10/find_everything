import os
import sys

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from tqdm import tqdm


def log(msg: str) -> None:
    print(f"[INFO] {msg}", flush=True)


def progress(it, **kwargs):
    """tqdm 输出到 stderr，避免与 [INFO] 日志交错；CI 可设 TQDM_DISABLE=1 关闭。"""
    kwargs.setdefault("file", sys.stderr)
    kwargs.setdefault("dynamic_ncols", True)
    return tqdm(it, **kwargs)


def url_hint(url: str, max_len: int = 64) -> str:
    u = url.strip()
    return u if len(u) <= max_len else u[: max_len - 3] + "..."


def http_session() -> requests.Session:
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
