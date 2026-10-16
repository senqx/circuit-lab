#!/usr/bin/env python3
"""Compile the shared engine and assemble a portable, offline web application."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EMSDK_IMAGE = "emscripten/emsdk:4.0.15"


def build_app(*, docker=False, compile_engine=True):
    docker = docker or not shutil.which("emcmake")
    build = ROOT / ("build-wasm-docker" if docker else "build-wasm")
    if compile_engine:
        if docker:
            if not shutil.which("docker"):
                raise RuntimeError("Install Emscripten (emcmake) or Docker to build the web application.")
            command = ["docker", "run", "--rm", "--mount", f"type=bind,source={ROOT},target=/src", "--workdir", "/src"]
            if hasattr(os, "getuid"):
                command += ["--user", f"{os.getuid()}:{os.getgid()}"]
            command += ["--env", "EM_CACHE=/src/build-wasm-docker/cache", EMSDK_IMAGE, "sh", "-c",
                        "emcmake cmake -S . -B build-wasm-docker -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm-docker --parallel 2"]
            subprocess.run(command, check=True)
        else:
            subprocess.run(["emcmake", "cmake", "-S", str(ROOT), "-B", str(build), "-DCMAKE_BUILD_TYPE=Release"], check=True)
            subprocess.run(["cmake", "--build", str(build), "--parallel", "2"], check=True)
    for name in ("engine.mjs", "engine.wasm"):
        if not (build / name).is_file():
            raise RuntimeError(f"Missing {build / name}; build the WebAssembly engine first.")
    destination = ROOT / "dist" / "app"
    destination.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="app-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "app"
        shutil.copytree(ROOT / "src" / "ui", stage)
        generated = stage / "engine" / "generated"
        generated.mkdir()
        for name in ("engine.mjs", "engine.wasm"):
            shutil.copyfile(build / name, generated / name)
        shutil.copyfile(ROOT / "LICENSE", stage / "LICENSE")
        files = sorted(p for p in stage.rglob("*") if p.is_file())
        digest = hashlib.sha256()
        for path in files:
            digest.update(path.relative_to(stage).as_posix().encode())
            digest.update(b"\0" + path.read_bytes())
        assets = [p.relative_to(stage).as_posix() for p in files if p.name != "sw.js"]
        worker = stage / "sw.js"
        worker.write_text(worker.read_text().replace("__BUILD_ID__", digest.hexdigest()[:20]).replace("__ASSET_LIST__", json.dumps(assets)))
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(stage), destination)
    print(f"Application bundle: {destination}")
    print(f"WebAssembly: {(build / 'engine.wasm').stat().st_size / 1024:.0f} KiB")
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docker", action="store_true", help="Use the pinned Emscripten container even if emcmake is installed")
    parser.add_argument("--skip-compile", action="store_true", help="Repackage UI changes using the existing compiled engine")
    args = parser.parse_args()
    try:
        build_app(docker=args.docker, compile_engine=not args.skip_compile)
    except (RuntimeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Application build failed: {error}\n")


if __name__ == "__main__":
    main()
