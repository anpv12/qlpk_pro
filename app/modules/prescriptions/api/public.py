"""Public prescription verification routes."""

import io
import logging

import qrcode
from flask import Blueprint, jsonify, render_template, request, send_file, url_for

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.prescriptions.view_models.public_prescription import (
    AppointmentNotFound,
    PrescriptionNotFound,
    build_public_prescription_view_model,
)
from app.utils.api_error_contract import api_error_boundary


public_prescription_bp = Blueprint("public_prescription", __name__)
logger = logging.getLogger(__name__)


@public_prescription_bp.route("/verify/rx/<prescription_code>")
def verify_prescription_page(prescription_code):
    """Public page - Xác thực đơn thuốc bằng QR code."""
    return render_template("verify-prescription.html", prescription_code=prescription_code)


@public_prescription_bp.route(
    "/api/public/prescription/<prescription_code>/verification-qr.png",
    methods=["GET"],
)
@api_error_boundary(success=False, message='Không thể tạo mã QR xác thực đơn thuốc')
def get_prescription_verification_qr(prescription_code):
    """Generate the prescription verification QR as a same-origin PNG."""
    db = SessionLocal()
    try:
        # Do not create a verification QR for an unknown or orphan prescription.
        build_public_prescription_view_model(db, prescription_code)

        base_url = (settings.BASE_URL or request.host_url).rstrip("/")
        verification_path = url_for(
            "public_prescription.verify_prescription_page",
            prescription_code=prescription_code,
        )
        verification_url = f"{base_url}{verification_path}"

        qr = qrcode.QRCode(box_size=8, border=4)
        qr.add_data(verification_url)
        qr.make(fit=True)

        image = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype="image/png",
            download_name="prescription-verification-qr.png",
            max_age=3600,
        )
    except PrescriptionNotFound as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    except AppointmentNotFound as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    finally:
        db.close()


@public_prescription_bp.route("/api/public/prescription/<prescription_code>", methods=["GET"])
@api_error_boundary(success=False, message='{error}')
def get_public_prescription(prescription_code):
    """Public API - Lấy thông tin đơn thuốc để xác thực."""
    db = SessionLocal()
    try:
        data = build_public_prescription_view_model(db, prescription_code)
        return jsonify({"success": True, "data": data})
    except PrescriptionNotFound as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    except AppointmentNotFound as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    finally:
        db.close()
