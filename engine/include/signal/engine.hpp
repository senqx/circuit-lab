#pragma once

#include <map>
#include <string>
#include <vector>

namespace signal_garden {

// Nonnegative values are unsigned buses. Negative values never coerce to bits.
constexpr int unknown = -1, floating = -2, conflict = -3;
enum class Kind {
    Input, Output, Low, High, Nmos, Pmos, Join, PullDown, Dff, Split4, Pack4,
    Switch, Not, Nand, And, Or, Xor, Mux, Demux, HalfAdder, FullAdder,
    Not4, And4, Add4, Zero4, Mux4, Alu4, Bit, Register4, Counter4, Decoder2,
    Ram2, Cpu4, Relay, Beacon, Gate, ClosedGate
};
struct Port { std::string name; int width = 1; };
struct Chapter { std::string name, goal; };
struct Node { int id; Kind kind; int width = 1; };
struct Wire { int from, output, to, input; };
struct Circuit { std::vector<Node> nodes; std::vector<Wire> wires; };
struct Component {
    Kind kind;
    std::string key, name, description, symbol;
    std::vector<Port> inputs, outputs;
    Circuit definition; // Empty only for physical primitives and bus adapters.
};
struct Level {
    int id, chapter;
    std::string title, subtitle, story, goal, explanation;
    std::vector<std::string> hints;
    Kind target;
    std::vector<Kind> allowed;
    bool sequential = false;
    Circuit solution;
    std::string scene;
    std::vector<std::string> steps;
    std::vector<std::vector<int>> example_inputs; // Teaching examples drawn from the full specification.
};
using State = std::map<std::string, int>;
struct Result {
    std::vector<int> outputs;
    std::map<int, std::vector<int>> signals;
    // Contact state for visible blocks containing exactly one transistor.
    // 1 = closed, 0 = open, unknown = its control has no known value.
    std::map<int, int> contacts;
    State state;
    std::string error;
    int primitives = 0;
};
struct TestRow {
    std::vector<int> inputs, expected, actual;
    bool tick = false, passed = false;
};
struct Check {
    bool passed = false;
    int total = 0, correct = 0;
    std::string error;
    std::vector<TestRow> rows; // Full specification in order, with actual outputs.
};

const std::vector<Component>& components();
const std::vector<Chapter>& chapters();
const Component& component(Kind kind);
Kind kind_from_key(const std::string& key);
bool is_sequential(Kind kind);
const std::vector<Level>& levels();
const Level& level(int id);
Circuit blank(Kind kind);
// Reference designs are ordinary circuits, also used to implement reusable chips.
Circuit reference(int level_id);
Result simulate(const Circuit&, const std::vector<int>& inputs, const State& = {}, bool tick = false);
Check check(const Circuit&, int level_id);
// The public specification is independent of the implementation circuit.
std::vector<TestRow> test_vectors(int level_id);

} // namespace signal_garden
