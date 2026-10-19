# Release validation — CircuIT Lab

WebAssembly migration, curriculum update, and C++ style refactor validated on 16 October 2026. The first Capacitor Android preview was built and checked on 19 October 2026. The game uses a C++ engine running in a Web Worker on both platforms. No public web deployment or app-store publication was performed. Android test packages are distributed separately as GitHub prereleases.

## Implementation

Native and WebAssembly builds share the same C++ engine. CMake also produces an Emscripten ES module and WebAssembly binary. JavaScript converts arguments through the existing C ABI; it does not implement circuit behavior. Simulation and checking run in a worker, while editor gestures and rendering remain in the main thread.

The shared web bundle includes offline caching, installation metadata/icons, and a small platform adapter for persistence, files, suspension, and offline setup. Existing save keys, file formats, migrations, lesson IDs, and clock semantics remain intact. `dist/app` is the artifact for static hosts and the input to Capacitor mobile packaging.

The default Docker image serves static files through unprivileged Nginx. The optional Python/Gunicorn API remains available for native integrations and tests.

Teaching switches explicitly default an unwired EN to 0, while the pin displays ? and names the default. Wired unknowns and primitive transistor defaults remain unknown. Contact state follows EN; a closed contact passes D even when D=0. Eight optional NAND challenges are graded in C++, independently from lesson completion. The web app saves the best eligible gate count and shows a journey star when the target is reached. New handbook pages teach truth-table construction and simplification; component names and task descriptions use standard terminology.

## Validation completed

| Check | Result |
| --- | --- |
| Native release build / CTest | Passed |
| Switch and challenge regressions | All switch input combinations, unwired defaults, wired unknowns, eight achievable NAND targets, mixed-gate correctness, unused parts, and incorrect small circuits passed |
| Native sanitizers | Address, undefined-behavior, and leak checks passed after the engine changes |
| Native/WebAssembly parity | All 24 lessons and 2,458 rows match, including outputs, internal signals, switch contacts, memory, and checker results |
| Binding failures | Invalid numbers, booleans, memory, strings, and C++ diagnostics handled; subsequent requests remain usable |
| Worker client | Snapshots, reply association, request errors, worker failure/restart, timeout termination, and cloning failures passed |
| Python HTTP integration | Existing native transport tests passed |
| Full Chrome acceptance suite | Passed with the static WebAssembly build |
| Curriculum browser regressions | Switch visuals (including drag previews and placement before the worker replies), separate correctness/challenge feedback, saved best counts, worked-example protection, handbook contents, and phone layout passed |
| Clock/import browser regressions | Passed through the production static container as well |
| Offline browser execution | Loaded under a subdirectory, stopped the server, reloaded a fresh page/worker, completed a lesson, and checked all 24 lessons / 2,458 cases |
| Application suspension | Page hide flushes a pending circuit save |
| Rendering | Flow moves only when active, pauses and stops offscreen, and resumes correctly; zero static DOM mutations and no paint events in the stationary sample |
| Static Docker build | Passed with Emscripten 4.0.15 |
| Container runtime | Started without configuration warnings, using an unprivileged user and read-only root filesystem with writable `/tmp` |
| Published asset smoke | Manifest, JS/WASM content types, binary signature, and all 27 cached assets passed |

The full browser suite covers first launch, handbook turns, lesson order, expected tables, successful/failed grading, revisiting, save migration, import/export, free-play return, reset/clear, undo/redo, inventory dragging, wiring/rerouting/cancellation, selection, tidy, memory, keyboard controls, reduced motion, and phone-sized viewports down to 320px.

The wire-source shortcut reuses the existing pin-connection flow: targeting a wire resolves to its original sending pin, and dragging from a wire starts at that pin. Routing, circuit data, and the C++ engine use ordinary connections. The full Chrome acceptance suite passed after this change, including mouse, keyboard and emulated touch, width checks, cancellation, undo/redo, independent deletion, multi-output pin identity, and save/reload. Routing and editor geometry tests also passed. The handbook's binary-example alignment was corrected. Temporary browser and test-server processes were stopped after validation.

The source-layout reorganization groups application code in `src/engine/`, `src/ui/`, and `src/server/`, with generated output in `dist/app/`. The normal web launcher runs independently of the native adapter; both reuse `src/http_headers.py`. Native and WebAssembly builds, native engine tests, six Python tests (including all 24 lessons and 2,458 parity cases), worker/routing/editor tests, and both Docker image builds passed. An isolated launcher regression omits the native source and fails if compilation is attempted; Gunicorn's configuration check loads the relocated native entry point inside its image. Static HTTP assets and both launch paths were also checked without network sockets. The UI, engine source, and generated bundle matched their pre-move SHA-256 hashes byte for byte. Browser suites were not repeated because the playable bundle is unchanged; no game servers were started.

## C++ style refactor

The C++ implementation now follows [the coding conventions](CPP_STYLE.md), with `.h` headers, camelCase names, explicit pointer/reference prefixes, const-correct interfaces, and bounded line lengths. `CompiledCircuit` and `CircuitBuilder` encapsulate their state. Shared limits and JSON serialization helpers replace repeated code. The tests retain their existing runner and use focused test functions and RAII for C handles. Native C++ consumers use `signal/engine.h` and namespace `circuit`. JSON formats, component keys, and lesson IDs remain stable.

A captured pre-refactor baseline matched the new catalog, reference graphs, check results, and every simulation result for all 24 lessons / 2,458 cases, including internal signals, contacts, and memory. Native release tests and the example program passed. Address, undefined-behavior, and leak sanitizer tests passed outside the sandbox, whose process tracing prevents LeakSanitizer from running. Native/WebAssembly parity, native HTTP tests, the isolated launcher regression, and an additional C ABI JSON diagnostic round-trip test passed. Targeted clang-tidy checks found no project-code issues with braces, unnecessary copies/value parameters, or const correctness.

The 25 shared UI source/assets files were unchanged during the C++ style refactor. The browser interaction results above precede that refactor; its validation used engine/transport checks and did not start game servers or browser sessions.

The subsequent C ABI rename uses `circuit_*` consistently in the engine, WebAssembly exports, JavaScript bindings, Python adapter, and tests. External consumers of the earlier prefix must update their calls and rebuild; see [C ABI integration](ENGINE.md#c-abi). Native and WebAssembly builds, CTest, and all seven Python integration tests passed after the rename, including parity across all 24 lessons / 2,458 cases. The native library exports all nine renamed functions and no functions with the earlier prefix. The portable bundle was rebuilt; this pass did not start game servers or repeat browser interaction tests.

## Performance sample

The refactored engine binary is 224,796 bytes (about 220 KiB), or 64,683 bytes with gzip, down from 253,071 bytes before the refactor. The complete uncompressed static bundle is about 1.23 MB, including bundled fonts and icons.

A small native C-ABI simulation sample, including Python argument conversion, compared the saved pre-refactor library with the refactored library on the same machine. After five warm-up calls, 30 paired calls had median times of 0.052 → 0.051 ms for the controlled switch, 0.569 → 0.544 ms for the four-bit register, and 4.262 → 3.457 ms for the processor. This is a local regression sample, not a browser or mobile performance guarantee.

Warm browser worker round-trip medians from the migration baseline, before the curriculum update, on the development machine:

| Fixture | Median |
| --- | --- |
| Controlled-switch lesson | 0.5 ms |
| Four-bit register | 1.4 ms |
| Four-bit processor | 8.1 ms |

These include worker messaging, argument conversion, graph compilation, and simulation. They are not a native-versus-WebAssembly speedup claim and do not predict phone performance. The engine still compiles the received graph for each simulation request, preserving the simple stateless API.

Panning, zooming, wiring, and selection sampled around 60 Hz across these fixtures. Individual block dragging in the register/processor fixtures sampled about 56–57 Hz, with some frames over 25 ms. Gesture checks confirmed no engine simulation during geometry-only work and no rerouting during camera movement. That remaining drag cost belongs to workbench geometry/rendering and is not eliminated by moving simulation to WebAssembly. Animation callback cadence is not proof of smoothly presented display frames.

The stationary flow sample after the curriculum update used about 3.34 ms of main-thread work over one second, with zero DOM mutations and paint events during the sample. Detailed machine-specific reports are generated in ignored `test-artifacts/` by the performance, rendering, and parity suites.

## Earlier native review

The 15 October review covered clock/input ordering, malformed imports, maximum node IDs, C ABI exception containment, native HTTP boundaries, source packaging, and address/undefined-behavior/leak sanitizers. The worker migration re-ran behavior and browser regressions; the previous server architecture is now optional. The subsequent curriculum update changed the shared engine's switch defaults and optional challenge results and re-ran native, sanitizer, parity, and browser checks.

## Remaining platform work

Physical Android/iOS devices, Safari/Firefox, native WebViews, battery/memory behavior, app suspension by the OS, and public HTTPS hosting require target-environment validation. The Android preview is included; iOS projects, desktop installers, production signing, and app-store submissions are not. The chosen direction is Capacitor for mobile and web/PWA for desktop; see [PLATFORMS.md](PLATFORMS.md).

Publish the complete static bundle over HTTPS and run the host checks in [DEPLOYMENT.md](DEPLOYMENT.md). Web offline caching requires a successful initial installation. Updates activate after existing app tabs/windows close. Browser and native-app storage are separate; circuit transfer from the Android preview requires the pending native export integration.

## Android preview — 19 October 2026

Capacitor 8.5.3 packages the existing shared UI and WebAssembly worker. Its Java
activity only extends `BridgeActivity`; no optional native plugins, Rust code,
Android NDK, or second simulation engine were added. Preparation changes only
the HTML entry and adds the mobile adapter. The adapter disables service-worker
registration and reports that export needs a native sharing integration.

The release build uses JDK 21, Gradle 8.14.3, Android Gradle Plugin 8.13.0, SDK 36,
and Build Tools 35.0.0. It targets API 36, with minimum API 24 and WebView 109.
Code shrinking is disabled for this first baseline.

| Artifact | Bytes | Size |
| --- | ---: | ---: |
| Shared application files, uncompressed | 1,231,935 | 1.17 MiB |
| Unsigned release APK | 3,562,186 | 3.40 MiB |
| Installable APK, local preview signature | 3,604,003 | 3.44 MiB / 3.60 MB |
| Unsigned Android App Bundle | 3,428,077 | 3.27 MiB |

These are measured file sizes, not Play Store download estimates or installed
storage usage. The signed APK expands to roughly 9 MB of package entries;
Android's installed code, WebView data, and saves consume additional space.
The device supplies Android System WebView; the APK does not bundle Chromium.

Validation completed:

- `assembleRelease`, `bundleRelease`, and `lintRelease` passed. App lint reports
  zero errors and four warnings: pinned Gradle/AppCompat update notices, the
  generated Cordova config resource, and the square shared launcher icon. The
  Capacitor dependency retains its upstream lint baseline (six existing errors
  filtered); this is not a claim of zero framework lint findings.
- All 29 prepared mobile files match their packaged APK/AAB entries byte for
  byte. Shared game files, including the WASM engine, match `dist/app/`; only the
  HTML entry differs. Neither package contains native `.so` libraries.
- The APK uses the expected application ID and SDK limits and is not marked
  debuggable. Its local preview signature verifies with APK signing schemes v2
  and v3, and ZIP alignment passes.
- Mobile preparation and source-exclusion tests pass, including preservation of
  the prior mobile output if the compiled engine is missing.
- The mobile bundle passes Chrome checks for entry loading, phone viewport,
  service-worker suppression, save/reload, and the explicit export limitation.
  All 24 lessons / 2,458 cases pass through its actual WebAssembly worker. Mouse,
  keyboard, and emulated-touch wire creation/rerouting/source shortcuts pass.

The browser suite tests the mobile assets in Chrome, not Android's actual
WebView. This build machine has no USB device access or accelerated Android
emulator, so physical-device installation, first launch offline, rotation,
system bars, file picking, native Back navigation, lifecycle behavior, and
updates still need phone testing. See [phone testing instructions](ANDROID.md).
Native export, Back, and lifecycle integration remain work for the mobile
release. Temporary browser and game-server processes were stopped after checks.
