"""Check that C ABI diagnostics survive JSON escaping without losing text."""
import json
import unittest

from src.server.engine import load_engine


class EngineBridgeTests(unittest.TestCase):
    def test_diagnostic_round_trip(self):
        lib = load_engine()
        for kind in ('Unknown "quoted" part', 'Unknown\\part\n\r\t\x01', 'Unknown café · λ'):
            with self.subTest(kind=kind):
                handle = lib.circuit_create()
                self.assertTrue(handle)
                try:
                    self.assertEqual(lib.circuit_node(handle, 1, kind.encode(), 1), 0)
                    result = json.loads(lib.circuit_check(handle, 1))
                    self.assertEqual(result["error"], "Unknown component: " + kind)
                finally:
                    lib.circuit_destroy(handle)


if __name__ == "__main__":
    unittest.main()
