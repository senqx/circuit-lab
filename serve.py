#!/usr/bin/env python3
"""Build and serve the portable web app, or start the optional native HTTP API."""
import argparse
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

from scripts.build_app import ROOT, build_app
from src.http_headers import SECURITY_HEADERS


class LocalServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class QuietHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        if len(args) < 2 or str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)


class StaticHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        for name, value in SECURITY_HEADERS:
            self.send_header(name, value)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)

    def log_message(self, fmt, *args):
        if len(args) < 2 or str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description="Play CircuIT Lab locally.")
    parser.add_argument("--port", type=int, help="Port number (defaults to 8000, or an available port if busy).")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-build", action="store_true", help="Serve an existing dist/app build")
    parser.add_argument("--native-api", action="store_true", help="Run the optional native C++ HTTP API for integrations and tests")
    args = parser.parse_args()
    if args.native_api:
        from src.server.app import create_app
        from src.server.engine import load_engine

        app = create_app(load_engine(build=True))
        start = lambda port: make_server(args.host, port, app, LocalServer, QuietHandler)
    else:
        directory = ROOT / "dist" / "app" if args.no_build else build_app()
        if not (directory / "engine" / "generated" / "engine.wasm").is_file():
            parser.error("Build the web app first: python3 scripts/build_app.py")
        start = lambda port: ThreadingHTTPServer((args.host, port), partial(StaticHandler, directory=str(directory)))
    try:
        server = start(args.port if args.port is not None else 8000)
    except OSError as e:
        if e.errno == errno.EADDRINUSE and args.port is None:
            server = start(0)
        else:
            sys.exit(f"Could not start CircuIT Lab: {e}. Try another --port.")
    print(f"\n  CircuIT Lab is ready → http://{args.host}:{server.server_port}\n  Press Ctrl+C to stop.\n", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSee you in the lab.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
