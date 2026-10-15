#include "signal/engine.hpp"
#include <iostream>

// A second, native client of exactly the same engine used by the web game.
int main() {
    using namespace signal_garden;
    Circuit cpu = reference(24);
    State memory;
    struct Instruction { const char* name; int immediate, op0, op1; };
    const Instruction program[] = {
        {"LOAD", 7, 0, 0}, {"ADD", 3, 1, 0},
        {"AND", 6, 0, 1}, {"JUMP", 12, 1, 1}
    };
    std::cout << "A tiny program, simulated entirely in C++\n\n";
    for (const auto& instruction : program) {
        auto result = simulate(cpu, {instruction.immediate, instruction.op0, instruction.op1, 1, 0}, memory, true);
        if (!result.error.empty()) { std::cerr << result.error << '\n'; return 1; }
        memory = result.state;
        std::cout << instruction.name << ' ' << instruction.immediate
                  << "  →  A=" << result.outputs[0] << "  PC=" << result.outputs[1] << '\n';
    }
}
