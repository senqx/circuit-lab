#include "signal/engine.h"

#include <algorithm>
#include <cassert>
#include <initializer_list>
#include <stdexcept>
#include <utility>

namespace circuit {
namespace {
struct Endpoint {
  int node;
  int port = 0;
};

class CircuitBuilder {
public:
  explicit CircuitBuilder(const Component& spec);
  Endpoint input(int index) const;
  std::vector<Endpoint> add(Kind kind, const std::vector<Endpoint>& inputs, int outputCount = 1);
  Endpoint gate(Kind kind, const std::vector<Endpoint>& inputs = {});
  void connect(Endpoint from, Endpoint to);
  void output(int index, Endpoint source);
  Circuit takeCircuit();

private:
  Circuit m_circuit;
  int m_nextId = 100;
};

CircuitBuilder::CircuitBuilder(const Component& spec) {
  for (int i = 0; i < static_cast<int>(spec.inputs.size()); ++i) {
    m_circuit.nodes.push_back(Node{i + 1, Kind::Input, spec.inputs[i].width});
  }

  for (int i = 0; i < static_cast<int>(spec.outputs.size()); ++i) {
    m_circuit.nodes.push_back(Node{i + 50, Kind::Output, spec.outputs[i].width});
  }
}

Endpoint CircuitBuilder::input(int index) const {
  return Endpoint{index + 1, 0};
}

std::vector<Endpoint> CircuitBuilder::add(Kind kind, const std::vector<Endpoint>& inputs, int outputCount) {
  const int id = m_nextId++;
  m_circuit.nodes.push_back(Node{id, kind});
  for (int i = 0; i < static_cast<int>(inputs.size()); ++i) {
    connect(inputs[i], Endpoint{id, i});
  }

  std::vector<Endpoint> outputs;
  for (int i = 0; i < outputCount; ++i) {
    outputs.push_back(Endpoint{id, i});
  }

  return outputs;
}

Endpoint CircuitBuilder::gate(Kind kind, const std::vector<Endpoint>& inputs) {
  return add(kind, inputs)[0];
}

void CircuitBuilder::connect(Endpoint from, Endpoint to) {
  m_circuit.wires.push_back(Wire{from.node, from.port, to.node, to.port});
}

void CircuitBuilder::output(int index, Endpoint source) {
  connect(source, Endpoint{index + 50, 0});
}

Circuit CircuitBuilder::takeCircuit() {
  return std::move(m_circuit);
}

Component part(
    Kind kind,
    const char* p_key,
    const char* p_name,
    const char* p_description,
    const char* p_symbol,
    std::initializer_list<Port> inputs,
    std::initializer_list<Port> outputs = {{"Q", 1}})
{
  return Component{kind, p_key, p_name, p_description, p_symbol, inputs, outputs, {}};
}

Circuit recipe(const Component& spec) {
  CircuitBuilder builder(spec);
  const Endpoint a = builder.input(0);
  const Endpoint b = builder.input(1);
  Endpoint c = builder.input(2);
  switch (spec.kind) {
  case Kind::Switch: {
    const Endpoint power = builder.gate(Kind::High);
    builder.output(0, builder.gate(Kind::PullDown, {builder.gate(Kind::Nmos, {a, power})}));
    break;
  }
  case Kind::Relay:
    builder.output(0, a);
    break;
  case Kind::Beacon:
    builder.output(0, builder.gate(Kind::High));
    break;
  case Kind::Gate:
  case Kind::ClosedGate:
    builder.output(
        0, builder.gate(Kind::PullDown, {builder.gate(spec.kind == Kind::Gate ? Kind::Nmos : Kind::Pmos, {b, a})}));
    break;
  case Kind::Not:
    builder.output(0, builder.gate(Kind::Nand, {a, a}));
    break;
  case Kind::Nand: {
    const Endpoint high = builder.gate(Kind::High), low = builder.gate(Kind::Low);
    const Endpoint up
        = builder.gate(Kind::Join, {builder.gate(Kind::Pmos, {a, high}), builder.gate(Kind::Pmos, {b, high})});
    const Endpoint down = builder.gate(Kind::Nmos, {a, builder.gate(Kind::Nmos, {b, low})});
    builder.output(0, builder.gate(Kind::Join, {up, down}));
    break;
  }
  case Kind::And:
    builder.output(0, builder.gate(Kind::Not, {builder.gate(Kind::Nand, {a, b})}));
    break;
  case Kind::Or:
    builder.output(0, builder.gate(Kind::Nand, {builder.gate(Kind::Not, {a}), builder.gate(Kind::Not, {b})}));
    break;
  case Kind::Xor: {
    const Endpoint sharedNand = builder.gate(Kind::Nand, {a, b});
    builder.output(
        0,
        builder.gate(
            Kind::Nand, {builder.gate(Kind::Nand, {a, sharedNand}), builder.gate(Kind::Nand, {b, sharedNand})}));
    break;
  }
  case Kind::Mux:
    builder.output(
        0,
        builder.gate(
            Kind::Or, {builder.gate(Kind::And, {a, builder.gate(Kind::Not, {c})}), builder.gate(Kind::And, {b, c})}));
    break;
  case Kind::Demux:
    builder.output(0, builder.gate(Kind::And, {a, builder.gate(Kind::Not, {b})}));
    builder.output(1, builder.gate(Kind::And, {a, b}));
    break;
  case Kind::HalfAdder:
    builder.output(0, builder.gate(Kind::Xor, {a, b}));
    builder.output(1, builder.gate(Kind::And, {a, b}));
    break;
  case Kind::FullAdder: {
    const std::vector<Endpoint> firstHalf = builder.add(Kind::HalfAdder, {a, b}, 2),
                                secondHalf = builder.add(Kind::HalfAdder, {firstHalf[0], c}, 2);
    builder.output(0, secondHalf[0]);
    builder.output(1, builder.gate(Kind::Or, {firstHalf[1], secondHalf[1]}));
    break;
  }
  case Kind::Not4:
  case Kind::And4:
  case Kind::Mux4: {
    const std::vector<Endpoint> aBits = builder.add(Kind::Split4, {a}, 4);
    std::vector<Endpoint> bBits, bits;
    if (spec.kind != Kind::Not4) {
      bBits = builder.add(Kind::Split4, {b}, 4);
    }

    for (int i = 0; i < 4; ++i) {
      if (spec.kind == Kind::Not4) {
        bits.push_back(builder.gate(Kind::Not, {aBits[i]}));
      }

      if (spec.kind == Kind::And4) {
        bits.push_back(builder.gate(Kind::And, {aBits[i], bBits[i]}));
      }

      if (spec.kind == Kind::Mux4) {
        bits.push_back(builder.gate(Kind::Mux, {aBits[i], bBits[i], c}));
      }
    }

    builder.output(0, builder.gate(Kind::Pack4, bits));
    break;
  }
  case Kind::Add4: {
    const std::vector<Endpoint> aBits = builder.add(Kind::Split4, {a}, 4), bBits = builder.add(Kind::Split4, {b}, 4);
    std::vector<Endpoint> sum;
    for (int i = 0; i < 4; ++i) {
      const std::vector<Endpoint> sumAndCarry = builder.add(Kind::FullAdder, {aBits[i], bBits[i], c}, 2);
      sum.push_back(sumAndCarry[0]);
      c = sumAndCarry[1];
    }

    builder.output(0, builder.gate(Kind::Pack4, sum));
    builder.output(1, c);
    break;
  }
  case Kind::Zero4: {
    const std::vector<Endpoint> aBits = builder.add(Kind::Split4, {a}, 4);
    const Endpoint any = builder.gate(
        Kind::Or, {builder.gate(Kind::Or, {aBits[0], aBits[1]}), builder.gate(Kind::Or, {aBits[2], aBits[3]})});
    builder.output(0, builder.gate(Kind::Not, {any}));
    break;
  }
  case Kind::Alu4: {
    const std::vector<Endpoint> sum = builder.add(Kind::Add4, {a, b, builder.gate(Kind::Low)}, 2);
    const Endpoint result = builder.gate(Kind::Mux4, {sum[0], builder.gate(Kind::And4, {a, b}), c});
    builder.output(0, result);
    builder.output(1, builder.gate(Kind::Zero4, {result}));
    break;
  }
  case Kind::Bit:
    builder.output(0, builder.gate(Kind::Dff, {a}));
    break;
  case Kind::Register4: {
    const std::vector<Endpoint> aBits = builder.add(Kind::Split4, {a}, 4);
    std::vector<Endpoint> bits;
    for (int i = 0; i < 4; ++i) {
      const Endpoint q = builder.gate(Kind::Bit); // Feedback crosses a clocked boundary.
      builder.connect(builder.gate(Kind::Mux, {q, aBits[i], b}), {q.node, 0});
      bits.push_back(q);
    }

    builder.output(0, builder.gate(Kind::Pack4, bits));
    break;
  }
  case Kind::Counter4: {
    const Endpoint low = builder.gate(Kind::Low), high = builder.gate(Kind::High);
    const Endpoint one = builder.gate(Kind::Pack4, {high, low, low, low}),
                   zero = builder.gate(Kind::Pack4, {low, low, low, low});
    const Endpoint q = builder.gate(Kind::Register4);
    const std::vector<Endpoint> sum = builder.add(Kind::Add4, {q, one, low}, 2);
    builder.connect(builder.gate(Kind::Mux4, {sum[0], zero, b}), {q.node, 0});
    builder.connect(builder.gate(Kind::Or, {a, b}), {q.node, 1});
    builder.output(0, q);
    break;
  }
  case Kind::Decoder2: {
    const Endpoint na = builder.gate(Kind::Not, {a}), nz = builder.gate(Kind::Not, {b});
    builder.output(0, builder.gate(Kind::And, {na, nz}));
    builder.output(1, builder.gate(Kind::And, {a, nz}));
    builder.output(2, builder.gate(Kind::And, {na, b}));
    builder.output(3, builder.gate(Kind::And, {a, b}));
    break;
  }
  case Kind::Ram2: {
    const std::vector<Endpoint> select = builder.add(Kind::Demux, {c, b}, 2);
    const Endpoint firstWord = builder.gate(Kind::Register4, {a, select[0]}),
                   secondWord = builder.gate(Kind::Register4, {a, select[1]});
    builder.output(0, builder.gate(Kind::Mux4, {firstWord, secondWord, b}));
    break;
  }
  case Kind::Cpu4: {
    // I, OP0, OP1, EN, RESET. 00 LOAD, 01 ADD, 10 AND, 11 JUMP.
    const Endpoint enable = builder.input(3), reset = builder.input(4), low = builder.gate(Kind::Low),
                   high = builder.gate(Kind::High);
    const Endpoint zero = builder.gate(Kind::Pack4, {low, low, low, low}),
                   one = builder.gate(Kind::Pack4, {high, low, low, low});
    const Endpoint accumulator = builder.gate(Kind::Register4), programCounter = builder.gate(Kind::Register4);
    const std::vector<Endpoint> operation = builder.add(Kind::Decoder2, {b, c}, 4);
    const std::vector<Endpoint> alu = builder.add(Kind::Alu4, {accumulator, a, c}, 2);
    const Endpoint data = builder.gate(Kind::Mux4, {alu[0], a, operation[0]});
    builder.connect(builder.gate(Kind::Mux4, {data, zero, reset}), {accumulator.node, 0});
    builder.connect(
        builder.gate(Kind::Or, {reset, builder.gate(Kind::And, {enable, builder.gate(Kind::Not, {operation[3]})})}),
        {accumulator.node, 1});
    const std::vector<Endpoint> increment = builder.add(Kind::Add4, {programCounter, one, low}, 2);
    const Endpoint jump = builder.gate(Kind::Mux4, {increment[0], a, operation[3]});
    builder.connect(builder.gate(Kind::Mux4, {jump, zero, reset}), {programCounter.node, 0});
    builder.connect(builder.gate(Kind::Or, {reset, enable}), {programCounter.node, 1});
    builder.output(0, accumulator);
    builder.output(1, programCounter);
    break;
  }
  default:
    break;
  }

  return builder.takeCircuit();
}
} // namespace

const std::vector<Component>& components() {
  static const std::vector<Component> all = [] {
    std::vector<Component> definitions = {
        part(Kind::Input, "INPUT", "Input", "An external signal.", "IN", {}, {{"Q", 1}}),
        part(Kind::Output, "OUTPUT", "Output", "The result of your circuit.", "OUT", {{"D", 1}}, {{"Q", 1}}),
        part(Kind::Low, "LOW", "Constant 0", "Always sends 0. Nothing to change or switch.", "0", {}),
        part(
            Kind::High,
            "HIGH",
            "Power · always 1",
            "Always sends 1. Unlike a signal you can flip, this value never changes.",
            "1",
            {}),
        part(
            Kind::Nmos,
            "NMOS",
            "nMOS transistor",
            "Gate 1 connects source to drain. Gate 0 disconnects it (Z). This is a directional digital switch model.",
            "nMOS",
            {{"G", 1}, {"S", 1}},
            {{"D", 1}}),
        part(
            Kind::Pmos,
            "PMOS",
            "pMOS transistor",
            "Gate 0 connects source to drain. Gate 1 disconnects it (Z). The partner of nMOS.",
            "pMOS",
            {{"G", 1}, {"S", 1}},
            {{"D", 1}}),
        part(
            Kind::Join,
            "JOIN",
            "Junction",
            "Joins two drivers. Z yields to a driven value. Opposing 0 and 1 drivers cause a conflict (!).",
            "JOIN",
            {{"A", 1}, {"B", 1}}),
        part(
            Kind::PullDown,
            "PULLDOWN",
            "Pull-down resistor",
            "Digital pull-down model: an undriven (Z) input becomes 0. A driven value passes through; an unknown (?) "
            "stays unknown.",
            "R ↓",
            {{"D", 1}}),
        part(
            Kind::Dff,
            "DFF",
            "D flip-flop",
            "A clocked memory cell: captures D on each clock step and holds Q between steps. Starts at 0; all cells "
            "capture simultaneously.",
            "DFF",
            {{"D", 1}}),
        part(
            Kind::Split4,
            "SPLIT4",
            "Split bus",
            "Unpacks a four-bit number. b0 is the least significant bit (worth 1).",
            "SPLIT",
            {{"D", 4}},
            {{"b0", 1}, {"b1", 1}, {"b2", 1}, {"b3", 1}}),
        part(
            Kind::Pack4,
            "PACK4",
            "Join bus",
            "Packs b0, b1, b2, b3 into a four-bit number. Their values are 1, 2, 4, 8.",
            "BUS",
            {{"b0", 1}, {"b1", 1}, {"b2", 1}, {"b3", 1}},
            {{"Q", 4}}),
        part(
            Kind::Switch, "SWITCH", "Logic buffer", "Copies input A to output Q without inversion.", "BUF", {{"A", 1}}),
        part(Kind::Not, "NOT", "NOT gate", "Flips a bit. 0 becomes 1; 1 becomes 0.", "NOT", {{"A", 1}}),
        part(
            Kind::Nand,
            "NAND",
            "NAND gate",
            "Outputs 0 only when both inputs are 1. You can build every logic gate with this.",
            "NAND",
            {{"A", 1}, {"B", 1}}),
        part(Kind::And, "AND", "AND gate", "Outputs 1 only when both inputs are 1.", "AND", {{"A", 1}, {"B", 1}}),
        part(Kind::Or, "OR", "OR gate", "Outputs 1 when at least one input is 1.", "OR", {{"A", 1}, {"B", 1}}),
        part(Kind::Xor, "XOR", "XOR gate", "Outputs 1 when the two inputs are different.", "XOR", {{"A", 1}, {"B", 1}}),
        part(
            Kind::Mux,
            "MUX",
            "Multiplexer",
            "A 2-to-1 data selector: S=0 chooses A; S=1 chooses B.",
            "MUX",
            {{"A", 1}, {"B", 1}, {"S", 1}}),
        part(
            Kind::Demux,
            "DEMUX",
            "Demultiplexer",
            "A 1-to-2 data distributor: S=0 sends D to A; S=1 sends D to B. The unselected output is 0.",
            "DEMUX",
            {{"D", 1}, {"S", 1}},
            {{"A", 1}, {"B", 1}}),
        part(
            Kind::HalfAdder,
            "HALF",
            "Half adder",
            "Adds two bits. S is the sum bit and C is the carry.",
            "½ ADD",
            {{"A", 1}, {"B", 1}},
            {{"S", 1}, {"C", 1}}),
        part(
            Kind::FullAdder,
            "FULL",
            "Full adder",
            "Adds A + B + carry-in. C is the carry-out.",
            "ADD",
            {{"A", 1}, {"B", 1}, {"Cin", 1}},
            {{"S", 1}, {"C", 1}}),
        part(Kind::Not4, "NOT4", "4-bit NOT", "Flips each of the four bits.", "NOT₄", {{"A", 4}}, {{"Q", 4}}),
        part(
            Kind::And4,
            "AND4",
            "4-bit AND",
            "Applies AND to each matching pair of bits.",
            "AND₄",
            {{"A", 4}, {"B", 4}},
            {{"Q", 4}}),
        part(
            Kind::Add4,
            "ADD4",
            "4-bit adder",
            "Adds unsigned A + B + Cin. S is the low four bits; C is the carry-out. Carry-out is not the "
            "signed-overflow flag.",
            "ADD₄",
            {{"A", 4}, {"B", 4}, {"Cin", 1}},
            {{"S", 4}, {"C", 1}}),
        part(
            Kind::Zero4,
            "ZERO4",
            "Zero detector",
            "Outputs 1 exactly when all four input bits are 0.",
            "= 0",
            {{"A", 4}}),
        part(
            Kind::Mux4,
            "MUX4",
            "4-bit multiplexer",
            "Selects an entire bus: A if S=0, B if S=1.",
            "MUX₄",
            {{"A", 4}, {"B", 4}, {"S", 1}},
            {{"Q", 4}}),
        part(
            Kind::Alu4,
            "ALU4",
            "Arithmetic logic unit",
            "M=0 adds A+B (modulo 16). M=1 computes bitwise AND. Z says whether Q is zero.",
            "ALU₄",
            {{"A", 4}, {"B", 4}, {"M", 1}},
            {{"Q", 4}, {"Z", 1}}),
        part(
            Kind::Bit,
            "BIT",
            "1-bit memory",
            "Captures D on a clock step and holds it between steps.",
            "BIT",
            {{"D", 1}}),
        part(
            Kind::Register4,
            "REG4",
            "4-bit register",
            "On a step, stores D if Load=1; otherwise holds Q.",
            "REG₄",
            {{"D", 4}, {"Load", 1}},
            {{"Q", 4}}),
        part(
            Kind::Counter4,
            "COUNT4",
            "4-bit counter",
            "On a clock step, Reset clears Q; otherwise En=1 increments it and En=0 holds it. Wraps from 15 to 0.",
            "CNT₄",
            {{"En", 1}, {"Reset", 1}},
            {{"Q", 4}}),
        part(
            Kind::Decoder2,
            "DECODE2",
            "2-to-4 decoder",
            "Turns a two-bit address (b0 + 2×b1) into one active selection line.",
            "DEC",
            {{"b0", 1}, {"b1", 1}},
            {{"Q0", 1}, {"Q1", 1}, {"Q2", 1}, {"Q3", 1}}),
        part(
            Kind::Ram2,
            "RAM2",
            "2-word RAM",
            "Two four-bit words. Reads Addr immediately; writes D to Addr on a step when Write=1.",
            "RAM",
            {{"D", 4}, {"Addr", 1}, {"Write", 1}},
            {{"Q", 4}}),
        part(
            Kind::Cpu4,
            "CPU4",
            "Tiny processor",
            "00 LOAD I, 01 ADD I, 10 AND I, 11 JUMP I (OP1 OP0). En runs one instruction per step. Reset clears A and "
            "PC, even if En=0.",
            "CPU",
            {{"I", 4}, {"OP0", 1}, {"OP1", 1}, {"En", 1}, {"Reset", 1}},
            {{"A", 4}, {"PC", 4}}),
        part(
            Kind::Relay,
            "RELAY",
            "Signal link",
            "Carries a 0 or 1 from one place to another.",
            "LINK",
            {{"Signal", 1}},
            {{"Light", 1}}),
        part(Kind::Beacon, "BEACON", "Always on", "Keeps a light on with a constant 1.", "ON", {}, {{"Light", 1}}),
        part(
            Kind::Gate,
            "GATE",
            "Controlled switch",
            "Active-high enable: EN=1 closes the contact and passes D, including 0. EN=0 opens it and Q=0. An unwired "
            "EN shows ? and defaults to 0; a wired unknown stays unknown.",
            "SWITCH",
            {{"D", 1}, {"EN", 1}},
            {{"Q", 1}}),
        part(
            Kind::ClosedGate,
            "CLOSED_GATE",
            "Active-low switch",
            "EN=0 closes the contact and passes D, including 0. EN=1 opens it and Q=0. An unwired EN shows ? and "
            "defaults to 0; a wired unknown stays unknown.",
            "EN LOW",
            {{"D", 1}, {"EN", 1}},
            {{"Q", 1}}),
    };
    for (Component& r_spec : definitions) {
      if (static_cast<int>(r_spec.kind) >= static_cast<int>(Kind::Switch)) {
        r_spec.definition = recipe(r_spec);
      }
    }

    return definitions;
  }();
  return all;
}

const Component& component(Kind kind) {
  const int index = static_cast<int>(kind);
  if (index < 0 || index >= static_cast<int>(components().size())) {
    throw std::runtime_error("Unknown component type.");
  }

  return components()[index];
}

Kind kindFromKey(const std::string& key) {
  for (const Component& spec : components()) {
    if (spec.key == key) {
      return spec.kind;
    }
  }

  throw std::runtime_error("Unknown component: " + key);
}

Circuit blank(Kind kind) {
  return CircuitBuilder(component(kind)).takeCircuit();
}

Circuit reference(int id) {
  return level(id).solution;
}

bool isSequential(Kind kind) {
  if (kind == Kind::Dff) {
    return true;
  }

  for (const Node node : component(kind).definition.nodes) {
    if (isSequential(node.kind)) {
      return true;
    }
  }

  return false;
}

const std::vector<Chapter>& chapters() {
  static const std::vector<Chapter> all = {
      {"Signals", "Send a message, light a bulb, and control a signal path."},
      {"Rules", "Build NAND first, then use it to make every other logic rule."},
      {"Numbers", "See how 0 and 1 make numbers, then build an adder."},
      {"Calculator", "Choose between arithmetic and logic in one small machine."},
      {"Memory", "Keep a bit, store a number, and count clock steps."},
      {"Computer", "Address memory and put your building blocks into a processor."},
  };
  return all;
}

const std::vector<Level>& levels() {
  static const std::vector<Level> all = [] {
    std::vector<Level> lessons;
    const auto add = [&](
        int chapter,
        Kind target,
        const char* p_title,
        const char* p_subtitle,
        const char* p_story,
        const char* p_goal,
        const char* p_explanation,
        const std::vector<std::string>& hints,
        bool sequential = false,
        const Circuit& solution = {})
    {
      Level lesson;
      lesson.id = static_cast<int>(lessons.size()) + 1;
      lesson.chapter = chapter;
      lesson.title = p_title;
      lesson.subtitle = p_subtitle;
      lesson.story = p_story;
      lesson.goal = p_goal;
      lesson.explanation = p_explanation;
      lesson.hints = hints;
      lesson.target = target;
      lesson.sequential = sequential;
      lesson.solution = solution.nodes.empty() ? component(target).definition : solution;
      for (const Node node : lesson.solution.nodes) {
        if (node.kind != Kind::Input && node.kind != Kind::Output
            && std::find(lesson.allowed.begin(), lesson.allowed.end(), node.kind) == lesson.allowed.end()) {
          lesson.allowed.push_back(node.kind);
        }
      }

      lessons.push_back(std::move(lesson));
    };
    add(0,
        Kind::Relay,
        "Send your first signal",
        "One connection. Your first discovery.",
        "Imagine sending a tiny message to a friend. Here, your message is either 0 (off) or 1 (on). A wire carries "
        "that message to a light.",
        "Make the bulb turn on when Signal is 1, and turn off when Signal is 0.",
        "Signal is your switch: you choose 0 or 1. Light is the output: it shows what arrived. Gold wires flow when "
        "they carry 1. Blue wires carry 0 and stay still.",
        {
            "Signal's right-hand circle sends a signal. The bulb's circle underneath receives it.",
            "Click Signal's right-hand circle, then Light's bottom circle. Or drag between them.",
            "Click the number inside Signal. At 1 the bulb glows; at 0 it turns off. Press Check circuit to try both "
            "possibilities.",
        });
    lessons.back().scene = "signal";
    lessons.back().steps = {
        "Click Signal's right dot, then Light's bottom dot to draw a wire.",
        "Click Signal's number. Try both 0 and 1 and watch the bulb.",
        "Press Check circuit below your task to finish the experiment.",
    };
    add(0,
        Kind::Beacon,
        "A light that stays on",
        "Some messages never change.",
        "A lighthouse needs a light that stays on. Your switchable signal can change, but the Power block always sends "
        "1.",
        "Connect Power to Light to keep the light on all the time.",
        "The input is a logical variable you can change. Power is a constant logic 1: its value stays the same.",
        {
            "Find the Power block marked 1. It is already on the board.",
            "It has one sending dot on its right. The light has one receiving dot at its base.",
            "Connect those dots. Power always sends 1, so the light stays on.",
        });
    lessons.back().scene = "power";
    lessons.back().steps = {
        "Click Power's right dot, then Light's bottom dot.",
        "Press Check circuit below your task. The bulb should stay on.",
    };
    CircuitBuilder railway(component(Kind::Gate));
    railway.output(0, railway.gate(Kind::Gate, {railway.input(0), railway.input(1)}));
    add(0,
        Kind::Gate,
        "The controlled switch",
        "An enable controls the data path.",
        "Think of a railway crossing: opening the route does not create a train. D is the data being sent, and EN "
        "decides whether the circuit passes it.",
        "EN=1 passes D to Q, whether D is 0 or 1. EN=0 forces Q to 0. The contact follows EN; the bulb shows Q.",
        "A closed contact is a connected path, so EN=1 with D=0 still closes the contact and leaves the bulb off. An "
        "unwired EN is marked ? and defaults to 0 in these teaching switches. A connected but unknown EN remains "
        "unknown.",
        {
            "D means data: connect the D input to the switch's upper dot. EN means enable: connect it to the lower "
            "dot.",
            "Connect the switch's Q dot to the output bulb Q.",
            "Try D=1, EN=0. Now enable the path with EN=1. Finally, keep EN=1 and set D=0: the contact stays closed "
            "and passes 0.",
        },
        false,
        railway.takeCircuit());
    lessons.back().scene = "rail";
    lessons.back().steps = {
        "Wire D to D, EN to EN, and the switch's Q to the bulb Q.",
        "Set D to 1. Flip EN and watch the bridge and the bulb.",
        "Press Check circuit below your task to test all four possibilities.",
    };
    add(1,
        Kind::Not,
        "The opposite day machine",
        "One NAND. Two connected inputs.",
        "NAND is your universal building block. Start by giving both its inputs the same signal. What happens when "
        "that signal changes?",
        "Make Q show the opposite of A: 0 becomes 1, and 1 becomes 0.",
        "Tying a NAND's two inputs together turns it into NOT. At A=0, NAND sees 00 and outputs 1. At A=1, it sees 11 "
        "and outputs 0.",
        {
            "Add one NAND gate.",
            "Connect A to both NAND input dots. One output can feed several inputs.",
            "Connect NAND's Q to the bulb Q. Try both values of A.",
        });
    add(1,
        Kind::And,
        "Both together",
        "Turn NAND's answer around.",
        "NAND switches off when both inputs are on. Flip its output to make a rule that switches on only when both are "
        "on.",
        "Q should be 1 only when A and B are both 1.",
        "AND is NAND followed by NOT. You can also use two NAND gates: connect both inputs of the second to the first "
        "gate's output.",
        {
            "Start with a NAND and a NOT gate, or use two NAND gates.",
            "Send A and B to the first NAND.",
            "Invert that NAND's result, then connect it to Q. If using a second NAND, wire both its inputs to the "
            "first NAND's output.",
        });
    CircuitBuilder nand(component(Kind::Nand));
    const Endpoint both = nand.gate(Kind::Gate, {nand.input(0), nand.input(1)});
    nand.output(0, nand.gate(Kind::ClosedGate, {nand.gate(Kind::High), both}));
    add(1,
        Kind::Nand,
        "The universal gate",
        "Your first logic gate: NAND.",
        "An active-high switch connects its path at EN=1. An active-low switch connects at EN=0. Combine these two "
        "kinds of controlled switch to build NAND.",
        "Q must be 1 for 00, 01, and 10. Only A=1 and B=1 should make Q=0.",
        "The controlled switch produces 1 only when A and B are 1. Use that signal to control an active-low switch "
        "carrying a constant 1. Together they make NAND. Every logic gate you build next can be made from NANDs.",
        {
            "Add Power, a controlled switch, and an active-low switch. Watch the bridges inside them.",
            "Connect A to the controlled switch's D and B to its EN. Connect that switch's Q to the active-low "
            "switch's EN.",
            "Power goes to the active-low switch's D. Its Q goes to the bulb. Only when A=B=1 does it block the 1.",
        },
        false,
        nand.takeCircuit());
    lessons.back().steps = {
        "Add Power, one controlled switch, and one active-low switch.",
        "Use A and B to control the first path. Its result enables the active-low path carrying Power.",
        "Match the expected truth table, then press Check circuit.",
    };
    add(1,
        Kind::Or,
        "Either way",
        "Give your circuit a choice.",
        "A doorbell can ring from the front door OR the back door. One pressed button is enough.",
        "Q should be 1 when A, B, or both are 1.",
        "De Morgan's law: A OR B equals NOT ((NOT A) AND (NOT B)). NAND already does that final NOT.",
        {
            "You have NOT and NAND. Think about when OR should output 0.",
            "Invert each input before it reaches NAND.",
            "A → NOT → NAND.A; B → NOT → NAND.B; NAND → Q.",
        });
    add(1,
        Kind::Xor,
        "Spot the difference",
        "Same is off. Different is on.",
        "XOR notices a difference. It powers addition, error detection, and plenty of clever puzzles.",
        "Q should be 1 exactly when A and B differ: 01 and 10 produce 1; 00 and 11 produce 0. Any equivalent "
        "construction passes.",
        "XOR equals (NOT A AND B) OR (A AND NOT B). That construction is valid. Sharing an intermediate result also "
        "gives a compact four-NAND implementation for the optional challenge.",
        {
            "Start with T = NAND(A, B). You will reuse T twice.",
            "Make U = NAND(A, T) and V = NAND(B, T).",
            "The final answer is NAND(U, V). Four gates, one clever pattern.",
        });
    add(1,
        Kind::Mux,
        "Choose your signal",
        "A railway switch for bits.",
        "Two signals arrive, but only one can leave. A selector bit decides which one gets through.",
        "When S=0, output A. When S=1, output B.",
        "A multiplexer chooses data. Its rule is (A AND NOT S) OR (B AND S). S is a control signal.",
        {
            "Gate A with the opposite of S.",
            "Gate B with S itself.",
            "OR those two results together. Only one data path is selected at a time.",
        });
    add(1,
        Kind::Demux,
        "Send it somewhere",
        "One signal, two destinations.",
        "Now reverse the idea: route one incoming signal toward one of two places.",
        "S=0 sends D to A; S=1 sends D to B. The unselected output stays 0.",
        "A demultiplexer routes data. Later it will decide which memory location gets written.",
        {"One construction uses two AND gates and one NOT.", "A is D AND NOT S.", "B is D AND S."});
    add(2,
        Kind::HalfAdder,
        "One plus one",
        "When two bits need a second digit.",
        "In binary, 1 + 1 = 10. The right digit is the sum; the left digit is a carry into the next column.",
        "Add A and B. Output the sum bit S and carry bit C.",
        "XOR gives the sum without carry. AND detects when both inputs are 1, producing the carry.",
        {
            "Try writing 0+0, 0+1, 1+0, and 1+1 in binary.",
            "The sum column looks like XOR; the carry column looks like AND.",
            "Send both inputs to both gates. XOR → S; AND → C.",
        });
    add(2,
        Kind::FullAdder,
        "Pass it on",
        "Make room for the carry.",
        "When adding a column of digits, you also need the carry from the previous column. Combine two half adders to "
        "handle three bits.",
        "Add A + B + Cin. Output the sum S and carry C.",
        "A full adder is two half adders with their carry outputs combined using OR.",
        {
            "First add A and B with a half adder.",
            "Feed its sum and Cin into a second half adder.",
            "The second sum is S. OR the two carry outputs to get C.",
        });
    add(2,
        Kind::Not4,
        "A handful of bits",
        "Think in numbers, four bits at a time.",
        "Four bits can describe the numbers 0 through 15. A bus keeps those four wires together so bigger circuits "
        "stay readable.",
        "Flip every bit of A. For example, 0011 (3) becomes 1100 (12).",
        "Split unpacks a bus; Join bus packs it again. b0 is worth 1, b1 is worth 2, b2 is worth 4, and b3 is worth 8.",
        {
            "Split A into its four bits.",
            "Pass each bit through its own NOT gate.",
            "Pack the results back in the same order and connect the bus to Q.",
        });
    lessons.back().exampleInputs = {{0}, {1}, {3}, {5}, {10}, {15}};
    add(2,
        Kind::And4,
        "Four lanes of logic",
        "The same idea, side by side.",
        "Bitwise operations do one simple task across an entire number. This is how computers mask and filter bits.",
        "AND each matching pair of bits in A and B. Example: 1010 AND 1100 = 1000.",
        "Parallel circuits work on separate bits at the same time. Bus widths must match: a four-bit port needs a "
        "four-bit wire.",
        {
            "Split both A and B.",
            "Use four AND gates, pairing b0 with b0, b1 with b1, and so on.",
            "Pack the four results into Q.",
        });
    lessons.back().exampleInputs = {{0, 15}, {15, 15}, {10, 12}, {5, 10}, {7, 3}, {15, 9}};
    add(2,
        Kind::Add4,
        "The ripple effect",
        "Your first real calculator.",
        "Line up four full adders and let each carry ripple into its neighbor. Now your circuit can add whole numbers.",
        "Compute unsigned A + B + Cin. S is the low four bits; carry-out C is 1 when the sum is 16 or more.",
        "Binary addition moves from least significant to most significant bit. The carry is the only connection "
        "between neighboring columns.",
        {
            "Split A and B into bits and start at b0.",
            "Connect Cin to the first full adder. Chain each carry-out to the next carry-in.",
            "Pack the four sum bits. The fourth adder's carry becomes C.",
        });
    lessons.back().exampleInputs = {{0, 0, 0}, {3, 4, 0}, {3, 4, 1}, {15, 1, 0}, {15, 0, 1}, {15, 15, 1}};
    add(3,
        Kind::Zero4,
        "Nothing to see here",
        "Sometimes zero is the answer.",
        "A processor needs to know when a result is zero. This tiny detector will help it make decisions.",
        "Output 1 only when A is 0000.",
        "If any bit is 1, the number is nonzero. OR the bits together, then invert the result.",
        {
            "Split A and combine its bits with OR gates.",
            "Pair the low two bits, pair the high two bits, then OR the pairs.",
            "Pass the final OR through NOT.",
        });
    lessons.back().exampleInputs = {{0}, {1}, {2}, {4}, {8}, {15}};
    add(3,
        Kind::Mux4,
        "Switch the whole train",
        "Choose a four-bit word.",
        "Your single-bit selector can become a selector for an entire number. All four lanes share one decision.",
        "S=0 chooses A; S=1 chooses B. Route all four bits together.",
        "A control signal can fan out to many inputs. One select bit drives all four multiplexers.",
        {
            "Split both buses and use four selectors.",
            "Each selector receives matching A and B bits. All S inputs share the external S.",
            "Pack the four selected bits into Q.",
        });
    lessons.back().exampleInputs = {{3, 12, 0}, {3, 12, 1}, {0, 15, 0}, {0, 15, 1}, {10, 5, 0}, {10, 5, 1}};
    add(3,
        Kind::Alu4,
        "The thinking machine",
        "Arithmetic meets logic.",
        "The arithmetic logic unit is the calculator inside a processor. Give it a mode switch so it can do more than "
        "one job.",
        "M=0: Q=(A+B) modulo 16. M=1: Q=A AND B. Z=1 when Q is zero.",
        "Compute both candidate answers, then select one. Hardware often does several things in parallel and chooses "
        "the useful result.",
        {
            "Compute ADD4 and AND4 in parallel. Tie the adder's Cin to Constant 0.",
            "Use MUX4 with M to choose between sum and AND.",
            "Connect the selected result to Q and to a zero detector for Z.",
        });
    lessons.back().exampleInputs = {{3, 5, 0}, {3, 5, 1}, {10, 12, 0}, {10, 12, 1}, {15, 1, 0}, {0, 15, 1}};
    add(4,
        Kind::Bit,
        "Hold that thought",
        "Give your circuit a memory.",
        "Until now, outputs changed as soon as inputs changed. A clocked cell remembers a bit until you tell it to "
        "capture a new one.",
        "Make Q capture D on a clock step and hold its value between steps. Q starts at 0. Use the supplied D "
        "flip-flop.",
        "A D flip-flop is a clocked memory cell. The shared Step clock event makes every cell sample D just before the "
        "step, then update Q together. In this model cells start at 0; the flip-flop is a supplied primitive.",
        {
            "Place one D flip-flop (a clocked memory cell).",
            "Wire D into the cell and the cell's Q into the output.",
            "Change D: Q holds still. Press Step clock: Q captures D.",
        },
        true);
    add(4,
        Kind::Register4,
        "Keep a number",
        "Memory with an on switch.",
        "A register is a small shelf for a number. Add a Load signal so it can choose between saving new data and "
        "keeping what it has.",
        "On a clock step, Load=1 stores D. Load=0 keeps the previous Q. Start at 0.",
        "Feed the old Q back through a selector. The selector chooses old Q or new D before the next clock step. "
        "Feedback is safe when it passes through memory.",
        {
            "Split D. Each bit needs one memory cell and one selector.",
            "Connect each cell's output to its selector's A input; D's matching bit to B; Load to S.",
            "The selector feeds the cell. Pack the four cell outputs into Q.",
        },
        true);
    add(4,
        Kind::Counter4,
        "One step further",
        "A heartbeat for your computer.",
        "A binary counter stores a number and can increment, pause, or reset. Counting is also useful inside a "
        "processor to track instruction addresses.",
        "On each step: Reset=1 clears Q. Otherwise En=1 adds 1, wrapping at 16. En=0 holds Q.",
        "Reset has priority over enable. Combine a register, an adder, and a selector. The previous count feeds the "
        "next calculation.",
        {
            "Make constants 0000 and 0001 using Constant 0, Power, and Join bus.",
            "Add 1 to the register output. Reset selects 0000 instead of the sum.",
            "Register Load is En OR Reset. Connect its Q to the output.",
        },
        true);
    add(4,
        Kind::Decoder2,
        "Pick an address",
        "Turn a number into a destination.",
        "Memory uses a binary address to pick one location. A decoder turns two address bits into four individual "
        "selection lines.",
        "Exactly one output is 1: Q0 for 00, Q1 for 01, Q2 for 10, Q3 for 11 (b1 b0).",
        "Each output recognizes one unique combination of true and inverted address bits.",
        {
            "Make NOT b0 and NOT b1.",
            "Q0 = NOT b0 AND NOT b1. Q1 = b0 AND NOT b1.",
            "Q2 = NOT b0 AND b1. Q3 = b0 AND b1.",
        });
    add(5,
        Kind::Ram2,
        "A place for everything",
        "Build a tiny memory bank.",
        "One register remembers one number. A memory bank uses an address to choose among several registers. Start "
        "with two.",
        "Read the word at Addr immediately. On a step, Write=1 stores D only at Addr. Both words start at 0.",
        "A demultiplexer selects which register loads. A bus multiplexer chooses which register you read. Reading and "
        "writing use the same address.",
        {
            "Use DEMUX to route Write using Addr.",
            "Each demultiplexer output drives one REG4 Load input. Both registers receive D.",
            "Use MUX4 to read either register according to Addr.",
        },
        true);
    add(5,
        Kind::Cpu4,
        "Hello, little computer",
        "Put your ideas to work.",
        "You have switches, arithmetic, control, and memory. Now assemble an instruction-driven processor with an "
        "accumulator A and a program counter PC.",
        "On a step with En=1: 00 loads I, 01 adds I, 10 ANDs I, 11 jumps PC to I (OP1 OP0). Other instructions "
        "increment PC. Reset clears both registers and wins over En.",
        "Instructions are supplied through the inputs, like a front panel computer. LOAD, ADD, and AND change A. JUMP "
        "preserves A and changes PC. Arithmetic wraps to four bits.",
        {
            "Use two REG4 chips for A and PC. Decode OP0/OP1. Feed A and I to ALU4; OP1 selects its mode.",
            "For A, select I on LOAD, otherwise ALU output. Load A only for enabled non-JUMP instructions. Reset "
            "selects zero and forces Load.",
            "For PC, add 1 to the old PC, select I on JUMP, then select zero on Reset. Load PC when En OR Reset. See a "
            "worked circuit if you need a map.",
        },
        true);
    std::rotate(lessons.begin() + 3, lessons.begin() + 5, lessons.begin() + 6); // NAND, NOT, AND; IDs remain 6, 4, 5.
    const std::map<Kind, std::pair<int, std::string>> nandGoals = {
        {Kind::Not, {1, "Tie both inputs of one NAND to A."}},
        {Kind::And, {2, "NAND A and B, then invert the result with a second NAND whose inputs are tied together."}},
        {Kind::Or, {3, "Invert A and B with tied-input NANDs, then NAND those two results. This is De Morgan's law."}},
        {Kind::Xor, {4, "Share T=NAND(A,B). Make U=NAND(A,T) and V=NAND(B,T), then Q=NAND(U,V)."}},
        {Kind::Mux, {4, "Invert S with one NAND. Form NAND(A,NOT S) and NAND(B,S), then NAND those results."}},
        {
            Kind::Demux,
            {5, "Invert S. Form NAND(D,NOT S) and NAND(D,S), then invert each result with a tied-input NAND."},
        },
        {
            Kind::HalfAdder,
            {5, "Build the four-NAND XOR for S. Its first result T=NAND(A,B) can also make C=NAND(T,T). Share T."},
        },
        {
            Kind::FullAdder,
            {
                9,
                "Use four-NAND XOR stages for P=A XOR B and S=P XOR Cin. NAND the first intermediate result from each "
                "stage to get carry-out C.",
            },
        },
    };
    std::vector<Kind> learned;
    for (Level& r_lesson : lessons) {
      const auto goal = nandGoals.find(r_lesson.target);
      if (goal != nandGoals.end()) {
        r_lesson.nandTarget = goal->second.first;
        const std::map<Kind, int> depths = {{Kind::Not,1},{Kind::And,2},{Kind::Or,2},
            {Kind::Xor,3},{Kind::Mux,3},{Kind::Demux,3},{Kind::HalfAdder,3},{Kind::FullAdder,6}};
        r_lesson.depthTarget = depths.at(r_lesson.target);
        r_lesson.nandHint = goal->second.second;
      }

      const auto addPart = [&](Kind kind) {
        if (std::find(r_lesson.allowed.begin(), r_lesson.allowed.end(), kind) == r_lesson.allowed.end()) {
          r_lesson.allowed.push_back(kind);
        }
      };
      // The tray emphasizes the example's parts, then offers earlier logic blocks.
      for (const Kind kind : learned) {
        if (kind != r_lesson.target) {
          addPart(kind);
        }
      }

      if (r_lesson.target != Kind::Relay && r_lesson.target != Kind::Beacon && r_lesson.target != Kind::Gate) {
        learned.push_back(r_lesson.target);
      }
    }

    return lessons;
  }();
  return all;
}

const Level& level(int id) {
  for (const Level& lesson : levels()) {
    if (lesson.id == id) {
      return lesson;
    }
  }

  throw std::runtime_error("Unknown lesson.");
}

std::vector<TestRow> testVectors(int id) {
  const Level& lesson = level(id);
  std::vector<TestRow> rows;
  const auto row = [&](const std::vector<int>& inputs, const std::vector<int>& expected, bool tick = false) {
    rows.push_back(TestRow{inputs, expected, {}, tick, false});
  };
  if (!lesson.sequential) {
    const Component& spec = component(lesson.target);
    int bits = 0;
    for (const Port& port : spec.inputs) {
      bits += port.width;
    }

    for (int mask = 0; mask < (1 << bits); ++mask) {
      int shift = bits;
      std::vector<int> inputs;
      for (const Port& port : spec.inputs) {
        shift -= port.width;
        inputs.push_back((mask >> shift) & ((1 << port.width) - 1));
      }

      const int a = inputs.empty() ? 0 : inputs[0], b = inputs.size() > 1 ? inputs[1] : 0,
                c = inputs.size() > 2 ? inputs[2] : 0;
      std::vector<int> expected;
      switch (lesson.target) {
      case Kind::Switch:
      case Kind::Relay:
        expected = {a};
        break;
      case Kind::Beacon:
        expected = {1};
        break;
      case Kind::Gate:
        expected = {a & b};
        break;
      case Kind::Not:
        expected = {1 - a};
        break;
      case Kind::Nand:
        expected = {!(a && b)};
        break;
      case Kind::And:
        expected = {a & b};
        break;
      case Kind::Or:
        expected = {a | b};
        break;
      case Kind::Xor:
        expected = {a ^ b};
        break;
      case Kind::Mux:
      case Kind::Mux4:
        expected = {c ? b : a};
        break;
      case Kind::Demux:
        expected = {b ? 0 : a, b ? a : 0};
        break;
      case Kind::HalfAdder:
        expected = {(a + b) & 1, (a + b) >> 1};
        break;
      case Kind::FullAdder:
        expected = {(a + b + c) & 1, (a + b + c) >> 1};
        break;
      case Kind::Not4:
        expected = {a ^ 15};
        break;
      case Kind::And4:
        expected = {a & b};
        break;
      case Kind::Add4:
        expected = {(a + b + c) & 15, (a + b + c) >> 4};
        break;
      case Kind::Zero4:
        expected = {a == 0};
        break;
      case Kind::Alu4: {
        const int q = c ? a & b : (a + b) & 15;
        expected = {q, q == 0};
        break;
      }
      case Kind::Decoder2: {
        const int q = a + 2 * b;
        expected = {q == 0, q == 1, q == 2, q == 3};
        break;
      }
      default:
        assert(false && "Every combinational lesson needs a specification.");
        throw std::logic_error("Missing combinational specification.");
      }

      row(inputs, expected);
    }

    return rows;
  }

  int q = 0, pc = 0, memory[2] = {0, 0};
  // Deterministic stateful traces cover all data/control combinations and hold
  // behavior. Expected state is a behavioral specification, never a circuit.
  const auto step = [&](const std::vector<int>& inputs, bool tick) {
    const int a = inputs[0], b = inputs.size() > 1 ? inputs[1] : 0;
    std::vector<int> expected;
    if (lesson.target == Kind::Bit) {
      if (tick) {
        q = a;
      }

      expected = {q};
    }

    if (lesson.target == Kind::Register4) {
      if (tick && b) {
        q = a;
      }

      expected = {q};
    }

    if (lesson.target == Kind::Counter4) {
      if (tick) {
        q = b ? 0 : (q + a) & 15;
      }

      expected = {q};
    }

    if (lesson.target == Kind::Ram2) {
      if (tick && inputs[2]) {
        memory[b] = a;
      }

      expected = {memory[b]};
    }

    if (lesson.target == Kind::Cpu4) {
      if (tick) {
        if (inputs[4]) {
          q = 0;
          pc = 0;
        } else if (inputs[3]) {
          const int op = inputs[1] + 2 * inputs[2];
          if (op == 0) {
            q = a;
          }

          if (op == 1) {
            q = (q + a) & 15;
          }

          if (op == 2) {
            q &= a;
          }

          pc = op == 3 ? a : (pc + 1) & 15;
        }
      }

      expected = {q, pc};
    }

    row(inputs, expected, tick);
  };
  if (lesson.target == Kind::Bit) {
    step({1}, false);
    step({1}, true);
    step({0}, false);
    step({0}, true);
    step({1}, false);
    step({1}, true);
    for (int i = 0; i < 12; ++i) {
      step({(i / 2) % 2}, false);
      step({i % 2}, true);
    }
  }

  if (lesson.target == Kind::Register4) {
    step({7, 0}, false);
    step({7, 1}, true);
    step({3, 0}, false);
    step({3, 0}, true);
    step({3, 1}, true);
    step({12, 0}, true);
    for (int v = 0; v < 16; ++v) {
      for (int load = 0; load < 2; ++load) {
        step({v, load}, false);
        step({v, load}, true);
        step({15 - v, 0}, true);
      }
    }
  }

  if (lesson.target == Kind::Counter4) {
    for (int i = 0; i < 36; ++i) {
      step({1, 0}, false);
      step({1, 0}, true);
      step({0, 0}, true);
    }

    step({0, 1}, true);
    step({1, 0}, true);
    step({1, 1}, true);
  }

  if (lesson.target == Kind::Ram2) {
    step({5, 0, 1}, false);
    step({5, 0, 1}, true);
    step({9, 1, 1}, true);
    step({0, 0, 0}, false);
    step({7, 0, 0}, true);
    step({0, 1, 0}, false);
    for (int v = 0; v < 16; ++v) {
      for (int addr = 0; addr < 2; ++addr) {
        step({v, addr, 1}, false);
        step({v, addr, 1}, true);
        step({15 - v, 1 - addr, 0}, true);
        step({0, addr, 0}, false);
      }
    }
  }

  if (lesson.target == Kind::Cpu4) {
    step({0, 0, 0, 0, 0}, false);
    step({7, 0, 0, 1, 0}, true);
    step({3, 1, 0, 0, 0}, false);
    step({3, 1, 0, 1, 0}, true);
    step({6, 0, 1, 1, 0}, true);
    step({12, 1, 1, 1, 0}, true);
    for (int v = 0; v < 16; ++v) {
      for (int op = 0; op < 4; ++op) {
        step({v, op & 1, op >> 1, 1, 0}, false);
        step({v, op & 1, op >> 1, 1, 0}, true);
        step({15 - v, op & 1, op >> 1, 0, 0}, true);
      }
    }

    step({15, 0, 0, 0, 1}, true);
    step({7, 0, 0, 1, 0}, true);
    step({3, 1, 0, 1, 0}, true);
    step({6, 0, 1, 1, 0}, true);
    step({12, 1, 1, 1, 0}, true);
    step({4, 1, 1, 1, 1}, true);
  }

  return rows;
}
} // namespace circuit
