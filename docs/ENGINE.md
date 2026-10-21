# Engine design and integration

The engine is a small C++17 library, with no dependency on a UI, HTTP, a filesystem, or a third-party JSON parser. Its public namespace is `circuit`, avoiding a collision with the standard `signal()` function.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `engine.h` | Value types and native public functions |
| `engine.cpp` | Flattening, structural validation, scheduling, signal evaluation, synchronous state updates, solution checking |
| `catalog.cpp` | Component metadata, compositional circuit recipes, lesson content, independent behavioral test specifications |
| `bridge.cpp` / `bridge.h` | Opaque C handles and JSON response serialization |
| `serve.py` | Local build-and-run launcher |
| `src/server/engine.py` | Shared JSON-to-C-ABI argument conversion |
| `src/server/app.py` | WSGI routes, public assets, request validation, and response headers |
| `src/http_headers.py` | HTTP policy shared by the local launcher and native adapter |
| `src/ui/app.js` | Circuit editing, persistent SVG elements, controls, and local persistence |
| `src/ui/symbols.mjs` | Shared circuit symbols for the tray and board |
| `src/ui/board-geometry.mjs` | Shared block footprint, pin placement, and alignment on release |
| `src/ui/wire-router.mjs` | Geometry-only obstacle avoidance and orthogonal wire paths |
| `src/ui/flow-layer.mjs` | Native compositor transform animations for visible on-signals |
| `src/ui/engine/client.mjs` | Promise-based worker requests, timeouts, and worker recovery |
| `src/ui/engine/worker.mjs` | Loads WebAssembly and executes requests away from the UI thread |
| `src/ui/engine/bindings.mjs` | Typed JavaScript-to-C-ABI argument conversion and handle cleanup |
| `src/ui/platform.mjs` | Browser storage, files, lifecycle events, and offline installation |
| `scripts/build_app.py` | Emscripten build and complete static application assembly |

## Native use

Add this project with `add_subdirectory`, then link your application to `signal_engine`. Its include directory is public.

```cpp
#include <iostream>
#include <signal/engine.h>

int main() {
  using namespace circuit;
  Circuit circuit;
  circuit.nodes = {{1, Kind::Input, 1}, {50, Kind::Output, 1}, {100, Kind::Not, 1}};
  circuit.wires
      = {{1, 0, 100, 0}, // from node, output index, to node, input index
         {100, 0, 50, 0}};
  Result result = simulate(circuit, {0});
  if (!result.error.empty()) {
    return 1;
  }
  std::cout << result.outputs[0] << '\n'; // 1
}
```

`simulate(circuit, inputs, state, tick)` returns output values, visible node signals, switch contact states, new memory state, primitive count, and an error string. Structural failures return an error without throwing through this function. Catalog lookups throw `std::runtime_error` for unknown identifiers.

Input and output terminals are ordered by ascending numeric node ID, independent of storage order. Ordinary node IDs are positive integers up to 1,000,000. IDs must be unique within each circuit. A wire goes from a component output to a component input. Each input accepts one wire; one output may fan out to many destinations. Junction components resolve multiple transistor drivers explicitly.

Lesson circuits use input IDs `1, 2, …` and output IDs `50, 51, …`. `check` enforces their count, identity, and widths, then compares outputs with the independent specification. It accepts alternative recipes and unused unwired parts. The finished target chip cannot directly solve its own lesson, except in the introductory controlled-switch exercise that explicitly supplies it. `blank(target)` produces the lesson interface. `reference(levelId)` returns the lesson's example solution. By default it is the target chip's definition; a lesson may supply a different circuit to teach a particular construction. NAND is the first gate lesson and combines active-high/active-low controlled switches with a constant 1. Reusable NOT, AND, OR, and XOR definitions build on NAND.

Call `components()`, `chapters()`, and `levels()` for immutable metadata. Chapter entries contain a name and learning goal; the HTTP catalog serializes them as objects in its `chapters` array. `component(kind)` provides ports, widths, display text, and the composite definition. A lesson's `allowed` list controls its inventory: recipe parts first, then previously introduced logic blocks. It is not a checker whitelist. Guided first-step text and scene identifiers also live in this catalog. `isSequential(kind)` derives memory use from the component definition, so UIs do not maintain separate lists of memory chip types.

Eight lessons offer optional PPA teaching targets; see [PPA teaching stars](#ppa-teaching-stars) for scoring. The catalog retains `nandChallenge`, `Level::nandTarget` and `nandHint` as compatibility fields, with `depthTarget` added for Performance. The check serializer exposes `designScore`. The UI persists independent `stars` flags alongside completion; worked examples award neither. Legacy `Check::nand` counts remain available to API clients but no longer control UI awards. The handbook covers sum of products, Boolean identities, NAND construction and PPA tradeoffs.

`levels()` returns journey order; `level(id)` looks up a stable saved identifier. Never index the vector with `id - 1`: NAND moved before NOT and AND while retaining all existing lesson IDs. `testVectors(id)` provides every expected row, in input order, or a consecutive stateful trace from zero memory. The HTTP catalog exposes those rows as `tests` and selected bus inputs as `exampleInputs` (`Level::exampleInputs` in C++). UIs find those inputs in the existing rows to show useful examples without duplicating evaluation logic. Memory traces start with illustrative capture/hold operations before exercising the full range.

## One evaluator

A component definition is a `Circuit`. Expansion recursively substitutes its internal nodes and connects its input/output terminals as aliases. Expanded IDs are hierarchical paths, such as `105.101.100`, so memory remains attached to the same cell after moving or reordering visible nodes.

After expansion, the evaluator only understands:

- External inputs and aliases/output terminals.
- Constant low and high rails.
- nMOS and pMOS directional digital switches.
- Junctions and pull-down resistors.
- One-bit clocked cells.
- Four-bit split and pack adapters.

Everything else is composed from these. The expansion produces an acyclic combinational schedule using Kahn's topological sort. Dependencies into clocked cells are excluded from that schedule: their Q outputs come from the current stored state. Any remaining cycle is an invalid combinational feedback loop.

A clock step has three phases:

1. Evaluate all combinational values using the current stored bits.
2. Collect **all** clocked cells' D values into a new state map.
3. Publish that state and settle the combinational graph again.

No cell sees another cell's newly written state during phase 2. The circuit is compiled once per `check` call and reused for all test vectors. Interactive simulation compiles the received graph per request, keeping the API stateless and the implementation simple.

Limits are 512 visible nodes, 4096 wires, 32,768 expanded primitives, and 32 levels of nesting. The HTTP/C host accepts up to 32 external inputs. These bounds are checked before or during expansion.

## Signal values

| Value | Meaning | Browser display |
| --- | --- | --- |
| `0 … (2^width − 1)` | Known bit or bus | Decimal; bus inputs also display binary |
| `-1` | Unconnected / unknown | `?` |
| `-2` | High impedance | `Z` |
| `-3` | Driver conflict | `!` |

An off transistor produces high impedance. A Junction lets high impedance yield to an active driver, preserves matching drivers, and reports conflict for opposing known drivers. A pull-down resistor converts high impedance to zero. It does not convert unknown to zero. Input values must fit their one-bit or four-bit width.

The teaching blocks `GATE` (active-high controlled switch) and `CLOSED_GATE` (active-low switch) explicitly default an **unwired EN to 0**. The browser marks its missing connection `?` and labels the default. The default is attached to the composite's EN input alias during expansion, so a present wire carrying unknown stays unknown. Other missing inputs, including primitive nMOS/pMOS gates, retain the ordinary unknown behavior. A closed contact passes D, including 0; an open contact produces 0 through the internal pull-down. The contact and output therefore need not be high together.

The catalog exposes `defaultContact` for those teaching switches, calculated by simulating an isolated block with the same engine. Drag previews and newly placed unwired switches use it immediately, before a worker reply arrives. Connected controls continue to use live simulation results. This keeps the initial illustration consistent without duplicating switch behavior in JavaScript.

The model deliberately does not solve bidirectional transistor networks, analog voltages, physical timing, or metastability. `Dff` represents a shared ideal clock event. These implementation details are optional material. The introductory journey only exposes binary values and logical switches.

`Result.contacts` maps a visible node ID to the contact state when the expanded block contains exactly one transistor: 1 is connected, 0 is open, and -1 means an unknown control. The same primitive evaluation sets the contact and the signal; there is no second gate evaluator for the illustration. A connected switch can carry 0. Components with multiple transistors have no single contact state. The browser currently uses this data to draw the early active-high and active-low switch contacts.

## C ABI

The public header, `signal/bridge.h`, has no C++ types. The exports now use the
`circuit_*` prefix, matching CircuIT Lab. Both bundled adapters use these names;
external consumers using the earlier prefix must update their calls and rebuild
against the matching library. Function signatures and JSON formats are unchanged.

Link the shared library and use:

1. `circuit_create()` to allocate an opaque circuit handle.
2. `circuit_node(handle, id, "NAND", width)` and `circuit_wire(...)` to build it.
3. Optional `circuit_state(handle, key, value)` calls to supply previous memory bits.
4. `circuit_simulate(handle, input_array, count, tick)` or `circuit_check(handle, lesson_id)`.
5. `circuit_destroy(handle)` exactly once.

Builder functions return 1 on success, 0 on failure. A builder error is retained and reported by the subsequent simulation/check call. No C++ exception crosses the C ABI. A handle is owned by one caller; concurrent callers use distinct handles.

`circuit_catalog()` and `circuit_reference(id)` expose the same metadata and reference circuits to non-C++ hosts. String-returning functions return UTF-8 JSON in thread-local storage, valid until the next string-returning call on that thread. Copy a returned string before another call. The caller must not free that string.

State is explicit: copy the `state` object returned from simulation into the next request. A simulation does not silently mutate the handle's saved state. Passing an empty state initializes every clocked cell to zero. This makes deterministic replay and independent clients straightforward.

## WebAssembly and worker API

The default web application compiles the same three C++ source files with Emscripten. CMake produces a native shared library normally, or an ES module plus `engine.wasm` when configured with `emcmake`. There is no alternate JavaScript evaluator. The build enables caught C++ exceptions, exports the `circuit_*` C ABI, omits a virtual filesystem, and allows memory growth up to 256 MiB. It does not use pthreads or shared memory, so cross-origin isolation headers are unnecessary.

Run `python3 scripts/build_app.py` to assemble `dist/app`. It uses the installed Emscripten SDK, or the pinned `emscripten/emsdk:4.0.15` Docker image. Native and Docker compiler caches have separate build directories. Generated files stay outside the source tree. The assembler adds a complete asset list and a content-derived version to the service worker.

`src/ui/engine/client.mjs` exports `engine.request(method, data)`, returning a Promise:

| Method | Data | Result |
| --- | --- | --- |
| `catalog` | None | Components, chapters, lessons, and expectations |
| `reference` | `{level}` | Ordinary reference circuit |
| `simulate` | `{circuit, inputs, state?, tick?}` | Outputs, signals, contacts, and explicit memory |
| `check` | `{circuit, level}` | Full lesson results |

The client starts one module worker lazily. Structured cloning snapshots each submitted request. The worker calls the C ABI synchronously, so requests execute in arrival order; the editor additionally preserves click-time input values and ordered memory updates. Request IDs associate replies with their callers. An engine diagnostic remains a result with an `error` field. Transport/conversion failures reject the Promise. A crash or 30-second timeout terminates the worker and rejects all pending requests; the next request can create a fresh worker. Pending circuit state remains in the editor.

The bindings check transport types before C integer conversion, allocate at most 32 input integers, and release both allocations and circuit handles in `finally`. Circuit structure and behavior remain C++ responsibilities. Native and WebAssembly JSON results share the same C++ serializer.

The browser never sends circuits to an HTTP simulation endpoint. The same static bundle can run in a browser or a packaged WebView. Assets use relative URLs, including worker and WebAssembly imports, so deployment under a repository path works. See [platform integration](PLATFORMS.md) for shell boundaries and [deployment](DEPLOYMENT.md) for caching and required MIME/CSP settings.

`tests/test_wasm.py` compares the native and WebAssembly catalogs, references, checks, and every simulation row, including internal signals, switch contacts, and explicit memory. `tests/engine-client.mjs` tests request association, snapshots, timeouts, worker failure recovery, and cloning failures. `tests/wasm-browser.mjs` starts a new page and worker after stopping its server, then checks every lesson offline.

## Optional HTTP adapter

This service remains available for native integrations and tests. It is not involved in normal web or packaged-app play.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/health` | None | `status: ok` after the engine and assets have loaded |
| `GET /api/catalog` | None | Version, chapters, components, lessons, starter interfaces, all expected rows, teaching example inputs |
| `GET /api/reference/20` | None | Ordinary graph for the lesson's component |
| `POST /api/simulate` | `circuit`, `inputs`, optional `state`, optional `tick` | `outputs`, `signals`, `contacts`, `state`, `primitives`, or `error` |
| `POST /api/check` | `circuit`, `level` | `passed`, `total`, `correct`, `error`, all expected/actual `rows` in order |

For example:

```json
{
  "circuit": {
    "nodes": [
      {"id": 1, "kind": "INPUT", "width": 1},
      {"id": 50, "kind": "OUTPUT", "width": 1},
      {"id": 100, "kind": "NOT", "width": 1}
    ],
    "wires": [
      {"from": 1, "output": 0, "to": 100, "input": 0},
      {"from": 100, "output": 0, "to": 50, "input": 0}
    ]
  },
  "inputs": [0],
  "state": {},
  "tick": false
}
```

The web editor adds `x`, `y`, and optional terminal `name` fields. The transport does not pass them to the engine. Saved/exported documents have a versioned envelope containing `version: 2`, `level`, `circuit`, `inputs`, and a `practice` flag. They contain no executable code.

Malformed HTTP arguments receive status 400; engine diagnostics are JSON responses with an `error` field. POST requests require JSON and bodies between 1 byte and 1 MB. The host rejects browser requests whose Origin differs in scheme or host. Clock ticks must be booleans, and integer and string arguments are checked before crossing the C ABI.

The local launcher binds to loopback. Production runs the same WSGI application through Gunicorn with bounded synchronous workers and timeouts; see [deployment](DEPLOYMENT.md). Each request owns its engine handle, and state is explicit, so workers need no shared session store. The immutable catalog and public web assets are prepared once per worker, with gzip representations and cache validation. Changes to web assets require a worker restart. The browser bounds API waits to 30 seconds and retains the current circuit after a failed request.

## Extending the curriculum

1. Add a component kind and its metadata in `catalog.cpp` / `engine.h`.
2. Write its `recipe` using existing components. A recipe uses the same graph representation as a player's circuit.
3. Add a behavioral specification to `testVectors`. For combinational lessons, the generator enumerates every input combination automatically. For sequential lessons, write a deterministic trace that exercises capture, hold, reset, and control priorities.
4. Add the lesson's title, explanation, goal, and three hints using the catalog's `add` helper.
5. Run the native suite. It automatically checks every registered reference lesson.

The browser discovers parts, labels, pin widths, allowed tools, and lessons from the catalog. No new frontend gate evaluator or duplicated lesson rules are needed. To add a fundamentally new physical primitive, extend the evaluator's primitive switch and provide independent correctness tests.

## Rendering and responsiveness

The frontend retains SVG node and wire elements by identity. Signal updates change classes and text when needed. One frame scheduler coalesces pointer updates for block dragging, wire previews, panning, and zooming. Camera movement transforms the scene and never routes wires. While a block moves, routes use the same complete obstacle map as on release. When all blocks move together, the renderer translates the scene and flow layer during the drag, reusing every route; release commits the new coordinates. This also lets unrelated wires shorten when an obstacle moves away. Only changed paths update their SVG and flow geometry. The pending wire uses a short preview path. Geometry changes do not restart simulation or memory. Newer input-display requests supersede queued older display requests, while clock steps remain ordered. Each request snapshots its inputs at the click; queued clock steps obtain memory from the preceding completed step. An earlier display response cannot unlock a pending clock button, and stale failures cannot overwrite the status of another workspace.

All blocks use a 144 × 144 world-space footprint, displayed at 0.9 scale at normal zoom, with pins spaced 24 units apart on a 12-unit grid. Output bulbs and LED arrays receive at their bottom center; other inputs face left and outputs face right. Positions stay continuous during dragging and snap on release. Pin attraction uses screen-space distances, so it stays usable at different zoom levels. The router first minimizes orthogonal path length subject to outward pin leads and block clearance, then minimizes bends on equal-length routes. The board enables an optional separation pass: wires are routed in stable endpoint order, with short local lane alternatives penalized for sharing a run with a different source signal. Wires from the same sending pin may share a trunk. This pass reuses the route validator and never changes circuit connectivity or expands the A* search grid. Clearance is eight units, reduced in narrow gaps; pin leads are up to 24 units. Simple candidates can prove the Manhattan lower bound. Otherwise A* searches lanes at obstacle boundaries, with visibility checks shared across wires. Equal choices are deterministic. A covered pin has no obstacle-free route, so overlapping parts temporarily use a continuous route until separated. The wire, crossing underlay, hit target, tracing overlay and moving markers share the same route points. A background-colored underlay makes crossings visibly pass over each other. Hover, keyboard focus, or single-wire selection highlights both endpoint pins and names the connection. The highlight uses a separate non-interactive overlay so keyboard focus and DOM identity remain stable. Nearby parallel wires are picked by geometric distance to the actual segments. An existing wire also acts as a target for a pending input connection, resolving to its original sending node and output index. Dragging from a wire starts at that same source; clicking without dragging keeps wire selection. Preview, width validation, commit, cancellation, and undo reuse the pin-connection flow. This creates an ordinary source-to-input wire, with no junction nodes, branch geometry, or save-format changes. A preview uses the complete route when snapped to a destination. Dragging a connected receiving pin reuses that preview with the original source fixed. The original wire is hidden, and its flow is suppressed, until drop. The graph and memory remain intact during the gesture; a valid drop replaces the wire through the usual connection operation as one undoable edit. Cancellation restores the original drawing without simulation or persistence changes. Tidy circuit and worked examples share `src/ui/circuit-layout.mjs`. It groups strongly connected components, layers their acyclic dependencies, then uses neighbour ordering to reduce crossings. There is no arbitrary depth cap. The layout is deterministic, fits the save-coordinate bounds, and preserves all non-position data. Undo/redo entries distinguish geometry edits so they preserve current inputs, signals, and clocked memory. `tests/wires.mjs` compares varied routes with an independent small-grid breadth-first search.

`FlowLayer` creates at most three small dots per visible on-wire. Cumulative segment lengths become transform keyframes with linear timing, run by the browser's Web Animations API. A stationary circuit has no JavaScript frame loop. The layer cancels dots for zero, unknown, disconnected, conflicting, or offscreen routes, and pauses for reduced motion or a hidden workbench. Camera changes transform the marker layer along with the diagram. The dotted board background is a viewport-sized CSS texture, avoiding the old large SVG background rectangle. Zooming may still require vector rasterization by the browser.

Selection uses sets of node IDs and stable wire endpoint keys. A desktop marquee checks block footprints and actual orthogonal wire segments, coalesced into the board frame scheduler. Modifier-click toggles membership, modifier-marquee adds items, and Ctrl/Command+A selects the workbench. Group movement translates all selected blocks by the same offset and snaps them together on release. Batch deletion filters nodes, incident/selected wires, and input values in one undo entry; journey terminals stay protected. Space/middle-drag and touch dragging pan without changing selection. `tests/editor.mjs` exercises layout and selection geometry; `tests/editor-browser.mjs` extends the main browser suite with actual group gestures.

`tests/performance.mjs` profiles individual/group dragging, marquee selection, panning, zooming, and wiring on representative circuits, including main-thread time and unwanted routing/simulation work. `tests/rendering.mjs` observes actual paint events and signal-dot positions, with pause and offscreen checks. A 60 Hz animation callback alone is not evidence of 60 smoothly presented frames.

The UI has a left symbol tray, a right instruction card, and a distinct Free play mode button and color scheme. The chapter path is hidden by default; the journey drawer opens on demand and has a saved option to keep the chapter strip visible. One Hide task / Show task button folds the instructions away while keeping Check and experiment navigation accessible. Input names are centered horizontally over their value boxes and vertically in the gap above them; output names stay above their values. Fit uses the rendered node bounds to include the complete drawing. Gate names and pin labels use larger type. Free play remembers the last journey lesson independently of the active workspace. Active-high and active-low switches always display their internal contacts; there is no visibility toggle or preference.

Tasks show the goal, target component name from the C++ catalog, expectations, and optional hints. Playing instructions live in the handbook, which opens on first launch at How to play and can be reopened without resetting work. The existing welcome storage flag is retained, so returning players are not interrupted again. Early experiments highlight useful pins and the Check button without an instruction overlay. The header handbook button and ? reopen the book; no redundant task-panel link remains. Only `check` completes an experiment. Page turns animate the outgoing and incoming leaves with native transform animations. They run only during a turn, cancel when the book closes, and are skipped for reduced motion.

Lesson reset restores the starter circuit and zeroes inputs; free-play clearing empties the board. Both use the existing undo mechanism, including restoration of input values. Import/export continue using the version 2 circuit format. The editor checks renderer-facing graph shape, known parts, matching pin widths, unique receivers, and coordinate bounds before accepting a file or save. The C++ engine independently validates every submitted circuit. Malformed imports leave the current board intact; damaged saves fall back to a starter. New parts reuse available IDs so imported maximum-ID circuits remain editable.

## PPA teaching stars

Eight challenge lessons now expose `designScore` with independent Power, Performance,
and Area stars. These names introduce real PPA goals through simplified estimates;
they are not a physical chip assessment. Correctness alone completes a lesson. The UI accumulates each
star across successful player circuits; worked examples award none. Old
NAND-only awards remain in saved data but do not automatically become PPA stars.

Area recursively expands combinational components to two-input NAND equivalents,
stopping at NAND (so NOT costs one). All placed gates count, including unused
ones. Performance uses output depth, which counts the longest expanded NAND path. Power counts changes
in settled internal NAND-equivalent gate outputs for every directed pair of truth-table
rows differing in exactly one input bit. The UI divides the total by
`switchingTransitions` to show the average gate outputs switching per input change,
and compares with the reference circuit. Every transition and output has equal weight. This is activity, not watts:
no glitches, load capacitance, voltage, leakage or physical timing are modeled.
Unsupported primitive/sequential designs can still pass but earn no PPA stars.
The current scope is the eight small combinational challenges; other lessons
retain ordinary completion without artificial PPA targets. For every current PPA lesson, a tested construction meets all three targets
simultaneously. Keep this regression check when changing targets or scoring so
three-star completion remains achievable with one circuit. References also verify
achievable power targets.
No minimum or Pareto-optimality claim is made.
