#!/usr/bin/env python3
"""Readiness check for an already running local or published web release."""
import json
import sys
from urllib.request import Request, urlopen


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")

    def request(path, data=None):
        body = None if data is None else json.dumps(data).encode()
        with urlopen(Request(base + path, data=body, headers={"Content-Type": "application/json", "Origin": base}), timeout=30) as response:
            return response.read()

    assert json.loads(request("/api/health"))["status"] == "ok"
    assert b"CircuIT Lab" in request("/")
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
