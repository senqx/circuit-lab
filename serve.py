#!/usr/bin/env python3
"""Development launcher. Production uses the same WSGI app through Gunicorn."""
import argparse
import errno
import sys
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

from server.app import create_app
from server.engine import load_engine


class LocalServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class QuietHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        if len(args) < 2 or str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description="Play CircuIT Lab locally.")
    parser.add_argument("--port", type=int, help="Port number (defaults to 8000, or an available port if busy).")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    app = create_app(load_engine(build=True))
    try:
        server = make_server(args.host, args.port if args.port is not None else 8000, app, LocalServer, QuietHandler)
    except OSError as e:
        if e.errno == errno.EADDRINUSE and args.port is None:
            server = make_server(args.host, 0, app, LocalServer, QuietHandler)
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
