import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.security_config import production_security_errors


def main():
    errors = production_security_errors(settings)
    print('Production security configuration: ' + ('FAIL' if errors else 'PASS'))
    for message in errors:
        print('- ' + message)
    if settings.DEBUG:
        print('- Current runtime is DEBUG; production checks above remain mandatory for deployment.')
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
