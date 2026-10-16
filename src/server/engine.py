"""JSON-to-C-ABI conversion. Circuit and lesson rules live in C++."""
import ctypes
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
BUILD = ROOT / "build"


def load_engine(*, build=False):
    candidates = [BUILD / "libsignal_engine.so", BUILD / "libsignal_engine.dylib", BUILD / "signal_engine.dll"]
    source_files = list((ROOT / "src" / "engine").rglob("*.cpp")) + list((ROOT / "src" / "engine").rglob("*.hpp")) + list((ROOT / "src" / "engine").rglob("*.h")) + [ROOT / "CMakeLists.txt"]
    library = next((p for p in candidates if p.exists()), None)
    if build and (library is None or any(p.stat().st_mtime > library.stat().st_mtime for p in source_files)):
        subprocess.run(["cmake", "-S", str(ROOT), "-B", str(BUILD), "-DCMAKE_BUILD_TYPE=Release"], check=True)
        subprocess.run(["cmake", "--build", str(BUILD), "--parallel", "4"], check=True)
        library = next(p for p in candidates if p.exists())
    if library is None:
        raise RuntimeError("Build the C++ engine first: cmake -S . -B build && cmake --build build")
    lib = ctypes.CDLL(str(library))
    signatures = {
        "circuit_catalog": (ctypes.c_char_p, []),
        "circuit_reference": (ctypes.c_char_p, [ctypes.c_int]),
        "circuit_create": (ctypes.c_void_p, []),
        "circuit_destroy": (None, [ctypes.c_void_p]),
        "circuit_node": (ctypes.c_int, [ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]),
        "circuit_wire": (ctypes.c_int, [ctypes.c_void_p] + [ctypes.c_int] * 4),
        "circuit_state": (ctypes.c_int, [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]),
        "circuit_simulate": (ctypes.c_char_p, [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.c_int, ctypes.c_int]),
        "circuit_check": (ctypes.c_char_p, [ctypes.c_void_p, ctypes.c_int]),
    }
    for name, (result, args) in signatures.items():
        fn = getattr(lib, name)
        fn.restype, fn.argtypes = result, args
    return lib


def integer(value):
    if type(value) is not int or not -(2**31) <= value < 2**31:
        raise ValueError("Expected a 32-bit integer.")
    return value


def text(value, limit):
    if not isinstance(value, str) or not value or len(value) > limit or '\0' in value:
        raise ValueError("Invalid text argument.")
    return value.encode("utf-8")


def execute(lib, route, data):
    graph = data["circuit"]
    if not isinstance(graph["nodes"], list) or not isinstance(graph["wires"], list):
        raise ValueError("Expected lists of parts and wires.")
    if len(graph["nodes"]) > 512 or len(graph["wires"]) > 4096:
        raise ValueError("Circuit exceeds the editor's size limit.")
    handle = lib.circuit_create()
    if not handle:
        raise ValueError("Could not create a circuit.")
    try:
        for n in graph["nodes"]:
            if not lib.circuit_node(handle, integer(n["id"]), text(n["kind"], 32), integer(n.get("width", 1))):
                raise ValueError("Invalid part in circuit.")
        for w in graph["wires"]:
            if not lib.circuit_wire(handle, *(integer(w[k]) for k in ("from", "output", "to", "input"))):
                raise ValueError("Invalid wire in circuit.")
        if route == "/api/check":
            return lib.circuit_check(handle, integer(data["level"]))
        state = data.get("state", {})
        if not isinstance(state, dict) or len(state) > 32768:
            raise ValueError("Invalid memory state.")
        for key, value in state.items():
            if not lib.circuit_state(handle, text(key, 256), integer(value)):
                raise ValueError("Invalid memory state.")
        values = data.get("inputs", [])
        if not isinstance(values, list) or len(values) > 32:
            raise ValueError("Expected at most 32 input values.")
        tick = data.get("tick", False)
        if type(tick) is not bool:
            raise ValueError("Clock tick must be true or false.")
        inputs = (ctypes.c_int * len(values))(*(integer(v) for v in values))
        return lib.circuit_simulate(handle, inputs, len(values), tick)
    finally:
        lib.circuit_destroy(handle)
