"""Download the Camoufox browser via GitHub mirrors, with line-based progress."""

from __future__ import annotations

import sys
from io import BytesIO
from typing import Any, Optional

MIRRORS = (
    "https://ghfast.top/",
    "https://gh-proxy.com/",
    "https://mirror.ghproxy.com/",
)


def log(message: str) -> None:
    print(message, flush=True)


def needs_mirror(url: str) -> bool:
    return "github.com" in url or "githubusercontent.com" in url


def is_release_download(url: str) -> bool:
    return (
        "/releases/download/" in url
        or "objects.githubusercontent.com" in url
        or "release-assets.githubusercontent.com" in url
    )


def rewrite(url: str, prefix: str) -> str:
    if url.startswith(prefix):
        return url
    return prefix.rstrip("/") + "/" + url


def candidates(url: str) -> list[str]:
    mirrored = [rewrite(url, prefix) for prefix in MIRRORS]
    if is_release_download(url):
        return mirrored + [url]
    return [url] + mirrored


def looks_like_html(response: Any) -> bool:
    ctype = str(response.headers.get("content-type") or "").lower()
    return "text/html" in ctype


def patch_requests() -> None:
    import requests

    original = requests.Session.request

    def request(self, method, url, **kwargs):  # type: ignore[no-untyped-def]
        kwargs.setdefault("timeout", (15, 60))
        if not isinstance(url, str) or not needs_mirror(url):
            return original(self, method, url, **kwargs)

        last_error: Exception | None = None
        for item in candidates(url):
            try:
                if item != url:
                    log(f"换加速源下载：{item}")
                else:
                    log(f"直连 GitHub：{url}")
                response = original(self, method, item, **kwargs)
                if response.status_code >= 400:
                    last_error = RuntimeError(f"HTTP {response.status_code}")
                    log(f"这个源不行（HTTP {response.status_code}），换下一个")
                    continue
                if looks_like_html(response) and is_release_download(url):
                    last_error = RuntimeError("源返回了网页")
                    log("这个源返回了网页而不是安装包，换下一个")
                    continue
                return response
            except Exception as error:  # noqa: BLE001
                last_error = error
                log(f"这个源不可用：{error}，换下一个")
        raise last_error or RuntimeError("所有 GitHub 源都失败了")

    requests.Session.request = request  # type: ignore[method-assign]


def patch_progress() -> None:
    import camoufox.addons as addons
    import camoufox.geolocation as geolocation
    import camoufox.pkgman as pkgman
    import requests

    def webdl(
        url: str,
        desc: Optional[str] = None,
        buffer: Optional[BytesIO] = None,
        bar: bool = True,
        progress_callback=None,
    ) -> BytesIO:
        del bar, progress_callback
        if buffer is None:
            buffer = BytesIO()
        log(desc or "开始下载浏览器安装包…")
        response = requests.get(url, stream=True, timeout=(15, 60))
        response.raise_for_status()
        total = int(response.headers.get("content-length") or 0)
        done = 0
        last = 0
        for chunk in response.iter_content(256 * 1024):
            if not chunk:
                continue
            buffer.write(chunk)
            done += len(chunk)
            if done - last >= 1024 * 1024 or (total and done >= total):
                if total:
                    percent = min(100, done * 100 // total)
                    log(
                        f"下载中 {done / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MB（{percent}%）"
                    )
                else:
                    log(f"下载中 {done / 1024 / 1024:.1f} MB")
                last = done
        log("下载完成，正在解压…")
        buffer.seek(0)
        return buffer

    pkgman.webdl = webdl
    addons.webdl = webdl
    geolocation.webdl = webdl


def browser_ready() -> bool:
    from camoufox.multiversion import get_active_path
    from camoufox.pkgman import launch_path

    path = get_active_path()
    if path is None:
        return False
    try:
        return bool(launch_path(path))
    except Exception:
        return False


def main() -> int:
    if browser_ready():
        log("Camoufox 浏览器已经装好")
        return 0

    patch_requests()
    patch_progress()

    from camoufox.__main__ import cli

    try:
        cli.main(args=["fetch"], standalone_mode=False)
    except SystemExit as error:
        code = error.code
        if code not in (None, 0):
            return int(code) if isinstance(code, int) else 1
    except Exception as error:  # noqa: BLE001
        log(f"安装失败：{error}")
        return 1

    if not browser_ready():
        log("下载结束，但仍找不到 Camoufox 浏览器")
        return 2
    log("Camoufox 浏览器已就绪")
    return 0


if __name__ == "__main__":
    sys.exit(main())
