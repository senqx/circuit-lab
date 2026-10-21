#pragma once

#include <map>
#include <string>
#include <vector>

namespace circuit {

/*! Nonnegative values are unsigned buses. Negative values never coerce to bits. */
constexpr int unknown = -1;
constexpr int floating = -2;
constexpr int conflict = -3;

/*! Shared bounds for graph validation and the C adapter. */
namespace limits {
constexpr int maxNodes = 512;
constexpr int maxWires = 4096;
constexpr int maxPrimitives = 32768;
constexpr int maxDepth = 32;
constexpr int maxNodeId = 1000000;
constexpr int maxInputs = 32;
constexpr int maxStateKeyLength = 256;
} // namespace limits

enum class Kind {
  Input,
  Output,
  Low,
  High,
  Nmos,
  Pmos,
  Join,
  PullDown,
  Dff,
  Split4,
  Pack4,
  Switch,
  Not,
  Nand,
  And,
  Or,
  Xor,
  Mux,
  Demux,
  HalfAdder,
  FullAdder,
  Not4,
  And4,
  Add4,
  Zero4,
  Mux4,
  Alu4,
  Bit,
  Register4,
  Counter4,
  Decoder2,
  Ram2,
  Cpu4,
  Relay,
  Beacon,
  Gate,
  ClosedGate
};

struct Port {
  std::string name;
  int width = 1;
};

struct Chapter {
  std::string name;
  std::string goal;
};

struct Node {
  int id;
  Kind kind;
  int width = 1;
};

struct Wire {
  int from;
  int output;
  int to;
  int input;
};

struct Circuit {
  std::vector<Node> nodes;
  std::vector<Wire> wires;
};

struct Component {
  Kind kind;
  std::string key;
  std::string name;
  std::string description;
  std::string symbol;
  std::vector<Port> inputs;
  std::vector<Port> outputs;
  Circuit definition; //!< Empty for primitives and bus adapters.
};

struct Level {
  int id;
  int chapter;
  std::string title;
  std::string subtitle;
  std::string story;
  std::string goal;
  std::string explanation;
  std::vector<std::string> hints;
  Kind target;
  std::vector<Kind> allowed;
  bool sequential = false;
  Circuit solution;
  std::string scene;
  std::vector<std::string> steps;
  std::vector<std::vector<int>> exampleInputs; //!< Examples drawn from the full specification.
  int depthTarget = 0;
  int nandTarget = 0;                          //!< Optional challenge; correctness still completes the lesson.
  std::string nandHint;
};

using State = std::map<std::string, int>;

struct Result {
  std::vector<int> outputs;
  std::map<int, std::vector<int>> signals;
  /*! Contact state for blocks with one transistor: 1 = closed, 0 = open,
      unknown = its control has no known value. */
  std::map<int, int> contacts;
  State state;
  std::string error;
  int primitives = 0;
};

struct TestRow {
  std::vector<int> inputs;
  std::vector<int> expected;
  std::vector<int> actual;
  bool tick = false;
  bool passed = false;
};

struct NandChallenge {
  int target = 0;
  int used = 0;
  int otherParts = 0;
  bool eligible = false;
  bool achieved = false;
};

struct DesignScore {
  int area = 0;
  int depth = 0;
  int areaTarget = 0;
  int depthTarget = 0;
  bool supported = false;
  bool areaStar = false;
  bool depthStar = false;
  int switching = 0;
  int switchingTarget = 0;
  int switchingTransitions = 0; // Divide switching totals by this for mean activity.
  bool powerStar = false;
};

struct Check {
  bool passed = false;
  int total = 0;
  int correct = 0;
  std::string error;
  std::vector<TestRow> rows; //!< Full specification in order, with actual outputs.
  NandChallenge nand;
  DesignScore design;
};

const std::vector<Component>& components();
const std::vector<Chapter>& chapters();
/*! Look up metadata; unknown kinds and keys throw std::runtime_error. */
const Component& component(Kind kind);
Kind kindFromKey(const std::string& key);
bool isSequential(Kind kind);
const std::vector<Level>& levels();
/*! Look up a stable lesson ID; unknown IDs throw std::runtime_error. */
const Level& level(int id);
/*! Create only the input and output terminals for a component. */
Circuit blank(Kind kind);
/*! Reference designs are ordinary circuits used to implement reusable chips. */
Circuit reference(int levelId);
/*! Evaluate a circuit, optionally capturing all clocked cells simultaneously.
    Validation failures are returned in Result::error. */
Result simulate(const Circuit& circuit, const std::vector<int>& inputs, const State& state = {}, bool tick = false);
/*! Check every specified row; validation failures are returned in Check::error. */
Check check(const Circuit& circuit, int levelId);
/*! The public specification is independent of the implementation circuit. */
std::vector<TestRow> testVectors(int levelId);

} // namespace circuit
