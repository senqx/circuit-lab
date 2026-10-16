"""Compare the actual native and WebAssembly builds through their public APIs."""
import json
import copy
import shutil
import subprocess
import unittest

from src.server.engine import ROOT, execute, load_engine


class WebAssemblyTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node") and (ROOT / "dist/app/engine/generated/engine.wasm").is_file(), "Build the web app and install Node.js to run cross-build parity checks")
    def test_native_parity(self):
        lib = load_engine()
        catalog = json.loads(lib.circuit_catalog())
        lessons = []
        for level in catalog["levels"]:
            circuit = json.loads(lib.circuit_reference(level["id"]))
            result = json.loads(execute(lib, "/api/check", {"circuit": circuit, "level": level["id"]}))
            self.assertTrue(result["passed"], level["title"])
            memory, simulations = {}, []
            for row in level["tests"]:
                data = {"circuit": circuit, "inputs": row["inputs"], "tick": row["tick"], "state": memory}
                actual = json.loads(execute(lib, "/api/simulate", data))
                self.assertEqual(actual["outputs"], row["expected"])
                simulations.append(actual)
                memory = actual["state"]
            lessons.append({"id": level["id"], "circuit": circuit, "check": result, "simulations": simulations})
        cases = []
        def compare(method, data):
            expected = json.loads(execute(lib, "/api/" + method, data))
            self.assertFalse(expected.get("error"), expected)
            cases.append({"method": method, "data": copy.deepcopy(data), "expected": expected})

        for kind in ("GATE", "CLOSED_GATE"):
            circuit = {"nodes": [{"id": 1, "kind": "INPUT"}, {"id": 50, "kind": "OUTPUT"}, {"id": 100, "kind": kind}],
                       "wires": [{"from": 1, "output": 0, "to": 100, "input": 0}, {"from": 100, "output": 0, "to": 50, "input": 0}]}
            for data in (0, 1):
                compare("simulate", {"circuit": circuit, "inputs": [data]})
            circuit["nodes"].append({"id": 101, "kind": "NOT"})
            circuit["wires"].append({"from": 101, "output": 0, "to": 100, "input": 1})
            compare("simulate", {"circuit": circuit, "inputs": [1]})
        for spare in (None, "NAND", "NOT"):
            circuit = json.loads(lib.circuit_reference(8))
            if spare:
                circuit["nodes"].append({"id": 200, "kind": spare})
            compare("check", {"circuit": circuit, "level": 8})
        run = subprocess.run(["node", "tests/wasm.mjs"], cwd=ROOT, input=json.dumps({"catalog": catalog, "lessons": lessons, "cases": cases}), text=True, capture_output=True, timeout=180)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        print(run.stdout.strip())


if __name__ == "__main__":
    unittest.main()
