"""One WSGI application for the local launcher and the production host."""
import gzip
import hashlib
import json
import mimetypes
from http import HTTPStatus
from urllib.parse import urlsplit

from ..http_headers import SECURITY_HEADERS
from .engine import ROOT, execute, integer, load_engine

MAX_BODY = 1_000_000


def create_app(lib=None):
    lib = lib or load_engine()
    # Public assets and the immutable catalog are prepared once per worker.
    # No user path is passed to the filesystem, and no directory is listed.
    assets = {}

    def asset(route, body, content_type, cache="no-cache"):
        etag = 'W/"' + hashlib.sha256(body).hexdigest() + '"'
        assets[route] = (body, gzip.compress(body, mtime=0), content_type, etag, cache)

    public_dir = ROOT / "dist" / "app" if (ROOT / "dist" / "app").is_dir() else ROOT / "src" / "ui"
    for path in public_dir.rglob("*"):
        if path.is_file() and not any(p.startswith(".") for p in path.relative_to(public_dir).parts):
            content_type = {".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json"}.get(path.suffix) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            asset("/" + path.relative_to(public_dir).as_posix(), path.read_bytes(), content_type)
    assets["/"] = assets["/index.html"]
    catalog = lib.circuit_catalog()
    if "error" in json.loads(catalog):
        raise RuntimeError("The engine catalog could not be loaded.")
    asset("/api/catalog", catalog, "application/json; charset=utf-8", "no-store")

    def application(environ, start_response):
        method = environ["REQUEST_METHOD"]
        route = environ.get("PATH_INFO", "/")

        def respond(body, status=200, headers=()):
            if not isinstance(body, bytes):
                body = json.dumps(body, separators=(",", ":")).encode()
            defaults = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}
            defaults.update(headers)
            if status != 304:
                defaults["Content-Length"] = str(len(body))
            else:
                defaults.pop("Content-Type", None)
            start_response(f"{status} {HTTPStatus(status).phrase}", [*defaults.items(), *SECURITY_HEADERS])
            return [] if method == "HEAD" or status == 304 else [body]

        def error(message, status=400, headers=()):
            return respond({"error": message}, status, headers)

        readable = route in assets or route == "/api/health" or route.startswith("/api/reference/")
        if not readable and route not in ("/api/simulate", "/api/check"):
            return error("Resource not found.", 404)
        allowed = ("GET", "HEAD") if readable else ("POST",)
        if method not in allowed:
            return error(f"Use {allowed[0]} for this resource.", 405, [("Allow", ", ".join(allowed))])

        if route in assets:
            body, compressed, content_type, etag, cache = assets[route]
            headers = [("Content-Type", content_type), ("ETag", etag), ("Cache-Control", cache), ("Vary", "Accept-Encoding")]
            if cache != "no-store" and environ.get("HTTP_IF_NONE_MATCH") == etag:
                return respond(b"", 304, headers)
            encodings = [s.strip() for s in environ.get("HTTP_ACCEPT_ENCODING", "").split(",")]
            if "gzip" in encodings and len(compressed) < len(body):
                body = compressed
                headers.append(("Content-Encoding", "gzip"))
            return respond(body, headers=headers)
        if route == "/api/health":
            return respond({"status": "ok"})
        if route.startswith("/api/reference/"):
            try:
                return respond(lib.circuit_reference(integer(int(route.rsplit("/", 1)[1]))))
            except (ValueError, TypeError):
                return error("Invalid lesson.")
        origin = environ.get("HTTP_ORIGIN")
        if origin:
            try:
                parsed = urlsplit(origin)
            except ValueError:
                return error("Invalid Origin header.", 403)
            if parsed.scheme != environ["wsgi.url_scheme"] or parsed.netloc != environ.get("HTTP_HOST") or parsed.path or parsed.query or parsed.fragment:
                return error("Cross-origin requests are not accepted.", 403)
        if environ.get("CONTENT_TYPE", "").split(";", 1)[0].strip() != "application/json":
            return error("Send an application/json request.", 415)
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
            if not 1 <= length <= MAX_BODY:
                return error("Request body must be between 1 byte and 1 MB.", 413)
            body = environ["wsgi.input"].read(length)
            if len(body) != length:
                return error("Incomplete request body.")
            data = json.loads(body)
            return respond(execute(lib, route, data))
        except (ValueError, KeyError, TypeError, AttributeError, OverflowError, RecursionError):
            return error("Invalid circuit request. Check the parts, wires, inputs, and memory values.")

    return application
