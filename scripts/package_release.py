#!/usr/bin/env python3
"""Create a source release from explicit public directories, without local data."""
import gzip
import hashlib
import os
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
NAME = "circuit-lab-1.0.0"
FILES = ["CMakeLists.txt", "README.md", "LICENSE", "serve.py", "requirements.txt", "Dockerfile", ".dockerignore", ".gitignore", ".gitattributes", ".clang-format"]
DIRECTORIES = ["src", "examples", "tests", "docs", "deploy", "scripts", "platforms"]
SKIP_DIRECTORIES = {"__pycache__", "node_modules", "build", "capacitor-cordova-android-plugins"}
SKIP_FILES = {"local.properties", "keystore.properties"}
GENERATED = {
    "platforms/capacitor/android/app/src/main/assets",
    "platforms/capacitor/android/app/src/main/res/xml/config.xml",
    "platforms/capacitor/android/app/src/main/res/drawable-nodpi/circuit_icon.png",
}


def source_paths(root):
    paths = [root / name for name in FILES]
    for name in DIRECTORIES:
        for directory, folders, files in os.walk(root / name):
            base = Path(directory)
            folders[:] = [folder for folder in folders if not folder.startswith(".") and
                          folder not in SKIP_DIRECTORIES and not (base / folder).is_symlink() and
                          (base / folder).relative_to(root).as_posix() not in GENERATED]
            for name in files:
                path = base / name
                if (name.startswith(".") and name != ".gitignore") or name in SKIP_FILES:
                    continue
                if path.is_symlink() or path.suffix in {".pyc", ".jks", ".keystore", ".p12", ".pfx"}:
                    continue
                if path.relative_to(root).as_posix() not in GENERATED:
                    paths.append(path)
    return sorted(paths)


def main():
    paths = source_paths(ROOT)
    destination = ROOT / "dist" / f"{NAME}.tar.gz"
    destination.parent.mkdir(exist_ok=True)
    with destination.open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as archive:
            for path in sorted(paths):
                info = archive.gettarinfo(str(path), f"{NAME}/{path.relative_to(ROOT)}")
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ""
                info.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                with path.open("rb") as source:
                    archive.addfile(info, source)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(destination.suffix + ".sha256").write_text(f"{digest}  {destination.name}\n")
    print(f"{destination}\nSHA-256 {digest}")


if __name__ == "__main__":
    main()
