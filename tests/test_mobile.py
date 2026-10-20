"""Verify mobile packaging reuses shared assets and excludes local build data."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from scripts.package_release import source_paths

ROOT = Path(__file__).resolve().parents[1]


class MobilePackagingTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is required for mobile preparation")
    def test_shared_bundle_and_failed_preparation(self):
        with tempfile.TemporaryDirectory(prefix="circuit-mobile-") as temporary:
            root = Path(temporary)
            shell = root / "platforms/capacitor"
            shell.mkdir(parents=True)
            for name in ("prepare.mjs", "entry.mjs", "native-platform.mjs"):
                shutil.copyfile(ROOT / "platforms/capacitor" / name, shell / name)
            (shell / "node_modules").symlink_to(ROOT / "platforms/capacitor/node_modules", target_is_directory=True)
            files = {
                "index.html": b'<script type="module" src="app.js"></script>',
                "app.js": b"// Shared editor fixture",
                "platform.mjs": b"export const platform = {};",
                "engine/generated/engine.wasm": b"\0asm\x01\0\0\0",
                "icons/icon-512.png": b"shared-icon",
            }
            for name, content in files.items():
                path = root / "dist/app" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)

            def prepare():
                return subprocess.run(["node", str(shell / "prepare.mjs")], cwd=root,
                                      capture_output=True, text=True, timeout=20)

            result = prepare()
            self.assertEqual(result.returncode, 0, result.stderr)
            mobile = root / "dist/mobile"
            for name, content in files.items():
                self.assertEqual((root / "dist/app" / name).read_bytes(), content)
                expected = content.replace(b'src="app.js"', b'src="native.mjs"') if name == "index.html" else content
                self.assertEqual((mobile / name).read_bytes(), expected)
            self.assertIn(b"installNativePlatform", (mobile / "native.mjs").read_bytes())
            self.assertEqual((shell / "android/app/src/main/res/drawable-nodpi/circuit_icon.png").read_bytes(), files["icons/icon-512.png"])

            before = {p.relative_to(mobile): p.read_bytes() for p in mobile.rglob("*") if p.is_file()}
            (root / "dist/app/engine/generated/engine.wasm").unlink()
            result = prepare()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Build the shared app first", result.stderr)
            self.assertEqual(before, {p.relative_to(mobile): p.read_bytes() for p in mobile.rglob("*") if p.is_file()})

    def test_source_archive_excludes_mobile_build_data(self):
        with tempfile.TemporaryDirectory(prefix="circuit-release-") as temporary:
            root = Path(temporary)
            keep = ["platforms/capacitor/package-lock.json", "platforms/capacitor/android/.gitignore",
                    "platforms/capacitor/android/gradlew", "platforms/capacitor/android/gradle/wrapper/gradle-wrapper.jar"]
            omit = ["platforms/capacitor/node_modules/dependency/index.js", "platforms/capacitor/android/.gradle/cache",
                    "platforms/capacitor/android/app/build/outputs/app.apk", "platforms/capacitor/android/local.properties",
                    "platforms/capacitor/android/keystore.properties", "platforms/capacitor/android/release.jks",
                    "platforms/capacitor/android/capacitor-cordova-android-plugins/build.gradle",
                    "platforms/capacitor/android/app/src/main/assets/public/app.js",
                    "platforms/capacitor/android/app/src/main/res/xml/config.xml",
                    "platforms/capacitor/android/app/src/main/res/drawable-nodpi/circuit_icon.png"]
            for name in keep + omit:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fixture")
            packaged = {p.relative_to(root).as_posix() for p in source_paths(root)}
            self.assertTrue(set(keep).issubset(packaged))
            self.assertTrue(set(omit).isdisjoint(packaged))


if __name__ == "__main__":
    unittest.main()
