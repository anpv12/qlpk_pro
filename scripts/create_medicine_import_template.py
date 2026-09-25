"""Generate the current DAV-linked catalog template from its runtime owner."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.modules.medicines.services.catalog_excel import build_template


def create_medicine_template():
    target = Path(__file__).resolve().parents[1] / 'app/static/templates/mau_import_thuoc.xlsx'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(build_template().getvalue())
    return str(target)


if __name__ == '__main__':
    print(create_medicine_template())
