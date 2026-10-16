#!/usr/bin/env python3
"""Readiness check for an already running local or published web release."""
import json
import argparse
import re
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", default="http://127.0.0.1:8000")
    parser.add_argument("--native-api", action="store_true", help="Check the optional native HTTP service instead of a static web build")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    origin = urlsplit(base)
    origin = f"{origin.scheme}://{origin.netloc}"

    def request(path, data=None):
        body = None if data is None else json.dumps(data).encode()
        with urlopen(Request(base + path, data=body, headers={"Content-Type": "application/json", "Origin": origin}), timeout=30) as response:
            content = response.read()
            if path.endswith(".wasm"):
                assert response.headers.get_content_type() == "application/wasm", "Serve WebAssembly with application/wasm"
                assert content.startswith(b"\0asm"), "The engine URL must serve a WebAssembly binary"
            if path.endswith((".js", ".mjs")):
                assert response.headers.get_content_type() in ("text/javascript", "application/javascript"), "Serve JavaScript modules with a JavaScript MIME type"
            return content

    assert b"CircuIT Lab" in request("/")
    if not args.native_api:
        manifest = json.loads(request("/manifest.webmanifest"))
        assert manifest["start_url"] == "./" and manifest["scope"] == "./"
        service_worker = request("/sw.js").decode()
        assets = json.loads(re.search(r"^const ASSETS=(\[.*\]);$", service_worker, re.MULTILINE).group(1))
        assert "engine/generated/engine.wasm" in assets and "index.html" in assets
        for asset in assets:
            assert not asset.startswith("/") and ":" not in asset and ".." not in asset.split("/")
            request("/" + asset)
        print(f"PASS {base}: install manifest, worker, WebAssembly MIME/binary, and all {len(assets)} offline assets")
        print("Run tests/wasm-browser.mjs to verify worker execution and a fresh offline launch in Chrome.")
        return

    assert json.loads(request("/api/health"))["status"] == "ok"
    catalog = json.loads(request("/api/catalog"))
    assert len(catalog["levels"]) == 24
    total = 0
    for lesson in catalog["levels"]:
        circuit = json.loads(request(f'/api/reference/{lesson["id"]}'))
        result = json.loads(request("/api/check", {"circuit": circuit, "level": lesson["id"]}))
        assert result["passed"], (lesson["title"], result)
        total += result["total"]
    circuit = json.loads(request("/api/reference/1"))
    for value in [0, 1]:
        result = json.loads(request("/api/simulate", {"circuit": circuit, "inputs": [value]}))
        assert result["outputs"] == [value]
    print(f"PASS {base}: page, health, live signals, 24 lessons / {total} cases")


if __name__ == "__main__":
    main()
