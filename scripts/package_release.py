#!/usr/bin/env python3
"""Create a source release from explicit public directories, without local data."""
import gzip
import hashlib
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
NAME = "circuit-lab-1.0.0"
FILES = ["CMakeLists.txt", "README.md", "LICENSE", "serve.py", "requirements.txt", "Dockerfile", ".dockerignore", ".gitignore"]
DIRECTORIES = ["engine", "server", "web", "examples", "tests", "docs", "deploy", "scripts"]


def main():
    paths = [ROOT / name for name in FILES]
    for name in DIRECTORIES:
        paths.extend(p for p in (ROOT / name).rglob("*") if p.is_file() and
                     "__pycache__" not in p.parts and p.suffix != ".pyc" and not p.name.startswith("."))
    destination = ROOT / "dist" / f"{NAME}.tar.gz"
    destination.parent.mkdir(exist_ok=True)
    with destination.open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as archive:
            for path in sorted(paths):
                info = archive.gettarinfo(str(path), f"{NAME}/{path.relative_to(ROOT)}")
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ""
                info.mode = 0o644
                with path.open("rb") as source:
                    archive.addfile(info, source)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(destination.suffix + ".sha256").write_text(f"{digest}  {destination.name}\n")
    print(f"{destination}\nSHA-256 {digest}")


if __name__ == "__main__":
    main()
