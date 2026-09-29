import argparse
import re
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.security_config import production_security_errors

COMPOSE_ENV = re.compile(r"^\s*-\s*([A-Z_][A-Z0-9_]*)=\$\{\1:-([^}]*)\}\s*$")


def compose_app_defaults(compose_path: Path) -> dict[str, str]:
    """``KEY=${KEY:-default}`` entries of the ``app`` service environment in docker-compose."""
    defaults: dict[str, str] = {}
    in_app = in_env = False
    for line in compose_path.read_text(encoding="utf-8").splitlines():
        if re.match(r"^  [\w-]+:\s*$", line):
            in_app, in_env = line.strip() == "app:", False
            continue
        if in_app and re.match(r"^    environment:\s*$", line):
            in_env = True
            continue
        if in_env and re.match(r"^    \S", line):
            in_env = False
        match = COMPOSE_ENV.match(line) if in_env else None
        if match:
            defaults[match.group(1)] = match.group(2)
    return defaults


def main(argv=None):
    parser = argparse.ArgumentParser(description="Kiểm tra cấu hình bảo mật production.")
    parser.add_argument("--compose", type=Path, help="Đánh giá thêm biến môi trường mặc định của service app trong docker-compose")
    args = parser.parse_args(argv)
    config = settings
    if args.compose:
        overrides = {key: value for key, value in compose_app_defaults(args.compose).items()
                     if not getattr(settings, key, None) and value}
        config = SimpleNamespace(**{**{key: getattr(settings, key) for key in dir(settings) if key.isupper()}, **overrides})
        print(f"Using {args.compose} app environment defaults: {', '.join(sorted(overrides)) or 'none'}")
    errors = production_security_errors(config)
    print('Production security configuration: ' + ('FAIL' if errors else 'PASS'))
    for message in errors:
        print('- ' + message)
    if settings.DEBUG:
        print('- Current runtime is DEBUG; production checks above remain mandatory for deployment.')
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
