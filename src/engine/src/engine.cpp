#include "signal/engine.h"

#include <algorithm>
#include <cassert>
#include <deque>
#include <stdexcept>
#include <utility>

namespace circuit {
namespace {
struct PortRef {
  int node = -1;
  int port = 0;
};

struct FlatNode {
  Kind kind;
  int width;
  std::string key;
  std::vector<PortRef> inputs;
  std::vector<int> values;
  int contact = unknown;
  int unwired = unknown;
};

struct NodePorts {
  std::vector<PortRef> inputs;
  std::vector<PortRef> outputs;
};

class CompiledCircuit {
public:
  explicit CompiledCircuit(const Circuit& circuit);
  Result run(const std::vector<int>& inputs, const State& state, bool tick, bool details);

private:
  NodePorts expand(const Circuit& circuit, const std::string& prefix, bool top, int depth = 0);
  int value(PortRef source) const;
  void settle(const State& state);

  std::vector<FlatNode> m_nodes;
  std::map<int, NodePorts> m_visible;
  std::map<int, int> m_contactNodes;
  std::vector<int> m_inputNodes;
  std::vector<PortRef> m_outputs;
  std::vector<int> m_order;
};

bool isTerminal(Kind kind) {
  return kind == Kind::Input || kind == Kind::Output;
}

int portWidth(const Node& node, int port, bool output) {
  const Component& spec = component(node.kind);
  const std::vector<Port>& ports = output ? spec.outputs : spec.inputs;
  if (port < 0 || port >= static_cast<int>(ports.size())) {
    throw std::runtime_error("Wire refers to a port that does not exist.");
  }

  return isTerminal(node.kind) ? node.width : ports[port].width;
}

CompiledCircuit::CompiledCircuit(const Circuit& circuit) {
  expand(circuit, "", true);
  std::vector<int> degree(m_nodes.size());
  std::vector<std::vector<int>> dependents(m_nodes.size());
  for (int i = 0; i < static_cast<int>(m_nodes.size()); ++i) {
    const FlatNode& node = m_nodes[i];
    // Clocked outputs belong to the previous state, so they break feedback.
    if (node.kind == Kind::Dff) {
      continue;
    }

    for (const PortRef input : node.inputs) {
      if (input.node >= 0) {
        ++degree[i];
        dependents[input.node].push_back(i);
      }
    }
  }

  std::deque<int> ready;
  for (int i = 0; i < static_cast<int>(m_nodes.size()); ++i) {
    if (degree[i] == 0) {
      ready.push_back(i);
    }
  }

  while (!ready.empty()) {
    const int index = ready.front();
    ready.pop_front();
    m_order.push_back(index);
    for (const int next : dependents[index]) {
      if (--degree[next] == 0) {
        ready.push_back(next);
      }
    }
  }

  if (m_order.size() != m_nodes.size()) {
    throw std::runtime_error(
        "This feedback loop has no memory cell. Route feedback through a clocked cell or register.");
  }
}

NodePorts CompiledCircuit::expand(const Circuit& circuit, const std::string& prefix, bool top, int depth) {
  if (depth > limits::maxDepth || m_nodes.size() > limits::maxPrimitives) {
    throw std::runtime_error("Circuit is too large to expand.");
  }

  if (circuit.nodes.size() > limits::maxNodes || circuit.wires.size() > limits::maxWires) {
    throw std::runtime_error("Use at most 512 parts and 4096 wires.");
  }

  std::map<int, NodePorts> references;
  std::map<int, const Node*> nodes;
  for (const Node& node : circuit.nodes) {
    if (node.id < 1 || node.id > limits::maxNodeId || !nodes.emplace(node.id, &node).second) {
      throw std::runtime_error("Every part needs a unique positive ID.");
    }

    const Component& spec = component(node.kind);
    const std::string key = prefix + std::to_string(node.id);
    const int begin = static_cast<int>(m_nodes.size());
    if (!spec.definition.nodes.empty()) {
      references[node.id] = expand(spec.definition, key + ".", false, depth + 1);
      // An unwired teaching-switch EN defaults to 0; wired unknowns propagate.
      if (node.kind == Kind::Gate || node.kind == Kind::ClosedGate) {
        m_nodes.at(references[node.id].inputs.at(1).node).unwired = 0;
      }
    } else {
      const bool terminal = isTerminal(node.kind);
      if (terminal && node.width != 1 && node.width != 4) {
        throw std::runtime_error("Ports must be one or four bits wide.");
      }

      if (m_nodes.size() >= limits::maxPrimitives) {
        throw std::runtime_error("Circuit expands beyond 32768 primitives.");
      }

      // Nested input terminals are aliases driven by the parent.
      const bool alias = node.kind == Kind::Input && !top;
      const int inputCount = alias ? 1 : static_cast<int>(spec.inputs.size());
      const int index = static_cast<int>(m_nodes.size());
      m_nodes.push_back(
          FlatNode{
              alias ? Kind::Output : node.kind,
              terminal ? node.width : 1,
              key,
              std::vector<PortRef>(inputCount),
              std::vector<int>(spec.outputs.size(), unknown),
          });
      NodePorts ports;
      for (int i = 0; i < inputCount; ++i) {
        ports.inputs.push_back(PortRef{index, i});
      }

      for (int i = 0; i < static_cast<int>(spec.outputs.size()); ++i) {
        ports.outputs.push_back(PortRef{index, i});
      }

      references[node.id] = std::move(ports);
    }

    if (top) {
      int contact = -1;
      int count = 0;
      for (int i = begin; i < static_cast<int>(m_nodes.size()); ++i) {
        if (m_nodes[i].kind == Kind::Nmos || m_nodes[i].kind == Kind::Pmos) {
          contact = i;
          ++count;
        }
      }

      if (count == 1) {
        m_contactNodes[node.id] = contact;
      }
    }
  }

  for (const Wire wire : circuit.wires) {
    if (!nodes.count(wire.from) || !nodes.count(wire.to)) {
      throw std::runtime_error("Wire refers to a missing part.");
    }

    const Node& source = *nodes.at(wire.from);
    const Node& target = *nodes.at(wire.to);
    if (source.kind == Kind::Output || target.kind == Kind::Input) {
      throw std::runtime_error("Connect an output pin to an input pin.");
    }

    if (portWidth(source, wire.output, true) != portWidth(target, wire.input, false)) {
      throw std::runtime_error("Wire widths differ. Use Split bus or Join bus between bits and buses.");
    }

    const PortRef destination = references.at(wire.to).inputs.at(wire.input);
    PortRef& r_input = m_nodes.at(destination.node).inputs.at(destination.port);
    if (r_input.node != -1) {
      throw std::runtime_error("This input already has a wire. Use a Junction to join transistor drivers.");
    }

    r_input = references.at(wire.from).outputs.at(wire.output);
  }

  NodePorts result;
  // Numeric terminal IDs establish a stable public port order.
  for (const auto& [id, p_node] : nodes) {
    if (p_node->kind == Kind::Input) {
      if (top) {
        m_inputNodes.push_back(references.at(id).outputs[0].node);
      } else {
        result.inputs.push_back(references.at(id).inputs[0]);
      }
    }

    if (p_node->kind == Kind::Output) {
      result.outputs.push_back(references.at(id).outputs[0]);
    }
  }

  if (top) {
    m_visible = std::move(references);
    m_outputs = result.outputs;
  }

  return result;
}

int CompiledCircuit::value(PortRef source) const {
  return source.node < 0 ? unknown : m_nodes[source.node].values[source.port];
}

void CompiledCircuit::settle(const State& state) {
  for (const int index : m_order) {
    FlatNode& r_node = m_nodes[index];
    const auto input = [&](int port) {
      return value(r_node.inputs[port]);
    };
    int output = unknown;
    switch (r_node.kind) {
    case Kind::Input:
      continue;
    case Kind::Output:
      output = r_node.inputs[0].node < 0 ? r_node.unwired : input(0);
      break;
    case Kind::Low:
      output = 0;
      break;
    case Kind::High:
      output = 1;
      break;
    case Kind::Nmos:
    case Kind::Pmos: {
      const int gate = input(0);
      r_node.contact = gate < 0 ? unknown : static_cast<int>(gate == (r_node.kind == Kind::Nmos ? 1 : 0));
      if (gate < 0) {
        output = gate == conflict ? conflict : unknown;
      } else {
        output = r_node.contact ? input(1) : floating;
      }

      break;
    }
    case Kind::Join: {
      const int first = input(0);
      const int second = input(1);
      if (first == conflict || second == conflict) {
        output = conflict;
      } else if (first == unknown || second == unknown) {
        output = unknown;
      } else if (first == floating) {
        output = second;
      } else if (second == floating) {
        output = first;
      } else {
        output = first == second ? first : conflict;
      }

      break;
    }
    case Kind::PullDown:
      output = input(0) == floating ? 0 : input(0);
      break;
    case Kind::Dff: {
      const auto saved = state.find(r_node.key);
      output = saved == state.end() ? 0 : saved->second;
      break;
    }
    case Kind::Split4:
      for (int port = 0; port < 4; ++port) {
        r_node.values[port] = input(0) < 0 ? input(0) : (input(0) >> port) & 1;
      }

      continue;
    case Kind::Pack4:
      output = 0;
      for (int port = 0; port < 4; ++port) {
        if (input(port) < 0) {
          output = input(port);
          break;
        }

        output |= input(port) << port;
      }

      break;
    default:
      assert(false && "Only primitives may reach evaluation.");
      throw std::logic_error("Composite was not expanded.");
    }

    r_node.values[0] = output;
  }
}

Result CompiledCircuit::run(const std::vector<int>& inputs, const State& state, bool tick, bool details) {
  if (inputs.size() != m_inputNodes.size()) {
    throw std::runtime_error("Input count does not match the circuit.");
  }

  for (int i = 0; i < static_cast<int>(inputs.size()); ++i) {
    FlatNode& r_node = m_nodes[m_inputNodes[i]];
    if (inputs[i] < 0 || inputs[i] >= (1 << r_node.width)) {
      throw std::runtime_error("Input value is outside its bus width.");
    }

    r_node.values[0] = inputs[i];
  }

  State current;
  for (const FlatNode& node : m_nodes) {
    if (node.kind == Kind::Dff) {
      const auto saved = state.find(node.key);
      const int bit = saved == state.end() ? 0 : saved->second;
      if (bit < conflict || bit > 1) {
        throw std::runtime_error("Memory state is not a bit.");
      }

      current[node.key] = bit;
    }
  }

  settle(current);
  if (tick) {
    // Capture every old D before publishing any new Q.
    State next;
    for (const FlatNode& node : m_nodes) {
      if (node.kind == Kind::Dff) {
        next[node.key] = value(node.inputs[0]);
      }
    }

    current = std::move(next);
    settle(current);
  }

  Result result;
  for (const PortRef output : m_outputs) {
    result.outputs.push_back(value(output));
  }

  if (details) {
    for (const auto& [id, ports] : m_visible) {
      for (const PortRef output : ports.outputs) {
        result.signals[id].push_back(value(output));
      }
    }

    for (const auto& [id, index] : m_contactNodes) {
      result.contacts[id] = m_nodes[index].contact;
    }
  }

  result.state = std::move(current);
  result.primitives = static_cast<int>(m_nodes.size());
  return result;
}

void verifyLesson(const Circuit& circuit, const Level& lesson) {
  std::vector<Node> inputs;
  std::vector<Node> outputs;
  for (const Node node : circuit.nodes) {
    if (node.kind == Kind::Input) {
      inputs.push_back(node);
    } else if (node.kind == Kind::Output) {
      outputs.push_back(node);
    } else if (
        node.kind == lesson.target
        && std::find(lesson.allowed.begin(), lesson.allowed.end(), node.kind) == lesson.allowed.end()) {
      // Alternative recipes are valid; using the finished target itself is not.
      throw std::runtime_error(
          "Build " + component(node.kind).name + " from smaller parts instead of using the finished block.");
    }
  }

  const auto byId = [](Node first, Node second) {
    return first.id < second.id;
  };
  std::sort(inputs.begin(), inputs.end(), byId);
  std::sort(outputs.begin(), outputs.end(), byId);
  const Component& spec = component(lesson.target);
  if (inputs.size() != spec.inputs.size() || outputs.size() != spec.outputs.size()) {
    throw std::runtime_error("Keep all of the lesson's input and output terminals.");
  }

  for (int i = 0; i < static_cast<int>(inputs.size()); ++i) {
    if (inputs[i].id != i + 1 || inputs[i].width != spec.inputs[i].width) {
      throw std::runtime_error("Lesson input terminals have changed.");
    }
  }

  for (int i = 0; i < static_cast<int>(outputs.size()); ++i) {
    if (outputs[i].id != i + 50 || outputs[i].width != spec.outputs[i].width) {
      throw std::runtime_error("Lesson output terminals have changed.");
    }
  }
}
} // namespace

Result simulate(const Circuit& circuit, const std::vector<int>& inputs, const State& state, bool tick) {
  try {
    return CompiledCircuit(circuit).run(inputs, state, tick, true);
  } catch (const std::exception& error) {
    Result result;
    result.error = error.what();
    return result;
  }
}

Check check(const Circuit& circuit, int levelId) {
  Check result;
  try {
    const Level& lesson = level(levelId);
    verifyLesson(circuit, lesson);
    CompiledCircuit compiled(circuit);
    result.nand.target = lesson.nandTarget;
    if (lesson.nandTarget) {
      for (const Node node : circuit.nodes) {
        if (node.kind == Kind::Nand) {
          ++result.nand.used;
        } else if (!isTerminal(node.kind)) {
          ++result.nand.otherParts;
        }
      }
    }

    result.rows = testVectors(levelId);
    result.total = static_cast<int>(result.rows.size());
    State state;
    for (TestRow& r_row : result.rows) {
      Result actual = compiled.run(r_row.inputs, state, r_row.tick, false);
      state = std::move(actual.state);
      r_row.actual = std::move(actual.outputs);
      r_row.passed = r_row.expected == r_row.actual;
      result.correct += r_row.passed;
    }

    result.passed = result.correct == result.total;
    if (lesson.nandTarget) {
      result.nand.eligible = result.passed && result.nand.otherParts == 0;
      result.nand.achieved = result.nand.eligible && result.nand.used <= lesson.nandTarget;
    }

    if (!result.passed) {
      result.error
          = "Not quite yet. Compare the highlighted actual and expected outputs, then follow the signals back.";
    }
  } catch (const std::exception& error) {
    result.error = error.what();
  }

  return result;
}
} // namespace circuit
