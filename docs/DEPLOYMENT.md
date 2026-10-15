# Web deployment

CircuIT Lab is ready for a web-first deployment on a Linux Docker host. The C++17 engine remains reusable through its C/C++ APIs for later downloadable or mobile clients. The current web interface requires a modern browser and an active connection to the engine.

## Container

From the project root:

```sh
docker build -t circuit-lab:release .
docker run --rm --name circuit-lab --read-only \
  --tmpfs /tmp:rw,nosuid,noexec,size=64m \
  -p 127.0.0.1:8000:8000 circuit-lab:release
```

Open `http://127.0.0.1:8000`. The image compiles the engine and runs all native tests during its build. The final image includes only the Python runtime, production server, shared engine, and web assets. It runs as UID/GID 65532 with two synchronous workers; circuit state comes from each request, so instances need no shared session storage or database.

On a managed host that supports Docker, select this directory and its `Dockerfile`, expose port 8000 (or the host's `PORT` value), and set the health-check path to `/api/health`. Keep the web assets and `/api/` endpoints on the same origin.

| Setting | Default | Use |
| --- | --- | --- |
| `PORT` | `8000` | HTTP port inside the container |
| `WEB_CONCURRENCY` | `2` | Worker count; start here and size against the host's CPU/RAM |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1,::1` | Trusted proxy addresses for forwarded HTTPS scheme |

Use the host's HTTPS endpoint or place an HTTPS reverse proxy in front of Gunicorn. Preserve the original `Host` and send `X-Forwarded-Proto: https`. Set `FORWARDED_ALLOW_IPS` to that proxy's addresses. A managed private-ingress service may need `*`; use that only when clients cannot reach Gunicorn directly and the platform replaces forwarded headers. Correct forwarding matters because API POSTs check the browser's Origin against the request's scheme and host.

The application bounds request bodies to 1 MB, requires JSON POSTs, and validates arguments before calling the native library. Workers time out at 25 seconds; browser requests time out at 30 seconds. Assets use conditional caching and gzip, and the catalog is prepared once per worker. No circuit data is written to the server. The platform can retain standard access logs; those do not include request bodies in the supplied configuration.

## Without Docker

On a Linux host with Python 3.10+, CMake, Make, and a C++17 compiler:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel 4
ctest --test-dir build --output-on-failure
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/gunicorn --config deploy/gunicorn.conf.py 'server.app:create_app()'
```

Run that command under the hosting platform's process manager and HTTPS proxy. Production startup loads the existing library; it never builds code at request time. `serve.py` remains the local development launcher.

## Verify a deployment

```sh
python3 scripts/smoke.py http://127.0.0.1:8000
# After choosing and deploying to your host:
python3 scripts/smoke.py https://your-domain.example
```

The smoke check loads the page and catalog, checks live signals, and runs every reference lesson through the deployed C++ engine. It also sends the same Origin header as a browser, catching incorrect HTTPS proxy configuration. It creates no accounts and changes no saved player data.

Then open the actual HTTPS address on desktop and phone. Confirm that the first-visit handbook opens, a wire lights the first bulb, Check circuit passes, and reload preserves progress. Browser storage belongs to the exact origin: a localhost, preview, and production URL each have separate saves. Export circuits before moving between them.

## Source release

```sh
python3 scripts/package_release.py
```

This writes `dist/circuit-lab-1.0.0.tar.gz` and its SHA-256 checksum. It packages explicit source directories and the bundled font licenses, excluding build output, virtual environments, screenshots from test runs, caches, local tool metadata, and user data. Repeated packaging of the same files produces the same archive bytes. Extract it, then use the same Docker or native commands above.

For updates, build a new image, pass the smoke check, then replace the running instance. Keep the previous image for rollback. No database migration is needed. Preserve the existing storage keys and stable lesson IDs when changing the curriculum.

## Publication status

The project includes a tested release configuration and source package. No public host, domain, or hosting credentials have been supplied, and no public deployment has been made. Hosting account selection and the final HTTPS smoke check remain the publication steps. Downloadable/mobile packaging and device-specific performance tuning are later work.
