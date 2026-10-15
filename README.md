# CircuIT Lab

**Switch it. Wire it. Make it work.**

Curiosity is all you need. Build logical circuits through 24 discoveries, from a signal and a bulb to a four-bit processor. Explore controlled switches, build NAND as your first logic gate, then use earlier discoveries to build gates, arithmetic, and memory.

![CircuIT Lab workbench](docs/workbench.png)

## Play locally

Install Python 3.10+, CMake 3.16+, a C++17 compiler, and Make or another CMake build tool. Local play needs no Python packages or JavaScript build tools.

```sh
python3 serve.py
```

Open the printed address. The launcher builds the engine when needed and normally uses `http://127.0.0.1:8000`. If that port is busy, it chooses another. To choose a port yourself:

```sh
python3 serve.py --port 18437
```

Keep the server running. Fonts and assets are bundled, so local play works without internet access. Restart the launcher after editing source or web assets.

## Publish the web application

The production release uses the same application and C++ engine, hosted by Gunicorn with bounded workers. The container builds and tests the native engine, then runs without a compiler or root privileges.

```sh
docker build -t circuit-lab:release .
docker run --rm -p 127.0.0.1:8000:8000 circuit-lab:release
```

See [deployment instructions](docs/DEPLOYMENT.md) for an HTTPS host, configuration, a container smoke test, and a source archive. [Release validation](docs/RELEASE.md) records what was tested and what remains for publication. A static-only host cannot run the native engine; choose a host that runs Docker or Python with a compiled shared library.

## Learn and experiment

The handbook opens on the first visit. Read the task, place parts from the left tray, connect their dots, change the inputs, and check the circuit against its expected truth table or clock sequence. The interface teaches logic without requiring electrical terminology.

| Chapter | Discoveries |
| --- | --- |
| Signals | A signal link, constant 1, controlled switch |
| Rules | NAND → NOT → AND → OR → XOR → selector → router |
| Numbers | Half adder, full adder, four-bit NOT, AND, ripple-carry adder |
| Calculator | Zero detector, four-bit selector, arithmetic logic unit |
| Memory | One-bit storage, enabled register, counter, address decoder |
| Computer | Two-word RAM, four-bit processor |

Drag or click to add blocks. Click two pins or drag between them to connect. Drag a connected receiving pin to move that wire's end; Escape, right-click, or an empty drop cancels. Select with a desktop-style selection box or modifier-click, and use **Del** to remove. Lesson terminals stay on the board. **Tidy circuit** arranges a messy layout, and Undo restores it.

**Space-drag** or middle-drag pans, scrolling or pinching zooms, and **F** fits the board. **?** opens the handbook. The task and chapter path can be hidden for more room. Gold wires flow only while carrying a nonzero signal; zero wires remain still. Motion can be paused and respects reduced-motion settings.

**Previous** returns to saved work. **Next** unlocks after a successful check; **Skip** asks before leaving an unfinished experiment. Hints and worked examples are available, and exploring an example does not mark a lesson complete. **Free play mode** provides all the parts, import/export, and a return to your last lesson.

Circuits, inputs, and progress save in this browser. Export JSON files to keep or share them. Memory starts at zero when reopening a workspace. Existing `signal-garden-v2` saves and lesson IDs are preserved, including the NAND-first ordering; supported version-1 saves migrate without deleting their originals.

## One engine, different interfaces

```text
Web editor → JSON / HTTP → Python adapter → C ABI → C++ engine
                                                     ↑
Native application ────────────── C++ API ─────────────┘
```

The C++17 library owns all component definitions, signal propagation, validation, memory, lesson specifications, and checking. Advanced blocks expand into ordinary circuits made from earlier parts. Python translates requests; JavaScript handles editing and presentation. Neither implements gate evaluation.

Independent behavioral specifications deliberately check the recipes against expected answers. Alternative constructions and unused unwired parts are accepted; using the finished target chip cannot complete its own lesson.

| Directory | Responsibility |
| --- | --- |
| `engine/include/signal/` | Public C++ and C APIs |
| `engine/src/` | Evaluation, compositional catalog, and C bridge |
| `server/` | Shared HTTP application and JSON-to-C-ABI adapter |
| `web/` | Editor, geometry, symbols, animation, handbook, and bundled fonts |
| `tests/` | Native, HTTP, browser, routing, and rendering checks |
| `examples/` | Small native client |
| `deploy/` | Production worker configuration |
| `scripts/` | Release packaging |
| `docs/` | Engine integration, deployment, and validation |

`build*`, `.venv*`, `test-artifacts`, caches, local tool metadata, and `dist` are generated or local directories. They are excluded from release sources and container build input.

Read [engine design and integration](docs/ENGINE.md) for the APIs, signal states, clock semantics, and rendering architecture. Future native or mobile interfaces can reuse the engine without changing the circuit rules.

## Validate changes

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel 4
ctest --test-dir build --output-on-failure
python3 -m unittest discover -s tests -p 'test_*.py' -v
node tests/wires.mjs
node tests/editor.mjs
```

Address, undefined-behavior, and leak checks with GCC/Clang:

```sh
cmake -S . -B build-sanitize -DCMAKE_BUILD_TYPE=Debug -DSIGNAL_SANITIZE=ON
cmake --build build-sanitize --parallel 4
ctest --test-dir build-sanitize --output-on-failure
```

Browser checks require Node.js 22+ and Chrome. Run a game server, then start a **disposable** Chrome profile; the suite resets that profile's progress:

```sh
google-chrome --headless=new --remote-debugging-port=18438 \
  --user-data-dir=/tmp/circuit-lab-tests about:blank
node tests/browser.mjs http://127.0.0.1:18437 http://127.0.0.1:18438
node tests/rendering.mjs http://127.0.0.1:18437 http://127.0.0.1:18438
```

Run these suites sequentially because they share a browser tab. Screenshots and reports go into `test-artifacts/`. For gesture profiling, run `node tests/performance.mjs` with the same two URLs. Frame cadence measures browser scheduling, not guaranteed display performance on every device.

## Scope

This is a logic game with ideal directional switches, discrete values, and a shared clock. It does not simulate analog electronics. The processor has a four-bit accumulator and program counter with LOAD, ADD, AND, and JUMP instructions supplied through front-panel inputs; it has no ROM or assembler. RAM is a separate discovery.

There are no accounts or analytics. Online play sends circuits to the server for evaluation; the application does not persist them there. Progress remains browser-local, and hosting platforms may retain ordinary request logs. The bundled fonts retain their license notices in [web/fonts](web/fonts/).
