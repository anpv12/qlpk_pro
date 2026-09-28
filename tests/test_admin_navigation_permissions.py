"""The backend admin permission payload must cover actual navigation entries."""
import ast
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AdminNavigationPermissionsTest(unittest.TestCase):
    def test_all_navigation_permissions_are_in_admin_payload(self):
        tree = ast.parse((ROOT / 'app/services/session_identity.py').read_text())
        assignment = next(node for node in tree.body if isinstance(node, ast.Assign)
                          and any(isinstance(target, ast.Name) and target.id == 'ALL_PERMISSIONS'
                                  for target in node.targets))
        permissions = set(ast.literal_eval(assignment.value))
        navigation = (ROOT / 'app/static/js/app-shell/navigation.config.js').read_text()
        menu_permissions = set(re.findall(r"permission(?:Alt)?:\s*'([^']+)'", navigation))
        self.assertTrue(menu_permissions)
        self.assertEqual(menu_permissions - permissions, set())


if __name__ == '__main__':
    unittest.main()
