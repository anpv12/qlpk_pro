#!/usr/bin/env python3
"""Guard the canonical A4 prescription print layout contract."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRINT_CSS = ROOT / "app/static/css/prescriptions/components/prescription-print-document.css"
PRINT_COMPONENT = ROOT / "app/static/js/prescriptions/components/prescription-print-document.js"
SHARED_TEMPLATE = ROOT / "app/static/js/prescriptions/shared/prescription-document-template.js"
PUBLIC_API = ROOT / "app/modules/prescriptions/api/public.py"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def selector_block(source: str, selector: str) -> str:
    match = re.search(rf"{re.escape(selector)}\s*\{{(?P<body>[^}}]*)\}}", source, re.S)
    return match.group("body") if match else ""


def require(pattern: str, source: str, message: str, failures: list[str]) -> None:
    if not re.search(pattern, source, re.S):
        failures.append(message)


def main() -> int:
    failures: list[str] = []

    for path in (PRINT_CSS, PRINT_COMPONENT, SHARED_TEMPLATE, PUBLIC_API):
        if not path.exists():
            failures.append(f"Thiếu file bắt buộc: {path.relative_to(ROOT)}")

    if failures:
        print("Prescription print contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    css = read(PRINT_CSS)
    component = read(PRINT_COMPONENT)
    shared_template = read(SHARED_TEMPLATE)
    public_api = read(PUBLIC_API)

    require(r"@page\s*\{[^}]*size:\s*A4\s*;[^}]*margin:\s*8mm\s*;", css,
            "Tài liệu in phải giữ khổ A4 và lề trang 8mm", failures)
    require(
        r"\.prescription-print-document__page\s*\+\s*\.prescription-print-document__page\s*\{"
        r"[^}]*break-before:\s*page\s*;[^}]*page-break-before:\s*always\s*;",
        css,
        "Mỗi mẫu BASIC/H/N sau mẫu đầu phải bắt đầu ở trang mới",
        failures,
    )

    preview = selector_block(css, ".prescription-print-document .prescription-preview--rx")
    signature = selector_block(css, ".prescription-print-document .rx-signature-table")
    under18 = selector_block(css, ".prescription-print-document .prescription-under18-info")

    if not preview:
        failures.append("Thiếu owner layout .prescription-preview--rx của bản in")
    else:
        require(r"display:\s*block\s*;", preview,
                "Nội dung in phải dùng normal flow để Chrome phân trang ổn định", failures)
        require(r"min-height:\s*(?:0|auto)\s*;", preview,
                "Bản in phải chạy theo chiều cao nội dung, không ép gần trọn A4", failures)
        if re.search(r"min-height:\s*\d+(?:\.\d+)?mm", preview):
            failures.append("Không được ép chiều cao vật lý theo mm trên nội dung đơn thuốc")

    if not signature:
        failures.append("Thiếu bảng QR/chữ ký của bản in")
    else:
        require(r"margin-top:\s*0\.5rem\s*;", signature,
                "QR/chữ ký phải theo sát nội dung bằng khoảng cách cố định", failures)
        if re.search(r"margin-top:\s*auto", signature):
            failures.append("QR/chữ ký không được dùng margin-top:auto để dồn khoảng trắng")

    if not under18:
        failures.append("Thiếu footer H/N cho bệnh nhân dưới 18 tuổi")
    else:
        require(r"position:\s*static\s*;", under18,
                "Footer dưới 18 tuổi phải nằm trong luồng tài liệu", failures)
        require(r"break-inside:\s*avoid\s*;", under18,
                "Footer dưới 18 tuổi phải được chống tách trang", failures)
        if re.search(r"position:\s*absolute", under18):
            failures.append("Footer dưới 18 tuổi không được ghim tuyệt đối lên nội dung")

    if "/static/css/prescriptions/components/prescription-print-document.css" not in component:
        failures.append("Print component chưa tải canonical A4 stylesheet")

    require(r"createObjectURL\(", component,
            "Popup in phải điều hướng qua Blob URL thay vì ghi lại about:blank", failures)
    require(r"printWindow\.location\.replace\(", component,
            "Popup in phải thay tài liệu bằng navigation ổn định", failures)
    if re.search(r"printWindow\.document\.(?:open|write|close)\s*\(", component):
        failures.append("Popup in không được ghi lại about:blank bằng document.open/write/close")

    if "api.qrserver.com" in shared_template:
        failures.append("QR xác thực không được phụ thuộc dịch vụ QR bên thứ ba")
    require(
        r"/api/public/prescription/\$\{encodeURIComponent\(prescriptionCode\)\}/verification-qr\.png",
        shared_template,
        "Mẫu đơn phải tải QR xác thực từ endpoint cùng domain",
        failures,
    )
    require(
        r'data-required-print-asset="verification-qr"',
        shared_template,
        "QR xác thực phải được đánh dấu là tài nguyên bắt buộc trước khi in",
        failures,
    )
    require(
        r'route\(\s*"/api/public/prescription/<prescription_code>/verification-qr\.png"',
        public_api,
        "Backend phải sở hữu endpoint PNG cho QR xác thực đơn thuốc",
        failures,
    )
    require(r"qrcode\.QRCode\(", public_api,
            "Endpoint QR phải sinh mã bằng thư viện nội bộ", failures)
    require(r"send_file\([^)]*mimetype=\"image/png\"", public_api,
            "Endpoint QR phải trả đúng nội dung image/png", failures)
    require(r"image\.naturalWidth\s*<=\s*0", component,
            "Lifecycle in phải phát hiện QR tải lỗi", failures)
    require(r"dataset\.printReady\s*=\s*'error'", component,
            "Cửa sổ in phải công bố trạng thái lỗi tài nguyên", failures)
    require(r"Promise\.all\(\[fontsReady, waitForImages\(\)\]\)\.then", component,
            "Chỉ được gọi in sau khi font và ảnh bắt buộc tải thành công", failures)
    if re.search(r"Promise\.all\(\[fontsReady, waitForImages\(\)\]\)\.finally", component):
        failures.append("Không được gọi in trong finally khi QR có thể đã tải lỗi")

    if failures:
        print("Prescription print contract failed:")
        print("\n".join(f"- {failure}" for failure in failures))
        return 1

    print("Prescription print contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
