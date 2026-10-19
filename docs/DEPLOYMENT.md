# Web deployment

CircuIT Lab's web release is a static application. The C++ engine runs as WebAssembly in a browser worker. The host delivers files; it does not evaluate or store player circuits. The Capacitor Android preview packages the same shared build; see [Android packaging](ANDROID.md).

## Build and publish static files

Install Python 3.10+ and either Emscripten or Docker, then run:

```sh
python3 scripts/build_app.py
python3 serve.py --no-build
```

With Emscripten installed, the build uses `emcmake`. Otherwise it uses the official `emscripten/emsdk:4.0.15` Docker image. `--docker` selects that image explicitly. `--skip-compile` repackages interface changes with an already compiled engine; do not use it after changing C++ or CMake.

Publish the **contents of `dist/app`**, preserving its directories, to an HTTPS static host. GitHub Pages, a static-site service, or a normal web server can serve it. For GitHub project Pages, the application works under `/circuit-lab/`; no hardcoded domain or root API path is used. Deploy the generated artifact, not the `src/ui/` source directory, which does not contain the compiled engine or assembled service worker.

Use a complete/atomic deployment so files from different builds are not mixed. No public deployment or GitHub Actions workflow is performed automatically by the build.

Required host settings:

| File | Content type |
| --- | --- |
| `.wasm` | `application/wasm` |
| `.js`, `.mjs` | `text/javascript` or `application/javascript` |
| `.webmanifest` | `application/manifest+json` |

If configuring a Content Security Policy, allow same-origin modules/workers and `script-src 'self' 'wasm-unsafe-eval'`. The supplied server policies include this. No `unsafe-eval`, cross-origin isolation, or shared-memory headers are required. A restrictive proxy policy must also permit these capabilities.

## Installation, offline use, and updates

HTTPS or localhost enables the service worker. Its first successful installation caches the complete application, including fonts and WebAssembly. Afterwards, a fresh page and engine worker can start offline. Installing the PWA is optional; browser installation controls can add it to the home screen or desktop. Browser support and installation UI vary.

Builds generate a cache version from all application files. An update downloads into a new cache and waits for existing app tabs/windows to close before activation. Reopen to receive it. This keeps an open engine and interface on the same version. A failed cache installation does not replace the working version. `sw.js` should be revalidated (`Cache-Control: no-cache`); the supplied hosts use revalidation for all assets.

During development, close existing tabs or unregister the service worker in browser developer tools when testing a new build. The browser test suite clears its disposable profile's app cache before acceptance checks. Never use a personal Chrome profile for those tests.

Progress belongs to the exact application origin. Moving to another domain or a native app does not transfer it automatically. Existing JSON import/export transfers circuits. Browser storage can be cleared by the user or operating system; keep exports for circuits you want to retain.

## Container

The default container compiles WebAssembly, then serves only static files using unprivileged Nginx:

```sh
docker build -t circuit-lab:release .
docker run --rm --name circuit-lab --read-only \
  --tmpfs /tmp:rw,nosuid,noexec,size=64m \
  -p 127.0.0.1:8000:8080 circuit-lab:release
```

On a container host, expose container port **8080** and use `/` as the health check. Use the host's HTTPS endpoint or an HTTPS reverse proxy. The final image contains no compiler, Python runtime, or circuit API. The web server logs ordinary asset requests.

## Verify a deployment

```sh
python3 scripts/smoke.py http://127.0.0.1:8000
python3 scripts/smoke.py https://your-domain.example/circuit-lab
```

The smoke check verifies the page, manifest, JavaScript/WebAssembly content types, binary signature, and every offline asset. It does not execute the engine; native/WebAssembly parity and browser execution are checked by:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node tests/engine-client.mjs
node tests/browser.mjs http://127.0.0.1:8000 http://127.0.0.1:18438
node tests/wasm-browser.mjs http://127.0.0.1:18438
```

Build the native library before the Python tests. Start disposable headless Chrome as documented in the README. The offline test serves the application from a subdirectory, stops its server, reloads the page, and checks all 24 lessons through the real worker. Run browser suites sequentially.

Finally open the deployed HTTPS address on actual target devices. Check installation, offline restart, wiring, background/resume, import/export, and memory clock steps. Physical iOS/Android devices and Safari/Firefox require separate validation.

## Optional native HTTP service

The C++/Python API in `src/server/` remains for integrations and native transport tests. The launcher imports it only with `--native-api`; normal web play uses the static bundle independently:

```sh
python3 serve.py --native-api --port 8001
python3 scripts/smoke.py http://127.0.0.1:8001 --native-api
```

For production API hosting, `requirements.txt` and `deploy/gunicorn.conf.py` configure Gunicorn, with `src.server.app:create_app()` as its application entry point from the repository root. `docker build -f deploy/Dockerfile.native -t circuit-lab:native-api .` builds the optional API image, which listens on port 8000. It is an API service; the portable game should be deployed from the separate static build. The native service can also serve a prebuilt `dist/app` when that directory is present.

Native HTTP requests remain bounded, use explicit memory state, and enforce same-origin browser requests. Keep the API behind HTTPS, set `PORT`/`WEB_CONCURRENCY` as needed, and set `FORWARDED_ALLOW_IPS` to the trusted proxy addresses. The shared web application never switches to this API automatically.

## Source release

```sh
python3 scripts/package_release.py
```

The source archive includes the engine, shared UI sources, mobile shell, tests, deployment files, scripts, and licenses. The Android Gradle wrapper is included so recipients can use the pinned build tool. The archive excludes generated applications, dependencies, SDKs, compiler caches, signing keys, virtual environments, and local configuration. Recipients build their own `dist/app` and, optionally, Android package. No host, domain, or app-store publication is performed by packaging.
