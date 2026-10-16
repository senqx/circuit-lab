"""Keep static play usable without the optional native adapter or compiler."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class LauncherTests(unittest.TestCase):
    def test_static_launch_without_native_source(self):
        with tempfile.TemporaryDirectory(prefix="circuit-launcher-") as temporary:
            root = Path(temporary)
            for name in ("serve.py", "scripts/build_app.py", "src/http_headers.py"):
                destination = root / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, destination)

            missing = subprocess.run([sys.executable, "serve.py", "--no-build"], cwd=root,
                                     capture_output=True, text=True, timeout=10)
            self.assertEqual(missing.returncode, 2, missing.stderr)
            self.assertIn("python3 scripts/build_app.py", missing.stderr)

            wasm = root / "dist/app/engine/generated/engine.wasm"
            wasm.parent.mkdir(parents=True)
            wasm.write_bytes(b"\0asm\x01\0\0\0")
            # Replace only the listening socket; exercise the real launcher and imports.
            script = """
import sys
sys.path.insert(0, '.')
from unittest.mock import patch
import serve
with patch.object(serve, 'ThreadingHTTPServer') as host, \\
     patch.object(serve, 'build_app', side_effect=AssertionError('Unexpected build')):
    host.return_value.server_port = 8000
    with patch.object(sys, 'argv', ['serve.py', '--no-build']):
        serve.main()
    address, handler = host.call_args.args
    assert address == ('127.0.0.1', 8000)
    assert handler.keywords['directory'] == str(serve.ROOT / 'dist/app')
    host.return_value.serve_forever.assert_called_once_with()
    host.return_value.server_close.assert_called_once_with()
assert not any(name == 'src.server' or name.startswith('src.server.') for name in sys.modules)
"""
            result = subprocess.run([sys.executable, "-I", "-c", script], cwd=root,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
