#!/usr/bin/env python3
"""Headless Chrome console smoke for QLPK pages.

This check is intentionally separate from smoke_health.py because it needs a
local Chrome binary and a running web server. It focuses on frontend breakage
that static checks cannot see: JavaScript exceptions, console.error calls, and
missing static assets.
"""

from __future__ import annotations

import argparse
import json
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import websocket


DEFAULT_CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
]

DEFAULT_PAGES = [
    "/doctor-examination.html",
    "/psychologist-examination.html",
    "/receptionist-new.html",
    "/appointment-management.html",
    "/payment-waiting.html",
    "/survey-template-management.html",
    "/survey-template-create.html",
    "/medicine-reference-catalog.html",
    "/shortcut-settings.html",
    "/icd-management.html",
    "/service-category.html",
    "/holiday-management.html",
]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def resolve_chrome(explicit: str | None) -> str:
    if explicit:
        return explicit
    for candidate in DEFAULT_CHROME_CANDIDATES:
        if candidate.startswith("/") and Path(candidate).exists():
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    raise RuntimeError("Không tìm thấy Chrome/Chromium để chạy browser smoke")


def http_json(url: str, *, method: str = "GET", timeout: float = 5.0) -> dict:
    request = Request(url, method=method)
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_chrome(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            http_json(f"http://127.0.0.1:{port}/json/version", timeout=1.0)
            return
        except Exception as exc:  # noqa: BLE001 - startup polling
            last_error = exc
            time.sleep(0.15)
    raise RuntimeError(f"Chrome DevTools không sẵn sàng: {last_error}")


def launch_chrome(chrome_path: str, port: int, user_data_dir: str) -> subprocess.Popen:
    args = [
        chrome_path,
        "--headless=new",
        f"--remote-debugging-port={port}",
        "--remote-allow-origins=*",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,1100",
        "about:blank",
    ]
    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


@dataclass
class PageResult:
    path: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class CdpClient:
    def __init__(self, ws_url: str, page_path: str) -> None:
        self.ws = websocket.create_connection(ws_url, timeout=2)
        self.page_path = page_path
        self.next_id = 1
        self.result = PageResult(path=page_path)

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:
            pass

    def send(self, method: str, params: dict | None = None) -> int:
        message_id = self.next_id
        self.next_id += 1
        self.ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        return message_id

    def call(self, method: str, params: dict | None = None, timeout: float = 3.0) -> dict:
        message_id = self.send(method, params)
        deadline = time.time() + timeout
        while time.time() < deadline:
            message = self.recv(timeout=max(0.1, deadline - time.time()))
            if message.get("id") == message_id:
                return message
        raise TimeoutError(f"CDP timeout waiting for {method}")

    def recv(self, timeout: float = 0.5) -> dict:
        self.ws.settimeout(timeout)
        raw = self.ws.recv()
        message = json.loads(raw)
        if "method" in message:
            self.handle_event(message)
        return message

    def handle_event(self, message: dict) -> None:
        method = message.get("method")
        params = message.get("params") or {}
        if method == "Runtime.exceptionThrown":
            details = params.get("exceptionDetails") or {}
            text = details.get("text") or "Runtime exception"
            exception = details.get("exception") or {}
            description = exception.get("description") or exception.get("value") or ""
            self.result.errors.append(f"JS exception: {text} {description}".strip())
        elif method == "Runtime.consoleAPICalled":
            if params.get("type") != "error":
                return
            text = self.format_console_args(params.get("args") or [])
            if should_ignore_console_error(text):
                return
            self.result.errors.append(f"console.error: {text}")
        elif method == "Log.entryAdded":
            entry = params.get("entry") or {}
            if entry.get("level") != "error":
                return
            text = entry.get("text") or ""
            url = entry.get("url") or ""
            if is_relevant_log_error(text, url):
                self.result.errors.append(f"log error: {text} {url}".strip())
        elif method == "Network.responseReceived":
            response = params.get("response") or {}
            status = int(response.get("status") or 0)
            url = response.get("url") or ""
            if status >= 400 and is_static_asset(url):
                self.result.errors.append(f"static asset HTTP {status}: {url}")
        elif method == "Network.loadingFailed":
            url = ((params.get("request") or {}).get("url")) or ""
            if is_static_asset(url):
                self.result.errors.append(f"static asset load failed: {url}")

    @staticmethod
    def format_console_args(args: list[dict]) -> str:
        parts: list[str] = []
        for arg in args:
            value = arg.get("value")
            if value is None:
                value = arg.get("description") or arg.get("className") or arg.get("type")
            parts.append(str(value))
        return " ".join(parts).strip()

    def drain(self, seconds: float) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                self.recv(timeout=min(0.5, max(0.05, deadline - time.time())))
            except TimeoutError:
                continue
            except websocket.WebSocketTimeoutException:
                continue


def is_static_asset(url: str) -> bool:
    return "/static/" in url or url.endswith("/favicon.ico")


def should_ignore_console_error(text: str) -> bool:
    lowered = text.lower()
    expected_no_session = [
        "401",
        "403",
        "unauthorized",
        "forbidden",
        "failed to load resource",
        "api error",
        "token",
    ]
    if any(fragment in lowered for fragment in expected_no_session):
        return True
    return lowered.startswith("error loading ") or lowered.startswith("lỗi khi tải ") or lowered.startswith("không thể tải ")


def is_relevant_log_error(text: str, url: str) -> bool:
    if is_static_asset(url):
        return True
    lowered = text.lower()
    if "failed to load resource" in lowered and ("401" in lowered or "403" in lowered):
        return False
    return "uncaught" in lowered or "syntaxerror" in lowered or "referenceerror" in lowered


def smoke_page(port: int, base_url: str, path: str, wait_seconds: float, auth_token: str | None = None) -> PageResult:
    target = http_json(f"http://127.0.0.1:{port}/json/new?{quote('about:blank')}", method="PUT")
    client = CdpClient(target["webSocketDebuggerUrl"], path)
    try:
        for method in ["Runtime.enable", "Log.enable", "Network.enable", "Page.enable"]:
            client.call(method)
        token_value = auth_token or "browser-smoke-token"
        token_literal = json.dumps(token_value)
        client.call(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": f"""
                    const qlpkSmokeToken = {token_literal};
                    localStorage.setItem('qlpk_token', qlpkSmokeToken);
                    localStorage.setItem('token', qlpkSmokeToken);
                    localStorage.setItem('qlpk_user', JSON.stringify({{role:'admin', full_name:'Browser Smoke', username:'smoke'}}));
                    localStorage.setItem('qlpk_permissions', JSON.stringify(['dashboard','lichhen','qlkham-letan','qlkham-bs','qlkham-tamly','qlkham-cls','hoadon','chi-tieu','thongke-thuoc','ql-tailieu','ql-kho-thuoc','ql-thuoc','ql-hoat-chat','ql-di-nguyen','ql-tuong-tac-thuoc','ql-taikhoan','ql-phanquyen','ql-nhomquyen','ql-tu-viettat','ql-danhmuc-dichvu','ql-dichvu','ql-goi-dichvu','ql-mau-khaosat','ql-danhmuc-icd','ql-ngayle','ca-nhan','ca-nhan-phimtat']));
                """
            },
        )
        client.call("Page.navigate", {"url": base_url.rstrip("/") + path})
        client.drain(wait_seconds)
        return client.result
    finally:
        client.close()
        try:
            http_json(f"http://127.0.0.1:{port}/json/close/{target['id']}", timeout=1.0)
        except Exception:
            pass


def verify_server(base_url: str) -> None:
    try:
        with urlopen(base_url.rstrip("/") + "/health", timeout=3) as response:
            if response.getcode() >= 500:
                raise RuntimeError(f"/health returned {response.getcode()}")
    except URLError as exc:
        raise RuntimeError(f"Không kết nối được server local {base_url}: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Run headless Chrome console smoke for QLPK pages")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--chrome", default=None, help="Chrome/Chromium executable path")
    parser.add_argument("--wait", type=float, default=5.0, help="seconds to observe each page after navigation")
    parser.add_argument("--token-file", default=None, help="read JWT token from this file and inject it into localStorage")
    parser.add_argument("pages", nargs="*", default=DEFAULT_PAGES)
    args = parser.parse_args()

    verify_server(args.base_url)
    chrome_path = resolve_chrome(args.chrome)
    port = free_port()
    auth_token = Path(args.token_file).read_text(encoding="utf-8").strip() if args.token_file else None

    with tempfile.TemporaryDirectory(prefix="qlpk-chrome-smoke-") as user_data_dir:
        process = launch_chrome(chrome_path, port, user_data_dir)
        try:
            wait_for_chrome(port)
            failed = False
            for page in args.pages:
                result = smoke_page(port, args.base_url, page, args.wait, auth_token=auth_token)
                if result.errors:
                    failed = True
                    print(f"[FAIL] {page}: {len(result.errors)}")
                    for error in result.errors[:20]:
                        print(f"  - {error}")
                else:
                    print(f"[OK] {page}")
            return 1 if failed else 0
        finally:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    sys.exit(main())
