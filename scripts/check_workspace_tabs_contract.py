#!/usr/bin/env python3
"""Guard the shared workspace-tab identity, permission, and close contracts."""

from __future__ import annotations

import subprocess
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from module_source import read_source  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / "app/static/js/app-shell/workspace-tabs.js"
REALTIME = ROOT / "app/static/js/realtime-client.js"
LOGIN = ROOT / "app/static/js/login.js"
HEADER = ROOT / "app/static/js/app-header-loader.js"


def read(path: Path) -> str:
    return read_source(path)


def require(source: str, needle: str, message: str, failures: list[str]) -> None:
    if needle not in source:
        failures.append(message)


def main() -> int:
    failures: list[str] = []
    required_files = (WORKSPACE, REALTIME, LOGIN, HEADER)
    for path in required_files:
        if not path.exists():
            failures.append(f"Thiếu file bắt buộc: {path.relative_to(ROOT)}")

    if failures:
        print("Workspace tabs contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    workspace = read(WORKSPACE)
    realtime = read(REALTIME)
    login = read(LOGIN)
    header = read(HEADER)

    require(workspace, "WORKSPACE_STORAGE_VERSION = 2;", "Storage workspace chưa có versioned owner contract", failures)
    require(workspace, "function workspaceOwnerId()", "Storage workspace chưa tách owner theo tài khoản", failures)
    require(workspace, "owners[ownerId] = value;", "Storage workspace chưa ghi state theo owner", failures)
    require(workspace, "configuredNavItem(tab.href)", "Stored tabs chưa được đối chiếu navigation config", failures)
    require(workspace, "return !configuredItem || hasPermission(configuredItem);", "Stored tabs chưa lọc theo quyền hiện tại", failures)
    require(workspace, "window.location.assign(normalizeHref(next.href));", "Đóng tab native chưa chuyển top-level URL sang tab kế tiếp", failures)
    require(workspace, "reason: 'navigate-after-close-native-workspace-tab'", "Đóng tab native chưa giữ leave guard của tab đang active", failures)
    require(workspace, "getTabs: readTabs", "Realtime chưa có API đọc danh sách tab đã lọc từ shell owner", failures)

    if "localStorage.getItem('qlpk_workspace_tabs')" in realtime:
        failures.append("Realtime không được đọc raw workspace storage ngoài shell owner")
    require(realtime, "window.QLPKWorkspaceShell.getTabs()", "Realtime chưa dùng danh sách tab đã lọc của workspace shell", failures)

    for route in ("/doctor-examination.html", "/psychologist-examination.html", "/receptionist-new.html"):
        require(login, route, f"Login thiếu landing route theo vai trò: {route}", failures)
    require(login, "localStorage.setItem('qlpk_user', JSON.stringify(res.user || {}));", "Login chưa chốt owner trước request /check/me", failures)

    for key in ("qlpk_workspace_tabs", "qlpk_workspace_active_tab"):
        require(header, f"localStorage.removeItem('{key}')", f"Header logout chưa xóa {key}", failures)

    for path in (WORKSPACE, REALTIME, LOGIN):
        result = subprocess.run(
            ["node", "--check", str(path)],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        if result.returncode:
            failures.append(f"Node syntax failed: {path.relative_to(ROOT)}\n{result.stdout.strip()}")

    runtime_result = subprocess.run(
        ["node", "scripts/check_workspace_tabs_runtime.js"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if runtime_result.returncode:
        failures.append(f"Workspace runtime failed:\n{runtime_result.stdout.strip()}")

    if failures:
        print("Workspace tabs contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    print("Workspace tabs contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
