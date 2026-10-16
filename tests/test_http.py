"""Exercise the actual WSGI/C++ boundary without opening a network port."""
import copy
import gzip
import io
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from wsgiref.util import setup_testing_defaults
from wsgiref.validate import validator

from src.server.app import create_app


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = staticmethod(validator(create_app()))

    def request(self, path, data=None, method=None, raw=None, **headers):
        body = raw if raw is not None else json.dumps(data).encode() if data is not None else b""
        environ = {}
        setup_testing_defaults(environ)
        environ.update(REQUEST_METHOD=method or ("POST" if body else "GET"), PATH_INFO=path,
                       QUERY_STRING="", HTTP_HOST="lab.test", CONTENT_TYPE="application/json",
                       CONTENT_LENGTH=str(len(body)))
        environ.update(headers)
        environ["wsgi.input"] = io.BytesIO(body)
        result = []
        response = self.app(environ, lambda status, h: result.extend([int(status.split()[0]), dict(h)]))
        try:
            payload = b"".join(response)
        finally:
            response.close()
        return *result, payload

    def test_every_lesson_through_transport(self):
        status, _, payload = self.request("/api/catalog")
        self.assertEqual(status, 200)
        levels = json.loads(payload)["levels"]
        self.assertEqual(len(levels), 24)
        for level in levels:
            with self.subTest(level=level["id"]):
                _, _, reference = self.request(f'/api/reference/{level["id"]}')
                status, _, checked = self.request("/api/check", {"circuit": json.loads(reference), "level": level["id"]})
                self.assertEqual(status, 200)
                self.assertTrue(json.loads(checked)["passed"])

    def test_static_assets_and_methods(self):
        status, headers, plain = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"CircuIT Lab", plain)
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        _, zipped_headers, zipped = self.request("/", HTTP_ACCEPT_ENCODING="gzip")
        self.assertEqual(zipped_headers["Content-Encoding"], "gzip")
        self.assertEqual(gzip.decompress(zipped), plain)
        status, _, body = self.request("/", method="HEAD")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(self.request("/", HTTP_IF_NONE_MATCH=headers["ETag"])[0], 304)
        self.assertEqual(self.request("/wire-router.mjs")[1]["Content-Type"], "text/javascript")
        self.assertEqual(self.request("/api/health")[0], 200)
        for path in ["/../serve.py", "/src/server/app.py", "/src/http_headers.py", "/.codex", "/fonts/", "/api/missing"]:
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request("/api/simulate")[0], 405)
        self.assertEqual(self.request("/api/catalog", {})[0], 405)

    def test_reject_malformed_requests(self):
        valid = {"circuit": {"nodes": [{"id": 1, "kind": "INPUT", "width": 1}], "wires": []}, "inputs": [1]}
        invalid = [None, [], {}, {**valid, "inputs": [True]}, {**valid, "inputs": "1"},
                   {**valid, "tick": "false"}, {**valid, "state": []},
                   {**valid, "state": {"1\0extra": 1}}]
        for field, value in [("kind", "INPUT\0other"), ("kind", "\ud800"), ("id", 2**40), ("id", False)]:
            data = copy.deepcopy(valid)
            data["circuit"]["nodes"][0][field] = value
            invalid.append(data)
        for data in invalid:
            with self.subTest(data=repr(data)):
                self.assertEqual(self.request("/api/simulate", raw=json.dumps(data).encode())[0], 400)
        for raw in [b"{", b"\xff", b"[" * 2000 + b"]" * 2000]:
            self.assertEqual(self.request("/api/simulate", raw=raw)[0], 400)
        self.assertEqual(self.request("/api/simulate", raw=b" " * 1_000_001)[0], 413)
        self.assertEqual(self.request("/api/simulate", method="POST")[0], 413)
        self.assertEqual(self.request("/api/simulate", valid, CONTENT_TYPE="text/plain")[0], 415)
        for origin in ["https://lab.test", "http://elsewhere.test", "null", "http://[broken"]:
            self.assertEqual(self.request("/api/simulate", valid, HTTP_ORIGIN=origin)[0], 403)
        self.assertEqual(self.request("/api/simulate", valid, HTTP_ORIGIN="http://lab.test")[0], 200)

    def test_clock_and_concurrent_clients(self):
        circuit = {"nodes": [{"id": 1, "kind": "INPUT"}, {"id": 100, "kind": "DFF"}, {"id": 50, "kind": "OUTPUT"}],
                   "wires": [{"from": 1, "output": 0, "to": 100, "input": 0}, {"from": 100, "output": 0, "to": 50, "input": 0}]}
        def client(value):
            _, _, first = self.request("/api/simulate", {"circuit": circuit, "inputs": [value], "tick": True})
            result = json.loads(first)
            self.assertEqual(result["outputs"], [value])
            _, _, held = self.request("/api/simulate", {"circuit": circuit, "inputs": [1-value], "state": result["state"]})
            self.assertEqual(json.loads(held)["outputs"], [value])
            _, _, fresh = self.request("/api/simulate", {"circuit": circuit, "inputs": [value]})
            self.assertEqual(json.loads(fresh)["outputs"], [0])
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(client, [0, 1] * 16))


if __name__ == "__main__":
    unittest.main()
