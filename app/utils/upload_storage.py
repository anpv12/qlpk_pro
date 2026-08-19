import os
from pathlib import Path
from urllib.parse import quote

from flask import current_app


UPLOAD_ROOT_NAME = "uploads"


def project_root() -> Path:
    return Path(current_app.root_path)


def upload_root() -> Path:
    configured_root = os.environ.get('QLPK_UPLOAD_ROOT')
    if configured_root:
        root = Path(configured_root)
        return root if root.is_absolute() else project_root() / root
    return project_root() / UPLOAD_ROOT_NAME


def upload_dir(*parts: str) -> Path:
    target = upload_root().joinpath(*parts)
    target.mkdir(parents=True, exist_ok=True)
    return target


def upload_path(*parts: str) -> Path:
    return upload_root().joinpath(*parts)


def upload_url(*parts: str) -> str:
    encoded_parts = [quote(str(part).strip('/'), safe='') for part in parts if str(part).strip('/')]
    return f"/{UPLOAD_ROOT_NAME}/" + "/".join(encoded_parts)


def normalize_upload_url(value):
    if not value or not isinstance(value, str):
        return value
    if value.startswith('/static/uploads/'):
        return '/uploads/' + value.removeprefix('/static/uploads/')
    if value.startswith('static/uploads/'):
        return '/uploads/' + value.removeprefix('static/uploads/')
    return value


def public_upload_directory(category: str) -> Path:
    allowed = {'avatars', 'license_certificates', 'templates', 'downloads'}
    if category not in allowed:
        raise ValueError(f"Upload category is not public: {category}")
    return upload_root() / category
