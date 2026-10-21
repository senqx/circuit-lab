# Android preview

CircuIT Lab uses Capacitor 8.5.3 for Android. The package contains the shared UI
and C++ engine compiled to WebAssembly. It works from bundled assets, with no
simulation server, Rust code, Android NDK, or native copy of the circuit engine.
iOS packaging is the next platform step; desktop users can use the web/PWA.

Android uses the official Capacitor App, Filesystem, and Share plugins, plus a
small CircuitFiles bridge for Android's system Save/Open document dialogs.
Export lets you choose a location; Share sends a JSON attachment through the
system chooser. Import accepts local or cloud documents and runs shared circuit
validation. Cancelling any chooser leaves the circuit intact. No broad storage
permission is requested.

Back closes the frontmost dialog, journey drawer, active gesture, or compact task
panel before exiting from the clear board. Native pause/background events flush
pending saves; local storage restores the circuit after process restart. A file
picker result restored after process recreation is delivered to shared import
validation. Physical-device verification remains required.

## Test the prepared APK on a phone

Open [beta.4 on GitHub Releases](https://github.com/senqx/circuit-lab/releases/tag/v1.0.0-beta.4)
on the phone and download `circuit-lab-android-beta.4.apk` from **Assets**.
Install beta.4 over beta.3 without uninstalling: both use the same application ID
and signing certificate, and beta.4 increases the version code to 4. Confirm that
saved circuits and progress remain after updating.

The prepared APK is `dist/circuit-lab-android-beta.4.apk`, with a `.sha256`
checksum beside it. Beta.4 is **3,744,565 bytes (3.74 MB / 3.57 MiB)** and uses the
local preview certificate, not a production signing identity. Build outputs and
signing material remain ignored and excluded from release sources.

Open the installed app in airplane mode to verify bundled offline startup.

For an initial test:

- Complete the first lesson. Connect the input to the bulb, toggle it, and check
  the circuit. Open and close the handbook and task panel.
- Place and move blocks, connect wires in both directions, reroute an existing
  wire, cancel a connection, and try pinch zoom and panning.
- Rotate between portrait and landscape. Check that controls remain reachable
  and the status/navigation bars do not cover the game.
- In a narrow window, check that the task opens for each lesson, **Build circuit**
  closes it, and **Check circuit** stays visible. Open **Expected results** below
  the parts list and select a row to set the inputs. The handbook should show one
  page at a time with individual page numbers; swipe left/right to turn pages.
- Build part of a lesson, wait a moment, switch to another app, and return. Close
  and reopen CircuIT Lab too; the circuit and progress should remain.
- Try importing a circuit JSON file exported from the web version; also cancel
  the file picker. Export with the system Save dialog and share the circuit as a JSON attachment.

When reporting a problem, include the phone model, Android version, the action
that triggered it, and what appeared on screen. Note whether it happened only in
portrait/landscape or after returning from another app.

Subsequent APKs must use the same application ID and signing certificate to
update this installation while retaining its data. A separately generated debug
APK uses a different certificate. Keep the preview key local for test updates;
replacing the signing identity may require uninstalling and losing local saves.

## Requirements

- Build the shared application as described in [README](../README.md): Python
  3.10+ and either Emscripten or Docker.
- Node.js 22+ and npm for the mobile shell only.
- JDK 21, with `JAVA_HOME` pointing to it.
- Android SDK platform 36, Build Tools 35.0.0, and platform-tools. Android Studio
  can install and manage these. Set `ANDROID_HOME` to your SDK, or create an
  untracked `platforms/capacitor/android/local.properties` containing
  `sdk.dir=/absolute/path/to/your/android-sdk`.

The Gradle wrapper downloads the pinned Gradle 8.14.3 distribution and verifies
its SHA-256 checksum. Initial builds download SDK and Maven dependencies; later
builds reuse the caches. These development tools are not shipped in the APK.

The app targets Android 16 / API 36, with Android 7 / API 24 as its minimum OS.
It requires Android System WebView / Chrome 109 or later for the shared browser
features, including MathML. Minimum-version settings are compatibility bounds,
not a claim that every supported device has been tested.

## Build from the repository root

```sh
python3 scripts/build_app.py
npm --prefix platforms/capacitor ci
npm --prefix platforms/capacitor run sync
cd platforms/capacitor/android
./gradlew assembleRelease bundleRelease lintRelease
```

On Windows, use `gradlew.bat` for the last command. To open the project in Android
Studio, run `npm --prefix platforms/capacitor run open:android` from the repository
root.

The outputs are:

- `platforms/capacitor/android/app/build/outputs/apk/release/app-release-unsigned.apk`
- `platforms/capacitor/android/app/build/outputs/bundle/release/app-release.aab`

Release outputs are unsigned until you configure signing. The baseline keeps
Capacitor's default release setting, with code shrinking disabled, so its size
can be compared directly with later plugin and optimization changes.

For a locally installable debug build:

```sh
cd platforms/capacitor/android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Android Studio or Gradle creates the usual local debug certificate. Keep real
release signing keys and passwords outside Git. Choose a permanent application
ID and signing identity before distribution; the preview ID is
`senqx.circuitlab`.

The prepared preview was signed separately with the SDK's `apksigner` and checked
with `apksigner verify` and `zipalign -c 4`. Keep the key and password outside the repository in an owner-only directory.
This device uses `~/.local/share/circuit-lab-private/android-preview/`.
Unsigned release outputs and the AAB cannot be installed by tapping them. Use a
signed APK for direct phone testing.

## What is shared

`src/engine/` and `src/ui/` remain the only editable game sources.
`platforms/capacitor/prepare.mjs` copies `dist/app/` into generated `dist/mobile/`,
changes its entry script, and copies the shared icon into Android resources.
Capacitor sync copies that generated bundle into the Android project.

The native entry replaces only platform capabilities before importing the same
`app.js`. It disables service-worker registration: bundled assets already work
offline, and an app update replaces UI and engine together. Circuit files,
progress keys, and lesson IDs retain their existing formats. Web/PWA and native
storage are separate; installing an APK does not migrate browser progress.

After editing the game, rebuild `dist/app/`, run mobile sync, and rebuild the APK.
Do not edit `dist/mobile/` or Android's copied assets directly. Native build
output, dependencies, local SDK paths, and signing keys are excluded from Git
and the source release.

## Validation

```sh
python3 -m unittest discover -s tests -p 'test_mobile.py' -v
```

`tests/mobile-browser.mjs` runs against a static server serving `dist/mobile/`
and a disposable Chrome instance, using the same DevTools setup as the main
browser suite. It checks native entry loading, the initial single-page handbook,
task controls, separate expected results, service-worker suppression, saved
progress, all 24 lessons / 2,458 cases, and mouse/emulated-touch wiring.
This checks the packaged web assets, not Android's actual WebView or OS behavior.

On a real phone, check first launch without a network connection, wiring and
pinch/pan gestures, rotation, system bars, background/resume, process restart,
file-import cancellation, and progress after an app upgrade. Device results and
measured package sizes belong in [release validation](RELEASE.md).
