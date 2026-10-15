# Release review — CircuIT Lab 1.0.0

Reviewed on 15 October 2026. Ready for a first web deployment, with the final public HTTPS check still to be performed on the chosen host. No public deployment was made during this review.

## Review outcome

The C++ engine remains the single implementation of component behavior, graph validation, memory, lesson specifications, and grading. Larger blocks are composed from earlier components. The existing renderer and editor modules already have useful boundaries, so this review preserves them rather than introducing a new framework or a second evaluator.

Local and production hosting now share `server/engine.py` and `server/app.py`. `serve.py` handles local build-and-run convenience; Gunicorn handles production workers. Generated directories and local tool metadata are excluded from the Docker context and source release. The README is a concise entry point, with detailed engine and deployment documentation in `docs/`.

## Issues corrected

- **Clock ordering:** a queued clock step used to read mutable inputs when its request finally started. It now snapshots the values present when clicked and uses memory from the preceding completed step. Finishing an older display request no longer re-enables a pending clock button.
- **Import integrity:** unknown/prototype-inherited component names, invalid endpoints, duplicate receivers, mismatched widths, oversized input lists, and invalid names are rejected before rendering. Rejected imports leave the current circuit intact. A damaged workspace recovers to a playable starter.
- **Imported IDs:** adding a part to a valid imported circuit containing ID 1,000,000 previously produced an invalid ID. Insertion now uses an available ID.
- **Async recovery:** browser requests have bounded waits, stale failures do not replace another workspace's status, and an import finishing after a workspace change is ignored. Error messages make sense for online players.
- **C boundary:** error handling has a nonallocating JSON fallback, and builder failures remain failures even if allocating the diagnostic fails. Exceptions are contained at the C interface.
- **Transport:** strict booleans, integer bounds, and NUL-free strings prevent ambiguous values from crossing the C ABI. Same-origin checks include scheme and host. Public assets are explicitly loaded; request paths cannot select filesystem files.
- **Release hosting:** production has bounded workers, timeouts, health checks, conditional caching, gzip, and a non-root container. Runtime startup does not compile code.
- **Instructions and tooling:** removed stale Show insides instructions; browser test commands now fail on timeout/disconnection instead of hanging indefinitely.

## Validation

| Check | Result |
| --- | --- |
| Native release build | Passed; 156 assertions, all 24 reference lessons |
| Behavioral lesson cases | All 2,458 cases passed through native and HTTP paths |
| Address/undefined-behavior/leak sanitizers | Passed with no reported findings |
| WSGI/API integration | Passed, including malformed requests, methods, static files, gzip, caching, origins, explicit memory, and concurrent clients |
| Routing | 100 routing cases passed |
| Layout and selection geometry | Passed: deep chains, feedback groups, deterministic layout, spacing, marquee selection |
| Full Chrome browser acceptance suite | Passed against the production Gunicorn server |
| New browser regressions | Passed: delayed clock/input ordering, invalid imports, damaged saves, maximum imported ID |
| Rendering | Moving flow, pause, and offscreen behavior passed; zero static DOM mutations and zero paint events during the sampled stationary circuit |
| Clean Docker build | Passed with GCC 14.2 and Python 3.13; native tests run inside the build |
| Container runtime | Passed as UID/GID 65532 with a read-only root filesystem and writable `/tmp` |
| Container HTTP smoke | Page, health, live signals, all 24 lessons / 2,458 cases passed |
| Source archive | Deterministic packaging; extracted into an empty directory, rebuilt, and passed native, HTTP, routing, and layout checks |

The browser suite covers first launch, handbook turns and cancellation, NAND-first lesson order, truth tables and bus examples, successful and failed grading, skip/revisit navigation, saved progress migration, import/export, free-play return, reset/clear, undo/redo, inventory drag/drop, wire creation/rerouting/cancellation, multi-selection, tidy, memory, keyboard interactions, reduced motion, and phone-sized viewports down to 320px.

The sampled stationary flow consumed about 1.86 ms of main-thread work over one second. No renderer redesign was needed for this review. This measurement does not guarantee 60 fps on every circuit, browser, or device. Earlier gesture profiling and its methodology are described in `ENGINE.md` and `tests/performance.mjs`.

Sanitizer execution required running outside the development sandbox because LeakSanitizer cannot operate under ptrace isolation. Tests passed when run without that instrumentation constraint.

## Publication steps and limits

Choose a Docker-capable host, configure HTTPS and trusted proxy forwarding, deploy the prepared image, and run `scripts/smoke.py` against the public URL. The exact commands and settings are in [DEPLOYMENT.md](DEPLOYMENT.md).

Validation used Linux and Chrome, including emulated touch and small viewports. Physical iOS/Android devices, Safari/Firefox, and public-host load testing were not part of this run. Server sizing should follow actual usage; circuit requests are bounded and workers are finite. This review found no remaining release-blocking defect within the tested scope.

Progress remains local to each browser origin. A preview domain and production domain have separate saves. Export/import preserves circuits when moving between them. Existing lesson IDs and `signal-garden-v2` keys remain unchanged. Downloadable and mobile packaging are later work.
