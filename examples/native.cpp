#include "signal/engine.h"

#include <iostream>
#include <string_view>
#include <utility>

int main() {
  using namespace circuit;
  const Circuit cpu = reference(24);
  State memory;

  struct Instruction {
    std::string_view name;
    int immediate;
    int op0;
    int op1;
  };

  const Instruction program[] = {
      {"LOAD", 7, 0, 0},
      {"ADD", 3, 1, 0},
      {"AND", 6, 0, 1},
      {"JUMP", 12, 1, 1},
  };
  std::cout << "A tiny program, simulated entirely in C++\n\n";
  for (const Instruction& instruction : program) {
    Result result = simulate(cpu, {instruction.immediate, instruction.op0, instruction.op1, 1, 0}, memory, true);
    if (!result.error.empty()) {
      std::cerr << result.error << '\n';
      return 1;
    }

    memory = std::move(result.state);
    std::cout << instruction.name << ' ' << instruction.immediate << "  →  A=" << result.outputs[0]
              << "  PC=" << result.outputs[1] << '\n';
  }
}
