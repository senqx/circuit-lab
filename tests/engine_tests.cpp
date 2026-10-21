#include "signal/bridge.h"
#include "signal/engine.h"

#include <algorithm>
#include <csignal>
#include <cstddef>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

namespace {
using namespace circuit;
int assertions = 0;

void expect(bool condition, const std::string& message) {
  ++assertions;
  if (!condition) {
    throw std::runtime_error(message);
  }
}

Circuit chip(Kind kind) {
  Circuit circuit = blank(kind);
  circuit.nodes.push_back({100, kind});
  const Component& spec = component(kind);
  for (int i = 0; i < static_cast<int>(spec.inputs.size()); ++i) {
    circuit.wires.push_back({i + 1, 0, 100, i});
  }

  for (int i = 0; i < static_cast<int>(spec.outputs.size()); ++i) {
    circuit.wires.push_back({100, i, i + 50, 0});
  }

  return circuit;
}

// Hand-built challenge circuits, independent of the catalog's example recipes.
Circuit nandCircuit(Kind kind, const std::vector<std::pair<int, int>>& gates, const std::vector<int>& outputs) {
  Circuit circuit = blank(kind);
  for (int i = 0; i < static_cast<int>(gates.size()); ++i) {
    circuit.nodes.push_back({100 + i, Kind::Nand});
    circuit.wires.push_back({gates[i].first, 0, 100 + i, 0});
    circuit.wires.push_back({gates[i].second, 0, 100 + i, 1});
  }

  for (int i = 0; i < static_cast<int>(outputs.size()); ++i) {
    circuit.wires.push_back({outputs[i], 0, 50 + i, 0});
  }

  return circuit;
}

void testLessons() {
  for (const Level& lesson : levels()) {
    const Check result = check(reference(lesson.id), lesson.id);
    expect(result.passed, "Reference lesson " + std::to_string(lesson.id) + ": " + result.error);
    expect(result.correct == result.total && result.total > 0, "Every lesson checks at least one case");
    expect(
        result.rows.size() == static_cast<std::size_t>(result.total),
        "Checking preserves every expected and actual row for the UI");
    const std::vector<TestRow> vectors = testVectors(lesson.id);
    for (const std::vector<int>& input : lesson.exampleInputs) {
      expect(
          std::any_of(
              vectors.begin(),
              vectors.end(),
              [&](const TestRow& row) {
                return row.inputs == input;
              }),
          "Teaching examples belong to the public specification");
    }

    std::cout << "Lesson " << lesson.id << " " << lesson.title << ": " << result.correct << " / " << result.total
              << "\n";
  }

  expect(
      levels()[3].target == Kind::Nand && levels()[4].target == Kind::Not && levels()[5].target == Kind::And,
      "NAND is the first gate in the journey, before NOT and AND");
  expect(
      level(4).target == Kind::Not && level(5).target == Kind::And && level(6).target == Kind::Nand,
      "Existing lesson IDs stay stable after reordering");
}

void testNandChallenges() {
  Circuit andNands = blank(Kind::And);
  andNands.nodes.push_back({100, Kind::Nand});
  andNands.nodes.push_back({101, Kind::Nand});
  andNands.wires = {{1, 0, 100, 0}, {2, 0, 100, 1}, {100, 0, 101, 0}, {100, 0, 101, 1}, {101, 0, 50, 0}};
  expect(check(andNands, 5).passed, "AND made from two NANDs passes every row");
  const Check ppaAnd = check(andNands, 5);
  expect(ppaAnd.design.area == 2 && ppaAnd.design.depth == 2
      && ppaAnd.design.areaStar && ppaAnd.design.depthStar && ppaAnd.design.powerStar,
      "Two NAND AND meets all three independent PPA teaching targets");
  expect(ppaAnd.design.switchingTransitions == 8 && ppaAnd.design.switching == 8,
      "Two-input AND averages one switching gate output across eight single-input changes");
  Circuit extraSwitching = andNands;
  extraSwitching.nodes.push_back({102, Kind::Not});
  extraSwitching.wires.push_back({1, 0, 102, 0});
  const Check extraPower = check(extraSwitching, 5);
  expect(extraPower.passed && extraPower.design.switching == 12
      && !extraPower.design.powerStar,
      "Unused active gates consume estimated power even though the answer remains correct");
  Circuit mixedAnd = andNands;
  mixedAnd.nodes.back().kind = Kind::Not;
  mixedAnd.wires.erase(mixedAnd.wires.begin() + 3);
  const Check mixedAndScore = check(mixedAnd,5);
  expect(mixedAndScore.passed && mixedAndScore.design.area == 2
      && mixedAndScore.design.areaStar && mixedAndScore.design.depthStar,
      "NOT plus NAND counts as two NAND equivalents");
  andNands.nodes.push_back({102, Kind::Not});
  expect(check(andNands, 5).passed, "An unused unwired spare does not fail a correct circuit");
  Circuit legacyNand = blank(Kind::Nand);
  legacyNand.nodes.push_back({100, Kind::And});
  legacyNand.nodes.push_back({101, Kind::Not});
  legacyNand.wires = {{1, 0, 100, 0}, {2, 0, 100, 1}, {100, 0, 101, 0}, {101, 0, 50, 0}};
  expect(check(legacyNand, 6).passed, "Previously saved AND-plus-NOT NAND circuits still pass");
  const std::map<Kind, Circuit> goals = {
      {Kind::Not, nandCircuit(Kind::Not, {{1, 1}}, {100})},
      {Kind::And, nandCircuit(Kind::And, {{1, 2}, {100, 100}}, {101})},
      {Kind::Or, nandCircuit(Kind::Or, {{1, 1}, {2, 2}, {100, 101}}, {102})},
      {Kind::Xor, nandCircuit(Kind::Xor, {{1, 2}, {1, 100}, {2, 100}, {101, 102}}, {103})},
      {Kind::Mux, nandCircuit(Kind::Mux, {{3, 3}, {1, 100}, {2, 3}, {101, 102}}, {103})},
      {Kind::Demux, nandCircuit(Kind::Demux, {{2, 2}, {1, 100}, {1, 2}, {101, 101}, {102, 102}}, {103, 104})},
      {
          Kind::HalfAdder,
          nandCircuit(Kind::HalfAdder, {{1, 2}, {1, 100}, {2, 100}, {101, 102}, {100, 100}}, {103, 104}),
      },
      {
          Kind::FullAdder,
          nandCircuit(
              Kind::FullAdder,
              {{1, 2}, {1, 100}, {2, 100}, {101, 102}, {103, 3}, {103, 104}, {3, 104}, {105, 106}, {100, 104}},
              {107, 108}),
      },
  };
  int challenges = 0;
  for (const Level& lesson : levels()) {
    if (lesson.nandTarget) {
      const Check result = check(goals.at(lesson.target), lesson.id);
      expect(
          result.passed && result.nand.eligible && result.nand.achieved,
          "NAND benchmark is achievable: " + lesson.title);
      expect(
          result.nand.used == lesson.nandTarget && result.nand.otherParts == 0,
          "NAND benchmark counts visible gates: " + lesson.title);
      expect(
          std::find(lesson.allowed.begin(), lesson.allowed.end(), Kind::Nand) != lesson.allowed.end(),
          "Every NAND challenge supplies NAND gates");
      expect(result.design.supported && result.design.areaStar && result.design.depthStar && result.design.powerStar,
          "One construction meets all three PPA targets: " + lesson.title);
      const Check referenceScore = check(reference(lesson.id),lesson.id);
      expect(referenceScore.design.supported && referenceScore.design.powerStar,
          "Reference construction demonstrates an achievable power target: " + lesson.title);
      ++challenges;
    }
  }

  expect(
      challenges == static_cast<int>(goals.size()),
      "All optional NAND benchmarks have an independently tested construction");
  Circuit mixedXor = blank(Kind::Xor);
  mixedXor.nodes.insert(
      mixedXor.nodes.end(), {{100, Kind::Not}, {101, Kind::Not}, {102, Kind::And}, {103, Kind::And}, {104, Kind::Or}});
  mixedXor.wires = {
      {1, 0, 100, 0},
      {2, 0, 101, 0},
      {100, 0, 102, 0},
      {2, 0, 102, 1},
      {1, 0, 103, 0},
      {101, 0, 103, 1},
      {102, 0, 104, 0},
      {103, 0, 104, 1},
      {104, 0, 50, 0},
  };
  const Check mixed = check(mixedXor, 8);
  expect(
      mixed.passed && !mixed.nand.eligible && !mixed.nand.achieved && mixed.nand.otherParts == 5,
      "Sum-of-products XOR passes correctness without earning the NAND challenge");
  Circuit spare = goals.at(Kind::Xor);
  spare.nodes.push_back({200, Kind::Nand});
  Check spareResult = check(spare, 8);
  expect(
      spareResult.passed && spareResult.nand.eligible && !spareResult.nand.achieved && spareResult.nand.used == 5,
      "Unused NANDs count toward the optional target");
  spare = goals.at(Kind::Xor);
  spare.nodes.push_back({200, Kind::Not});
  spareResult = check(spare, 8);
  expect(
      spareResult.passed && !spareResult.nand.eligible && spareResult.nand.otherParts == 1,
      "A spare non-NAND affects only the optional challenge");
  const Check tooSmall = check(nandCircuit(Kind::Xor, {{1, 2}}, {100}), 8);
  expect(
      !tooSmall.passed && !tooSmall.nand.eligible && !tooSmall.nand.achieved,
      "A small but incorrect circuit cannot earn a challenge");
  for (const Kind kind : {Kind::Not, Kind::And, Kind::Or, Kind::Xor}) {
    const Circuit& definition = component(kind).definition;
    expect(
        std::any_of(
            definition.nodes.begin(),
            definition.nodes.end(),
            [](Node n) {
              return n.kind == Kind::Nand;
            }),
        "Logic definitions build on NAND");
  }
}

void testSwitches() {
  const Circuit nmos = chip(Kind::Nmos);
  const Circuit pmos = chip(Kind::Pmos);
  const Circuit junction = chip(Kind::Join);
  expect(simulate(nmos, {0, 1}).outputs == std::vector<int>{floating}, "nMOS off is Z");
  expect(simulate(nmos, {1, 0}).outputs == std::vector<int>{0}, "nMOS conducts low");
  expect(simulate(pmos, {0, 1}).outputs == std::vector<int>{1}, "pMOS conducts high");
  expect(simulate(pmos, {1, 0}).outputs == std::vector<int>{floating}, "pMOS off is Z");
  for (const Kind kind : {Kind::Gate, Kind::ClosedGate}) {
    for (const int data : {0, 1}) {
      for (const int enable : {0, 1}) {
        const Result result = simulate(chip(kind), {data, enable});
        const int closed = kind == Kind::Gate ? enable : 1 - enable;
        expect(
            result.contacts.at(100) == closed && result.outputs == std::vector<int>{closed ? data : 0},
            "Switch contact follows EN while its output follows the selected data");
      }
    }

    Circuit noControl = chip(kind);
    noControl.wires.erase(noControl.wires.begin() + 1);
    for (const int data : {0, 1}) {
      const Result result = simulate(noControl, {data, 1});
      const int closed = kind == Kind::ClosedGate;
      expect(
          result.contacts.at(100) == closed && result.outputs == std::vector<int>{closed ? data : 0},
          "Unwired EN defaults to zero independently of disconnected external input");
    }

    noControl.nodes.push_back({101, Kind::Not});
    noControl.wires.push_back({101, 0, 100, 1});
    const Result connectedUnknown = simulate(noControl, {1, 0});
    expect(
        connectedUnknown.contacts.at(100) == unknown && connectedUnknown.outputs == std::vector<int>{unknown},
        "A wired unknown EN stays unknown");
    Circuit noData = chip(kind);
    noData.wires.erase(noData.wires.begin());
    expect(
        simulate(noData, {0, kind == Kind::Gate ? 1 : 0}).outputs == std::vector<int>{unknown},
        "Closed contact does not invent missing data");
  }

  for (const Kind kind : {Kind::Nmos, Kind::Pmos}) {
    Circuit noGate = chip(kind);
    noGate.wires.erase(noGate.wires.begin());
    const Result result = simulate(noGate, {0, 1});
    expect(
        result.contacts.at(100) == unknown && result.outputs == std::vector<int>{unknown},
        "Primitive transistor gate has no implicit default");
  }

  expect(simulate(junction, {0, 1}).outputs == std::vector<int>{conflict}, "Opposing drivers conflict");
}

void testCircuitValidation() {
  Circuit broken = reference(5);
  broken.wires.pop_back();
  expect(!check(broken, 5).passed, "Missing output fails");
  Circuit duplicate = reference(5);
  duplicate.wires.push_back(duplicate.wires[0]);
  expect(!simulate(duplicate, {0, 0}).error.empty(), "Multiple drivers rejected");
  Circuit wrong = reference(5);
  wrong.nodes[0].width = 4;
  expect(!simulate(wrong, {0, 0}).error.empty(), "Bus mismatch rejected");
  wrong = reference(5);
  wrong.nodes.push_back(wrong.nodes[0]);
  expect(!simulate(wrong, {0, 0}).error.empty(), "Duplicate IDs rejected");
  wrong = reference(5);
  wrong.wires[0].output = 8;
  expect(!simulate(wrong, {0, 0}).error.empty(), "Invalid output port rejected");
  wrong = reference(5);
  wrong.wires[0].input = -1;
  expect(!simulate(wrong, {0, 0}).error.empty(), "Negative input port rejected");
  wrong = reference(5);
  wrong.wires[0].from = 999;
  expect(!simulate(wrong, {0, 0}).error.empty(), "Missing part rejected");
  const Circuit cheat = chip(Kind::And);
  expect(!check(cheat, 5).passed, "Target chip cannot solve its own lesson");
  Circuit cycle = blank(Kind::Not);
  cycle.nodes.push_back({100, Kind::Not});
  cycle.wires = {{100, 0, 100, 0}, {100, 0, 50, 0}};
  expect(!simulate(cycle, {0}).error.empty(), "Combinational cycle rejected");
}

void testMemory() {
  Circuit chain = blank(Kind::Bit);
  chain.nodes.push_back({100, Kind::Dff});
  chain.nodes.push_back({101, Kind::Dff});
  chain.wires = {{1, 0, 100, 0}, {100, 0, 101, 0}, {101, 0, 50, 0}};
  const Result first = simulate(chain, {1}, {}, true);
  expect(first.outputs == std::vector<int>{0}, "Clock captures simultaneously");
  expect(simulate(chain, {0}, first.state, true).outputs == std::vector<int>{1}, "Second clock moves prior bit");
  expect(simulate(chain, {0}, first.state, false).outputs == std::vector<int>{0}, "No tick preserves state");
  Circuit reordered = chain;
  std::swap(reordered.nodes[2], reordered.nodes[3]);
  expect(
      simulate(reordered, {0}, first.state, true).outputs == std::vector<int>{1}, "State keys survive node reordering");
  State badState = first.state;
  badState["100"] = 12;
  expect(!simulate(chain, {0}, badState).error.empty(), "Invalid memory state rejected");
  Circuit feedback = blank(Kind::Bit);
  feedback.nodes.push_back({100, Kind::Dff});
  feedback.nodes.push_back({101, Kind::Not});
  feedback.wires = {{100, 0, 101, 0}, {101, 0, 100, 0}, {100, 0, 50, 0}};
  const Result f1 = simulate(feedback, {0}, {}, true);
  expect(f1.error.empty() && f1.outputs == std::vector<int>{1}, "Clocked feedback is legal");
  expect(simulate(feedback, {0}, f1.state, true).outputs == std::vector<int>{0}, "Clocked feedback toggles");
}

void testLimits() {
  Circuit incomplete = chip(Kind::Nmos);
  incomplete.wires.pop_back();
  expect(simulate(incomplete, {1, 1}).outputs == std::vector<int>{unknown}, "Unconnected is distinct from floating");
  Circuit wrongTerminal = reference(1);
  wrongTerminal.nodes[0].id = 8;
  expect(!check(wrongTerminal, 1).passed, "Lesson interface cannot be renamed");
  Circuit tooLarge;
  for (int i = 1; i <= 513; ++i) {
    tooLarge.nodes.push_back({i, Kind::High});
  }

  expect(!simulate(tooLarge, {}).error.empty(), "Graph size limit is enforced");
  Circuit manyChips = blank(Kind::Bit);
  for (int i = 100; i < 150; ++i) {
    manyChips.nodes.push_back({i, Kind::Cpu4});
  }

  expect(!simulate(manyChips, {0}).error.empty(), "Expanded primitive limit is enforced");
  expect(!simulate(chip(Kind::Nmos), {2, 0}).error.empty(), "Invalid input value rejected");
  expect(!simulate(chip(Kind::Nmos), {0}).error.empty(), "Invalid input count rejected");
  Circuit circuit = reference(8);
  const Result result = simulate(circuit, {1, 0});
  expect(result.outputs == std::vector<int>{1}, "XOR 1,0");
  circuit.wires.back().from = 1;
  expect(!check(circuit, 8).passed, "Behaviorally wrong but valid circuit fails");
}

void testCAbi() {
  expect(
      std::string(circuit_reference(-1)).find("error") != std::string::npos,
      "C ABI contains invalid level exception");
  expect(
      std::string(circuit_check(nullptr, 1)).find("error") != std::string::npos,
      "C ABI contains null handle exception");
  const std::unique_ptr<void, decltype(&circuit_destroy)> handle(circuit_create(), circuit_destroy);
  expect(handle != nullptr, "C ABI creates a handle");
  expect(circuit_node(handle.get(), 1, "BOGUS", 1) == 0, "C ABI rejects unknown component");
  expect(
      std::string(circuit_check(handle.get(), 1)).find("Unknown component") != std::string::npos,
      "C ABI retains builder error");
}
} // namespace

int main() {
  try {
    testLessons();
    testNandChallenges();
    testSwitches();
    testCircuitValidation();
    testMemory();
    testLimits();
    testCAbi();

    std::cout << "Passed " << assertions << " assertions.\n";
  } catch (const std::exception& error) {
    std::cerr << "FAIL: " << error.what() << "\n";
    return 1;
  }
}
