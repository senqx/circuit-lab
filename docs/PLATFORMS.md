# Shared application and platform integration

CircuIT Lab uses **Capacitor for mobile** and the **web/PWA for desktop**. The
Android preview is included; iOS packaging comes later. Desktop installers are
deferred. Every target uses the same C++ engine compiled to WebAssembly and the
same HTML, CSS, JavaScript, and SVG interface.

## Shared code

| Layer | Location | Responsibility |
| --- | --- | --- |
| Engine | `src/engine/` | Components, evaluation, memory, lessons, and checking |
| Engine access | `src/ui/engine/` | Worker lifecycle and typed C-ABI calls |
| Application | `src/ui/` | Editing, rendering, routing, layout, handbook, and lesson navigation |
| Device capabilities | `src/ui/platform.mjs` | Persistence, file selection/export, suspension, and offline setup |
| Mobile shell | `platforms/capacitor/` | Native packaging and platform capability overrides |
| Web hosting | `deploy/` | Optional host/container configuration |

Application code stays in `src/`. The mobile project contains only the shell and
its integration code. `scripts/build_app.py` produces the portable `dist/app/`
bundle, including the engine, UI, fonts, and icons. Capacitor's preparation script
copies it into `dist/mobile/` and changes the entry script. Both directories and
Android's copied assets are generated and excluded from Git.

```text
src/engine/ + src/ui/
    → scripts/build_app.py → dist/app/
        → Static HTTPS host → Browser / PWA
        → Capacitor sync → dist/mobile/ → Android APK / AAB
```

The UI submits `catalog`, `reference`, `simulate`, and `check` requests through
one Promise-based interface. It uses the same WebAssembly worker on every
platform. The native C++ API and optional Python HTTP service remain available
for other integrations; the game packages do not need them at runtime.

## Platform adapter

`platform.mjs` exports the capabilities the editor uses:

- `readText(key)` and `writeText(key, value)` use local storage. Save formats and
  migrations remain in the shared application.
- `exportFile(name, contents)` shares a JSON file on touch browsers when file
  sharing is supported; otherwise it downloads the file. Cancellation returns
  false. The Android preview replaces this with an explicit unavailable message
  until native sharing is implemented.
- `bindFileImport(onFile)` uses the browser file input and delivers a `File` to
  shared validation. Capacitor handles Android's native file chooser; device
  testing is still required.
- `onSuspend(save)` flushes pending saves on page hide, unload, and backgrounding.
  Native lifecycle forwarding remains a follow-up for the Android shell.
- `prepareOffline()` registers the web service worker. The mobile entry replaces
  it with a no-op because all assets are bundled in the application.

`platforms/capacitor/entry.mjs` overrides capabilities before importing the shared
`app.js`. Keep native integrations there; avoid OS checks in circuit code or
editor event handlers. JSON validation and save rules stay shared.

Storage access remains synchronous because the browser and Capacitor WebView
provide local storage. Introducing asynchronous native storage would require an
explicit startup/read cache. Separate browser and native installations do not
automatically share progress. Import/export transfers individual circuits once
both platforms support it.

## Android baseline

The first package uses Capacitor 8.5.3, its core Android shell, and no optional
native plugins. Its Java activity only extends Capacitor's `BridgeActivity`.
There is no Rust code, Android NDK build, native engine copy, or second UI.

Capacitor serves bundled files from its secure local origin (`https://localhost`)
with JavaScript module and WebAssembly MIME types. The app keeps the same worker
architecture, disables service-worker registration, and updates UI and engine
together through the APK. Capacitor's built-in system-bar handling reserves
space around the WebView. The launch screen and launcher reuse the shared icon.

See [Android setup](ANDROID.md) for build requirements, installation, and phone
testing. [Release validation](RELEASE.md) records measured sizes and the checks
actually performed. The development SDK, JDK, Gradle, and npm dependencies are
build tools; their disk usage is separate from the APK download.

## Next steps

1. Test the preview on actual Android devices: first launch offline, wiring,
   pinch/pan, rotation, system bars, background/resume, file import, and saved work
   after restarting or upgrading the app.
2. Add the native integrations demonstrated to be necessary: file sharing,
   Android Back navigation, and lifecycle save hooks. Keep them in the shell
   adapter and measure the resulting package size.
3. Prepare iOS with the same bundle and Capacitor entry. Building and signing an
   iOS app requires macOS, Xcode, and Apple's distribution setup.
4. Configure production signing and validate store requirements before release.
   A locally signed test APK is only a preview.

Responsive layouts and pointer events remain shared. Layout and hit-target
changes should follow screen size and input capability. A native shell does not
itself make the SVG editor faster. Measure real devices before changing the
renderer or adding a native engine bridge; emulated viewports cannot establish
finger accuracy, WebView behavior, battery use, or OS lifecycle correctness.

## Application icons

The shared logo is `src/ui/icon.svg`. Browser PNG fallbacks, mask-safe PWA icons,
an Apple touch icon, and an opaque 1024px iOS source asset live in `src/ui/icons/`.
Android uses a vector foreground with a solid background in adaptive launcher
icons, plus density-specific legacy PNGs. The native launch screen uses the
foreground without a baked-in square. When adding iOS, put `icon-1024.png` into
its AppIcon asset catalog; iOS packaging and device validation are still pending.
