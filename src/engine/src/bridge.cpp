#include "signal/bridge.h"

#include "signal/engine.h"

#include <exception>
#include <initializer_list>
#include <stdexcept>
#include <string_view>
#include <utility>

namespace {
using namespace circuit;
thread_local std::string response;

struct Handle {
  Circuit circuit;
  State state;
  std::string error;
  bool failed = false;
};

std::string quote(std::string_view text) {
  constexpr std::string_view hex = "0123456789abcdef";
  std::string result = "\"";
  for (const unsigned char character : text) {
    if (character == '"' || character == '\\') {
      result += '\\';
      result += static_cast<char>(character);
    } else if (character == '\n') {
      result += "\\n";
    } else if (character == '\r') {
      result += "\\r";
    } else if (character == '\t') {
      result += "\\t";
    } else if (character < 32) {
      result += "\\u00";
      result += hex[character >> 4];
      result += hex[character & 15];
    } else {
      result += static_cast<char>(character);
    }
  }

  return result + '"';
}

template <class T, class U>
std::string joinJson(const T& values, U encode) {
  std::string result;
  bool first = true;
  for (const auto& value : values) {
    if (!first) {
      result += ',';
    }

    first = false;
    result += encode(value);
  }

  return result;
}

template <class T, class U>
std::string arrayJson(const T& values, U encode) {
  return '[' + joinJson(values, encode) + ']';
}

std::string objectJson(std::initializer_list<std::pair<std::string_view, std::string>> fields) {
  return '{'
         + joinJson(
             fields,
             [](const auto& field) {
               return quote(field.first) + ':' + field.second;
             })
         + '}';
}

std::string keyJson(int key) {
  return quote(std::to_string(key));
}

std::string keyJson(const std::string& key) {
  return quote(key);
}

template <class T, class U>
std::string mapJson(const T& values, U encode) {
  return '{'
         + joinJson(
             values,
             [&](const auto& entry) {
               return keyJson(entry.first) + ':' + encode(entry.second);
             })
         + '}';
}

std::string integerJson(int value) {
  return std::to_string(value);
}

std::string booleanJson(bool value) {
  return value ? "true" : "false";
}

std::string integersJson(const std::vector<int>& values) {
  return arrayJson(values, integerJson);
}

std::string portsJson(const std::vector<Port>& ports) {
  return arrayJson(ports, [](const Port& port) {
    return objectJson({{"name", quote(port.name)}, {"width", integerJson(port.width)}});
  });
}

std::string circuitJson(const Circuit& circuit) {
  const std::string nodes = arrayJson(circuit.nodes, [](const Node& node) {
    return objectJson({
        {"id", integerJson(node.id)},
        {"kind", quote(component(node.kind).key)},
        {"width", integerJson(node.width)},
    });
  });
  const std::string wires = arrayJson(circuit.wires, [](const Wire wire) {
    return objectJson({
        {"from", integerJson(wire.from)},
        {"output", integerJson(wire.output)},
        {"to", integerJson(wire.to)},
        {"input", integerJson(wire.input)},
    });
  });

  return objectJson({{"nodes", nodes}, {"wires", wires}});
}

std::string rowJson(const TestRow& row) {
  return objectJson({
      {"inputs", integersJson(row.inputs)},
      {"expected", integersJson(row.expected)},
      {"actual", integersJson(row.actual)},
      {"tick", booleanJson(row.tick)},
      {"passed", booleanJson(row.passed)},
  });
}

std::string componentJson(const Component& spec) {
  std::string contact = "null";
  if (spec.kind == Kind::Gate || spec.kind == Kind::ClosedGate) {
    // Previews use the same unwired state as a real, isolated block.
    const Result idle = simulate(Circuit{{{1, spec.kind}}, {}}, {});
    if (!idle.error.empty()) {
      throw std::runtime_error(idle.error);
    }

    contact = integerJson(idle.contacts.at(1));
  }

  const bool inside = spec.kind == Kind::Nmos || spec.kind == Kind::Pmos || spec.kind == Kind::Join
                      || spec.kind == Kind::PullDown || spec.kind == Kind::Switch;
  return objectJson({
      {"key", quote(spec.key)},
      {"name", quote(spec.name)},
      {"description", quote(spec.description)},
      {"symbol", quote(spec.symbol)},
      {"inputs", portsJson(spec.inputs)},
      {"outputs", portsJson(spec.outputs)},
      {"sequential", booleanJson(isSequential(spec.kind))},
      {"inside", booleanJson(inside)},
      {"composite", booleanJson(!spec.definition.nodes.empty())},
      {"defaultContact", contact},
  });
}

std::string levelJson(const Level& lesson) {
  const std::vector<TestRow> vectors = testVectors(lesson.id);
  const std::string challenge
      = lesson.nandTarget ? objectJson({{"target", integerJson(lesson.nandTarget)}, {"hint", quote(lesson.nandHint)}, {"depthTarget", integerJson(lesson.depthTarget)}})
                          : "null";
  const std::string allowed = arrayJson(lesson.allowed, [](Kind kind) {
    return quote(component(kind).key);
  });

  return objectJson({
      {"id", integerJson(lesson.id)},
      {"chapter", integerJson(lesson.chapter)},
      {"title", quote(lesson.title)},
      {"subtitle", quote(lesson.subtitle)},
      {"story", quote(lesson.story)},
      {"goal", quote(lesson.goal)},
      {"concept", quote(lesson.explanation)},
      {"hints", arrayJson(lesson.hints, quote)},
      {"scene", quote(lesson.scene)},
      {"steps", arrayJson(lesson.steps, quote)},
      {"wireGoal", std::to_string(lesson.solution.wires.size())},
      {"target", quote(component(lesson.target).key)},
      {"allowed", allowed},
      {"sequential", booleanJson(lesson.sequential)},
      {"tests", arrayJson(vectors, rowJson)},
      {"testCount", std::to_string(vectors.size())},
      {"exampleInputs", arrayJson(lesson.exampleInputs, integersJson)},
      {"starter", circuitJson(blank(lesson.target))},
      {"nandChallenge", challenge},
  });
}

std::string challengeJson(const NandChallenge& challenge) {
  if (challenge.target == 0) {
    return "null";
  }

  return objectJson({
      {"target", integerJson(challenge.target)},
      {"used", integerJson(challenge.used)},
      {"otherParts", integerJson(challenge.otherParts)},
      {"eligible", booleanJson(challenge.eligible)},
      {"achieved", booleanJson(challenge.achieved)},
  });
}

const char* errorResponse(const char* p_message) noexcept {
  try {
    response = objectJson({{"error", quote(p_message)}});
    return response.c_str();
  } catch (...) {
    return "{\"error\":\"Engine could not allocate a response.\"}";
  }
}

template <class T>
const char* respond(T encode) {
  try {
    response = encode();
    return response.c_str();
  } catch (const std::exception& error) {
    return errorResponse(error.what());
  } catch (...) {
    return errorResponse("Engine could not complete the request.");
  }
}

Handle& getHandle(void* p_handle) {
  if (p_handle == nullptr) {
    throw std::runtime_error("Missing circuit handle.");
  }

  return *static_cast<Handle*>(p_handle);
}

const Handle& readyHandle(void* p_handle) {
  const Handle& handle = getHandle(p_handle);
  if (handle.failed) {
    throw std::runtime_error(handle.error.empty() ? "Could not build circuit." : handle.error);
  }

  return handle;
}

template <class T>
int modify(void* p_handle, T update) {
  try {
    update(getHandle(p_handle));
    return 1;
  } catch (...) {
    if (p_handle != nullptr) {
      Handle& r_handle = *static_cast<Handle*>(p_handle);
      r_handle.failed = true;
      try {
        throw;
      } catch (const std::exception& error) {
        try {
          r_handle.error = error.what();
        } catch (...) {
          // failed remains set even when storing the diagnostic cannot allocate.
        }
      } catch (...) {
        // Preserve failure across the C boundary, including nonstandard throws.
      }
    }

    return 0;
  }
}
} // namespace

extern "C" {
const char* circuit_catalog() {
  return respond([] {
    const std::string chapterList = arrayJson(chapters(), [](const Chapter& chapter) {
      return objectJson({{"name", quote(chapter.name)}, {"goal", quote(chapter.goal)}});
    });

    return objectJson({
        {"version", "2"},
        {"chapters", chapterList},
        {"components", arrayJson(components(), componentJson)},
        {"levels", arrayJson(levels(), levelJson)},
    });
  });
}

const char* circuit_reference(int levelId) {
  return respond([&] {
    return circuitJson(reference(levelId));
  });
}

void* circuit_create() {
  try {
    return new Handle;
  } catch (...) {
    return nullptr;
  }
}

void circuit_destroy(void* p_handle) {
  delete static_cast<Handle*>(p_handle);
}

int circuit_node(void* p_handle, int id, const char* p_kind, int width) {
  return modify(p_handle, [&](Handle& r_handle) {
    if (p_kind == nullptr || r_handle.circuit.nodes.size() >= limits::maxNodes) {
      throw std::runtime_error("Invalid part or too many parts.");
    }

    r_handle.circuit.nodes.push_back(Node{id, kindFromKey(p_kind), width});
  });
}

int circuit_wire(void* p_handle, int from, int output, int to, int input) {
  return modify(p_handle, [&](Handle& r_handle) {
    if (r_handle.circuit.wires.size() >= limits::maxWires) {
      throw std::runtime_error("Too many wires.");
    }

    r_handle.circuit.wires.push_back(Wire{from, output, to, input});
  });
}

int circuit_state(void* p_handle, const char* p_key, int value) {
  return modify(p_handle, [&](Handle& r_handle) {
    if (p_key == nullptr || std::string_view(p_key).size() > limits::maxStateKeyLength
        || r_handle.state.size() >= limits::maxPrimitives) {
      throw std::runtime_error("Invalid memory state.");
    }

    r_handle.state[p_key] = value;
  });
}

const char* circuit_simulate(void* p_handle, const int* p_inputs, int count, int tick) {
  return respond([&] {
    const Handle& handle = readyHandle(p_handle);
    if (count < 0 || count > limits::maxInputs || (count > 0 && p_inputs == nullptr)) {
      throw std::runtime_error("Invalid inputs.");
    }

    std::vector<int> values;
    if (count > 0) {
      values.assign(p_inputs, p_inputs + count);
    }

    const Result result = simulate(handle.circuit, values, handle.state, tick != 0);
    if (!result.error.empty()) {
      throw std::runtime_error(result.error);
    }

    return objectJson({
        {"outputs", integersJson(result.outputs)},
        {"signals", mapJson(result.signals, integersJson)},
        {"contacts", mapJson(result.contacts, integerJson)},
        {"state", mapJson(result.state, integerJson)},
        {"primitives", integerJson(result.primitives)},
    });
  });
}

const char* circuit_check(void* p_handle, int levelId) {
  return respond([&] {
    const Handle& handle = readyHandle(p_handle);
    const Check result = check(handle.circuit, levelId);

    return objectJson({
        {"passed", booleanJson(result.passed)},
        {"total", integerJson(result.total)},
        {"correct", integerJson(result.correct)},
        {"error", quote(result.error)},
        {"rows", arrayJson(result.rows, rowJson)},
        {"nandChallenge", challengeJson(result.nand)},
        {"designScore", objectJson({{"area",integerJson(result.design.area)},
          {"depth",integerJson(result.design.depth)}, {"supported",booleanJson(result.design.supported)},
          {"areaStar",booleanJson(result.design.areaStar)}, {"depthStar",booleanJson(result.design.depthStar)},
          {"switching",integerJson(result.design.switching)},
          {"switchingTarget",integerJson(result.design.switchingTarget)},
          {"switchingTransitions",integerJson(result.design.switchingTransitions)},
          {"powerStar",booleanJson(result.design.powerStar)}})},
    });
  });
}
} // extern "C"
