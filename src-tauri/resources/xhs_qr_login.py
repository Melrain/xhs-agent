#!/usr/bin/env python3
"""Headed Camoufox QR login for the local Tauri executor.

The Xiaohongshu homepage is enough to export cookies. Do not wait only for
qrcode/status=confirmed — captcha often skips that event.
"""

from __future__ import annotations

import argparse
import json
import signal
import time
from typing import Any
from urllib.parse import urlparse

PROFILE_POLL_ATTEMPTS = 20
PROFILE_POLL_WAIT_S = 1.2
PLACEHOLDER_NICKNAMES = frozenset({"", "Unknown"})
USER_ME_ENDPOINT = "/api/sns/web/v2/user/me"
LOGGED_IN_PATHS = (
    "/explore",
    "/notification",
    "/user/profile",
    "/user/me",
    "/search_result",
)


def emit(payload: dict[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def is_real_profile(user: dict[str, Any] | None) -> bool:
    if not user:
        return False
    nickname = str(user.get("nickname") or "").strip()
    if user.get("guest") or nickname in PLACEHOLDER_NICKNAMES:
        return False
    return bool(str(user.get("id") or "").strip())


def is_logged_in_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""
    if "xiaohongshu.com" not in host:
        return False
    if path.startswith("/login") or "/login/" in path:
        return False
    return any(path == item or path.startswith(f"{item}/") or path.startswith(item) for item in LOGGED_IN_PATHS)


def export_xhs_cookies(raw_cookies: list[dict[str, Any]]) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for entry in raw_cookies:
        name = entry.get("name")
        value = entry.get("value")
        domain = entry.get("domain", "")
        if not isinstance(name, str) or not isinstance(value, str) or not name:
            continue
        if not isinstance(domain, str) or "xiaohongshu.com" not in domain:
            continue
        cookies[name] = value
    return cookies


def profile_from_me_payload(
    normalize_xhs_user_payload: Any,
    payload: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not payload:
        return None
    try:
        return normalize_xhs_user_payload(payload)
    except Exception:
        return None


def finish_from_browser(
    *,
    page: Any,
    normalize_xhs_user_payload: Any,
    save_cookies: Any,
    XhsClient: Any,
    browser_user: dict[str, Any] | None,
) -> int:
    try:
        page.wait_for_timeout(800)
    except Exception:
        pass

    cookies = export_xhs_cookies(page.context.cookies())
    required = ("a1", "webId", "web_session")
    missing = [name for name in required if not cookies.get(name)]
    if missing:
        emit(
            {
                "event": "error",
                "message": "已经进入主页，但 cookie 不完整，请再扫一次",
            }
        )
        return 1

    user = browser_user if is_real_profile(browser_user) else None
    with XhsClient(cookies, request_delay=0) as client:
        for _ in range(PROFILE_POLL_ATTEMPTS):
            try:
                user = normalize_xhs_user_payload(client.get_self_info())
            except Exception:
                pass
            if is_real_profile(user):
                break
            time.sleep(PROFILE_POLL_WAIT_S)

    if not is_real_profile(user) and is_real_profile(browser_user):
        user = browser_user

    if not is_real_profile(user) and not is_logged_in_url(getattr(page, "url", "") or ""):
        emit(
            {
                "event": "error",
                "message": "主页已打开，但账号仍是游客，未写入 SESSION，请再扫一次",
            }
        )
        return 1

    persist_cookies(save_cookies, cookies)
    emit({"event": "confirmed"})
    return 0


def persist_cookies(save_cookies_fn: Any, cookies: dict[str, str]) -> None:
    """xiaohongshu-cli 的 save_cookies 会 chmod(0o600)，Windows 上偶发失败。"""
    try:
        save_cookies_fn(cookies)
        return
    except Exception as first:
        try:
            from xhs_cli.cookies import get_cookie_path

            path = get_cookie_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps({**cookies, "saved_at": time.time()}, indent=2),
                encoding="utf-8",
            )
        except Exception as second:
            raise RuntimeError(f"写入 SESSION 失败：{second}") from first


def main() -> int:
    parser = argparse.ArgumentParser(description="Headed Camoufox QR login as NDJSON")
    parser.add_argument("--timeout-s", type=int, default=240)
    args = parser.parse_args()

    try:
        from camoufox.sync_api import Camoufox
        from xhs_cli.client import XhsClient
        from xhs_cli.command_normalizers import normalize_xhs_user_payload
        from xhs_cli.cookies import save_cookies
        from xhs_cli.qr_login import (
            LOGIN_URL,
            QR_CREATE_ENDPOINT,
            QR_STATUS_ENDPOINT,
            QR_USERINFO_ENDPOINT,
            QR_SCANNED,
            QR_CONFIRMED,
            _ensure_camoufox_ready,
            _unwrap_browser_response_payload,
        )
    except ImportError as exc:
        emit({"event": "error", "message": f"未找到扫码依赖：{exc}"})
        return 1

    finishing = {"on": False}

    def on_signal(*_args: object) -> None:
        if finishing["on"]:
            return
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    try:
        _ensure_camoufox_ready()
    except Exception as exc:  # noqa: BLE001
        emit({"event": "error", "message": str(exc) or "Camoufox 不可用"})
        return 1

    state: dict[str, Any] = {
        "last_status": -1,
        "confirmed": False,
        "browser_user": None,
        "hinted_captcha": False,
    }

    emit({"event": "ready"})

    try:
        with Camoufox(headless=False) as browser:
            page = browser.new_page()

            def handle_response(response: Any) -> None:
                url = str(getattr(response, "url", "") or "")
                method = str(getattr(response.request, "method", "") or "")
                status = int(getattr(response, "status", 0) or 0)

                if USER_ME_ENDPOINT in url and method == "GET" and status < 400:
                    try:
                        payload = _unwrap_browser_response_payload(response.json())
                    except Exception:
                        return
                    user = profile_from_me_payload(normalize_xhs_user_payload, payload)
                    if is_real_profile(user):
                        state["browser_user"] = user
                        finishing["on"] = True
                        state["confirmed"] = True
                        emit({"event": "confirming"})
                    return

                if QR_STATUS_ENDPOINT in url and method == "GET":
                    if status in (461, 471) and not state["hinted_captcha"]:
                        state["hinted_captcha"] = True
                        emit(
                            {
                                "event": "hint",
                                "message": "扫码触发了验证码，请在桌面浏览器窗口里完成",
                            }
                        )
                        return
                    if status >= 400:
                        return
                    try:
                        payload = _unwrap_browser_response_payload(response.json())
                    except Exception:
                        return
                    code_status = int(payload.get("codeStatus", -1))
                    if code_status == state["last_status"]:
                        return
                    state["last_status"] = code_status
                    if code_status == QR_SCANNED:
                        emit({"event": "scanned"})
                    elif code_status == QR_CONFIRMED:
                        finishing["on"] = True
                        state["confirmed"] = True
                        emit({"event": "confirming"})
                    return

                if QR_USERINFO_ENDPOINT not in url:
                    return
                try:
                    payload = _unwrap_browser_response_payload(response.json())
                except Exception:
                    return
                code_status = int(payload.get("codeStatus", -1))
                if code_status == QR_SCANNED and state["last_status"] < QR_SCANNED:
                    state["last_status"] = QR_SCANNED
                    emit({"event": "scanned"})

            page.on("response", handle_response)

            qr_url = ""
            try:
                with page.expect_response(
                    lambda response: QR_CREATE_ENDPOINT in response.url
                    and response.request.method == "POST",
                    timeout=20_000,
                ) as qr_info:
                    page.goto(LOGIN_URL, wait_until="domcontentloaded")
                created = _unwrap_browser_response_payload(qr_info.value.json())
                qr_url = str(created.get("url") or "").strip()
            except Exception:
                if is_logged_in_url(page.url) or is_real_profile(state["browser_user"]):
                    emit(
                        {
                            "event": "hint",
                            "message": "浏览器已进入主页，正在导出 SESSION",
                        }
                    )
                    finishing["on"] = True
                    state["confirmed"] = True
                else:
                    emit({"event": "error", "message": "无法打开小红书登录页"})
                    return 1

            if qr_url:
                emit({"event": "qr", "url": qr_url})

            deadline = time.time() + args.timeout_s
            while time.time() < deadline and not state["confirmed"]:
                if is_logged_in_url(page.url):
                    finishing["on"] = True
                    state["confirmed"] = True
                    emit({"event": "confirming"})
                    emit(
                        {
                            "event": "hint",
                            "message": "已进入小红书主页，正在导出 SESSION",
                        }
                    )
                    break
                page.wait_for_timeout(400)

            if not state["confirmed"] and not is_logged_in_url(page.url):
                emit({"event": "error", "message": "桌面扫码已超时，请重新登录"})
                return 1

            return finish_from_browser(
                page=page,
                normalize_xhs_user_payload=normalize_xhs_user_payload,
                save_cookies=save_cookies,
                XhsClient=XhsClient,
                browser_user=state["browser_user"],
            )
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        emit({"event": "error", "message": str(exc) or "桌面扫码失败"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
