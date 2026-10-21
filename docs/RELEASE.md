# Android 1.0.0-rc.1 — phone-test candidate

Prepared on 21 October 2026. Publication and the final 1.0.0 version are pending physical-device acceptance.

This candidate changes the application ID to `senqx.circuitlab`, adds NAND-design handbook pages and PPA teaching targets, and updates completion rewards with SVG stars. All eight PPA lessons have a tested single-circuit construction meeting all three targets. Earlier lessons earn gold completion without optimization targets.

Local APK: `dist/releases/circuit-lab-android-1.0.0-rc.1.apk`, version code 5. Signed with the existing preview identity; APK signature v2/v3 and alignment verified. SHA-256: `3138509bb72d0be3342a45768fb316e06d9514fc915b624917d20246bbf70aa4`.

Validation: native CTest; nine Python integration/packaging/parity tests; all 24 lessons and 2,458 cases across native/WebAssembly; curriculum and portrait browser regressions (10 handbook pages, responsive layouts, separate grading/reference dialogs, bus inputs and keyboard access); packaged mobile entry, persistence and wiring; packaged PPA stars and introduction; native lifecycle/file adapter tests. Android `assembleRelease` and `lintRelease` passed (0 errors; 10 existing tooling/resource/icon warnings).

Phone acceptance: launch offline; read/swipe the handbook; build and check an early lesson; enter PPA challenges and inspect the introduction; check 0–3 reward stars and centered gold SVG badges; rotate, zoom and wire overlapping parts; background/reopen; use Back; save/open/share a circuit. This package installs separately from `io.github.senqx.circuitlab` as agreed; prior-package progress is not migrated.

---

# Release validation — CircuIT Lab

WebAssembly migration, curriculum update, and C++ style refactor validated on 16 October 2026. Android beta.1 and the responsive-layout beta.2 were built and checked on 19 October 2026. The game uses a C++ engine running in a Web Worker on both platforms. No public web deployment or app-store publication was performed. Android test packages are distributed separately as GitHub prereleases.

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

## Android beta.1 — 19 October 2026

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

## Task layout for narrow windows — web validation

The shared UI now keeps Task and Check circuit in a bottom bar when the window
is 1,000 CSS pixels wide or less, independently of device type or orientation.
Each lesson opens its task before building. The same
instruction panel slides above that bar and returns to the board when dismissed.
Build circuit is a contrasting, full-width button in the panel footer.
It is the only close button in the compact layout: the bottom title is plain
text while the task is open, then becomes the reopen button when collapsed.
Expected results has a bulb with a round question-mark badge beneath the scrolling parts
list and opens a separate reference sheet, without task tabs or grading feedback.
A combinational table row sets its inputs and closes that sheet so the player
can see the result. Clock sequences retain their ordered-step behavior.
Wide screens keep the instruction book beside the workbench.

The handbook shows one page at a time when the window is 760 CSS pixels wide
or less. Navigation, neighbouring page titles, and page numbers use individual
pages, with a short horizontal slide and fade. Wider windows show two-page
spreads with a page-fold animation. Resizing preserves the
current page and cancels any in-progress page turn safely.

The full Chrome acceptance suite passed with the rebuilt web bundle. Responsive
coverage is now part of that suite, including desktop-window resizing from
320×568 to 1080×1920, the 1000/1001-pixel boundary, a wide 1280×390 window, and
phone emulation on/off at the same width. Checks cover first-launch guidance,
saved-circuit reloads, controls without page scrolling, touch and keyboard table
selection, multibit inputs and pagination, lesson transitions, free-play return,
rapid panel toggles, and reduced motion. Handbook checks visit all ten pages,
resize across the 760/761-pixel boundary and during a turn, and verify page
numbers and accessible return controls. Expectations have independent pagination,
keyboard dismissal, and no task tabs. Screenshots were inspected. Existing editor,
wire, import/save, clock, handbook, and curriculum regressions also passed.

Additional first-visit checks run before loading any game page, with browser
caching enabled and no saved welcome state. The automatic handbook opens one
page at 360, 700, and 760 pixels, and two at 761 pixels. A cached offline reload
also opens the welcome handbook on page 1 / 8. The narrow-layout suite passed
with the slide animation, including all pages, resizing during a turn, and
reduced motion. An older UI was not reproduced in the rebuilt bundle; an old
service worker can continue serving a previous build after its server stops.

This change was validated on the web first and is included in Android beta.2.
The engine and native shell behavior are unchanged.

## Android beta.2 — 19 October 2026

[v1.0.0-beta.2](https://github.com/senqx/circuit-lab/releases/tag/v1.0.0-beta.2)
packages the responsive task, expected-results, and handbook changes above.
The application ID remains `io.github.senqx.circuitlab`; the version name is
`1.0.0-beta.2` and version code is 2. No dependencies or native plugins were added.

| Artifact | Bytes | Size |
| --- | ---: | ---: |
| Installable APK, local preview signature | 3,608,099 | 3.44 MiB / 3.61 MB |
| Unsigned Android App Bundle | 3,430,650 | 3.27 MiB |

Validation completed for this release:

- Rebuilt the shared application with pinned Emscripten 4.0.15. Native release
  build/CTest, worker client, 100 routing cases, editor geometry, and all nine
  Python integration tests passed. Native/WebAssembly parity covers 24 lessons
  and 2,458 cases, including signals, contacts, memory, and invalid-input recovery.
- The full web acceptance suite and mobile bundle browser suite passed. The
  mobile entry includes first-launch handbook, task controls, separate expected
  results, save/reload, service-worker suppression, all lesson checks through
  the WASM worker, and mouse/keyboard/emulated-touch wiring checks.
- `assembleRelease`, `bundleRelease`, and `lintRelease` passed. App lint has no
  errors and the same four warning categories recorded for beta.1; Capacitor
  retains its upstream lint baseline.
- All 29 prepared mobile files match the APK and AAB byte for byte. Shared game
  assets match the web build; the WASM engine is identical to beta.1. Neither
  package includes native `.so` libraries.
- APK v2/v3 signatures and ZIP alignment passed. The manifest has the expected
  application ID, version, minimum SDK 24, target SDK 36, and no debuggable flag.
  Its signing certificate matches beta.1, allowing an update over that package.
- Public source scans found no recognizable credential tokens or private keys.
  Local signing keys, credentials, SDK caches, and generated packages are ignored
  and excluded from source packaging.

The signed APK and its SHA-256 file are the release downloads. Its SHA-256 is
`c29caeff67f3c8ffd76699bed5c8cbb139bdf70430e52d06dfe7914ee94b0f9e`.
Install it over beta.1 to retain local data. This release was checked in Chrome
and through Android build tools; its installation/upgrade and native WebView
behavior still need phone testing. Native export, Back, and lifecycle integration
remain pending. All temporary test browsers and game servers were stopped.

## Android beta.3 — icons, handbook gestures, and startup

Built on 19 October 2026 with application ID `io.github.senqx.circuitlab`,
version name `1.0.0-beta.3`, and version code 3. Adds adaptive and themed Android
icons, browser favicon fallbacks, future iOS assets, handbook swipes, an SVG task
chevron, instructions without duplicate tables, separate grading, and a brief
opening screen that prevents first-launch task flicker. SVG zoom no longer
forces a cached compositor layer.

`assembleRelease`, `bundleRelease`, and `lintRelease` passed. App lint has no
errors; dependency-version, unused-resource, and legacy launcher-shape warnings
remain. Capacitor retains its upstream lint baseline. APK v2/v3 signatures and
ZIP alignment passed. Its certificate matches downloaded beta.2. All 32 mobile
assets match the signed APK byte for byte. Minimum SDK is 24 and target SDK 36.

The signed APK is 3,637,576 bytes. SHA-256:
`175c341a5453d8fd0d548f8528989f241b367ecfb010c8a79a4f0f53cba9e1ff`.

Focused Chrome gesture/startup/panel checks, rendering, routing, editor geometry,
worker-client, and mobile packaging checks passed. The packaged mobile browser
suite passed all 24 lessons / 2,458 cases, save recovery, and touch wiring.
Wire rerouting and async/import release regressions also passed. Stationary flow had zero
paint events and DOM mutations and paused/resumed correctly. Physical Android
installation/upgrade testing, iOS packaging, and production signing remain
pending. Existing preview signing and project GitHub credentials were recovered
from the device snapshot into ignored `build-tools/`; they are excluded from
Git and release downloads.

## Android beta.4 — native controls and overlap selection

Version code 4 adds native Back priority, pause/background save flushing, Android
Save/Open document dialogs, and JSON attachment sharing. Capacitor App 8.1.2,
Filesystem 8.1.5, and Share 8.0.3 are pinned. The entry is bundled with esbuild;
Android document access is isolated in CircuitFilesPlugin and shared validation
still owns circuit acceptance. No broad storage permission is required.

Signed artifact: `dist/circuit-lab-android-beta.4.apk`, 3,744,565 bytes,
with a SHA-256 file beside it. Certificate matches prior previews; signatures,
alignment, and all 32 packaged assets verified. Android assembleRelease and
lintRelease passed, as did adapter cancellation/save tests, Back/action UI tests,
mobile packaging, routing/geometry, and the packaged mobile browser suite with
all 24 lessons / 2,458 cases. Native document/chooser behavior and process-kill
recovery require physical Android testing. The APK and checksum are the beta.4
GitHub prerelease downloads.

Signing files and GitHub credentials now reside outside the checkout under
owner-only `~/.local/share/circuit-lab-private/`. Git uses the relocated login;
the old credential copies were removed from build-tools.

Overlap targeting now follows SVG paint order: upper blocks and visible pins win,
covered pins cannot steal clicks, and undo/import keep node layers consistent.
Mouse/touch overlap regressions and the rerouting suite passed. The beta.4
APK was rebuilt and its signature and alignment verified.

Beta.4 APK SHA-256: `fea8a260ab5119206a697ef6252bde38fcc13ed02ab2ce113492f284eb21739f`.
