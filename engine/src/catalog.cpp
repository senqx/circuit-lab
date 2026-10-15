#include "signal/engine.hpp"
#include <algorithm>
#include <stdexcept>
#include <utility>

namespace signal_garden {
namespace {
using K = Kind;
using P = std::pair<int, int>;
struct Builder {
    Circuit c;
    int next = 100;
    explicit Builder(const Component& spec) {
        for (int i = 0; i < int(spec.inputs.size()); ++i) c.nodes.push_back({i + 1, K::Input, spec.inputs[i].width});
        for (int i = 0; i < int(spec.outputs.size()); ++i) c.nodes.push_back({i + 50, K::Output, spec.outputs[i].width});
    }
    P in(int n) { return {n + 1, 0}; }
    std::vector<P> add(K kind, std::vector<P> inputs, int count = 1) {
        int id = next++;
        c.nodes.push_back({id, kind});
        for (int i = 0; i < int(inputs.size()); ++i) wire(inputs[i], {id, i});
        std::vector<P> out;
        for (int i = 0; i < count; ++i) out.push_back({id, i});
        return out;
    }
    P g(K kind, std::vector<P> inputs = {}) { return add(kind, inputs)[0]; }
    void wire(P from, P to) { c.wires.push_back({from.first, from.second, to.first, to.second}); }
    void out(int n, P source) { wire(source, {n + 50, 0}); }
};
Component part(K kind, const char* key, const char* name, const char* description,
               const char* symbol, std::vector<Port> ins, std::vector<Port> outs = {{"Q", 1}}) {
    return {kind, key, name, description, symbol, std::move(ins), std::move(outs), {}};
}

Circuit recipe(const Component& s) {
    Builder b(s);
    P a = b.in(0), z = b.in(1), c = b.in(2);
    switch (s.kind) {
    case K::Switch: {
        auto power = b.g(K::High);
        b.out(0, b.g(K::PullDown, {b.g(K::Nmos, {a, power})})); break;
    }
    case K::Relay: b.out(0, a); break;
    case K::Beacon: b.out(0, b.g(K::High)); break;
    case K::Gate: case K::ClosedGate:
        b.out(0, b.g(K::PullDown, {b.g(s.kind == K::Gate ? K::Nmos : K::Pmos, {z, a})})); break;
    case K::Not:
        b.out(0, b.g(K::Nand, {a, a})); break;
    case K::Nand: {
        auto hi = b.g(K::High), lo = b.g(K::Low);
        auto up = b.g(K::Join, {b.g(K::Pmos, {a, hi}), b.g(K::Pmos, {z, hi})});
        auto down = b.g(K::Nmos, {a, b.g(K::Nmos, {z, lo})});
        b.out(0, b.g(K::Join, {up, down})); break;
    }
    case K::And: b.out(0, b.g(K::Not, {b.g(K::Nand, {a, z})})); break;
    case K::Or: b.out(0, b.g(K::Nand, {b.g(K::Not, {a}), b.g(K::Not, {z})})); break;
    case K::Xor: {
        auto n = b.g(K::Nand, {a, z});
        b.out(0, b.g(K::Nand, {b.g(K::Nand, {a, n}), b.g(K::Nand, {z, n})})); break;
    }
    case K::Mux:
        b.out(0, b.g(K::Or, {b.g(K::And, {a, b.g(K::Not, {c})}), b.g(K::And, {z, c})})); break;
    case K::Demux:
        b.out(0, b.g(K::And, {a, b.g(K::Not, {z})})); b.out(1, b.g(K::And, {a, z})); break;
    case K::HalfAdder:
        b.out(0, b.g(K::Xor, {a, z})); b.out(1, b.g(K::And, {a, z})); break;
    case K::FullAdder: {
        auto h = b.add(K::HalfAdder, {a, z}, 2), j = b.add(K::HalfAdder, {h[0], c}, 2);
        b.out(0, j[0]); b.out(1, b.g(K::Or, {h[1], j[1]})); break;
    }
    case K::Not4: case K::And4: case K::Mux4: {
        auto aa = b.add(K::Split4, {a}, 4);
        std::vector<P> zz, bits;
        if (s.kind != K::Not4) zz = b.add(K::Split4, {z}, 4);
        for (int i = 0; i < 4; ++i) {
            if (s.kind == K::Not4) bits.push_back(b.g(K::Not, {aa[i]}));
            if (s.kind == K::And4) bits.push_back(b.g(K::And, {aa[i], zz[i]}));
            if (s.kind == K::Mux4) bits.push_back(b.g(K::Mux, {aa[i], zz[i], c}));
        }
        b.out(0, b.g(K::Pack4, bits)); break;
    }
    case K::Add4: {
        auto aa = b.add(K::Split4, {a}, 4), zz = b.add(K::Split4, {z}, 4);
        std::vector<P> sum;
        for (int i = 0; i < 4; ++i) {
            auto f = b.add(K::FullAdder, {aa[i], zz[i], c}, 2);
            sum.push_back(f[0]); c = f[1];
        }
        b.out(0, b.g(K::Pack4, sum)); b.out(1, c); break;
    }
    case K::Zero4: {
        auto aa = b.add(K::Split4, {a}, 4);
        auto any = b.g(K::Or, {b.g(K::Or, {aa[0], aa[1]}), b.g(K::Or, {aa[2], aa[3]})});
        b.out(0, b.g(K::Not, {any})); break;
    }
    case K::Alu4: {
        auto sum = b.add(K::Add4, {a, z, b.g(K::Low)}, 2);
        auto result = b.g(K::Mux4, {sum[0], b.g(K::And4, {a, z}), c});
        b.out(0, result); b.out(1, b.g(K::Zero4, {result})); break;
    }
    case K::Bit: b.out(0, b.g(K::Dff, {a})); break;
    case K::Register4: {
        auto aa = b.add(K::Split4, {a}, 4);
        std::vector<P> bits;
        for (int i = 0; i < 4; ++i) {
            auto q = b.g(K::Bit); // Feedback crosses a clocked boundary.
            b.wire(b.g(K::Mux, {q, aa[i], z}), {q.first, 0});
            bits.push_back(q);
        }
        b.out(0, b.g(K::Pack4, bits)); break;
    }
    case K::Counter4: {
        auto lo = b.g(K::Low), hi = b.g(K::High);
        auto one = b.g(K::Pack4, {hi, lo, lo, lo}), zero = b.g(K::Pack4, {lo, lo, lo, lo});
        auto q = b.g(K::Register4);
        auto sum = b.add(K::Add4, {q, one, lo}, 2);
        b.wire(b.g(K::Mux4, {sum[0], zero, z}), {q.first, 0});
        b.wire(b.g(K::Or, {a, z}), {q.first, 1});
        b.out(0, q); break;
    }
    case K::Decoder2: {
        auto na = b.g(K::Not, {a}), nz = b.g(K::Not, {z});
        b.out(0, b.g(K::And, {na, nz})); b.out(1, b.g(K::And, {a, nz}));
        b.out(2, b.g(K::And, {na, z})); b.out(3, b.g(K::And, {a, z})); break;
    }
    case K::Ram2: {
        auto select = b.add(K::Demux, {c, z}, 2);
        auto r0 = b.g(K::Register4, {a, select[0]}), r1 = b.g(K::Register4, {a, select[1]});
        b.out(0, b.g(K::Mux4, {r0, r1, z})); break;
    }
    case K::Cpu4: {
        // I, OP0, OP1, EN, RESET. 00 LOAD, 01 ADD, 10 AND, 11 JUMP.
        auto en = b.in(3), reset = b.in(4), lo = b.g(K::Low), hi = b.g(K::High);
        auto zero = b.g(K::Pack4, {lo, lo, lo, lo}), one = b.g(K::Pack4, {hi, lo, lo, lo});
        auto acc = b.g(K::Register4), pc = b.g(K::Register4);
        auto op = b.add(K::Decoder2, {z, c}, 4);
        auto alu = b.add(K::Alu4, {acc, a, c}, 2);
        auto data = b.g(K::Mux4, {alu[0], a, op[0]});
        b.wire(b.g(K::Mux4, {data, zero, reset}), {acc.first, 0});
        b.wire(b.g(K::Or, {reset, b.g(K::And, {en, b.g(K::Not, {op[3]})})}), {acc.first, 1});
        auto inc = b.add(K::Add4, {pc, one, lo}, 2);
        auto jump = b.g(K::Mux4, {inc[0], a, op[3]});
        b.wire(b.g(K::Mux4, {jump, zero, reset}), {pc.first, 0});
        b.wire(b.g(K::Or, {reset, en}), {pc.first, 1});
        b.out(0, acc); b.out(1, pc); break;
    }
    default: break;
    }
    return b.c;
}
} // namespace

const std::vector<Component>& components() {
    static const auto all = [] {
        std::vector<Component> v = {
            part(K::Input,"INPUT","Input","An external signal.","IN",{},{{"Q",1}}),
            part(K::Output,"OUTPUT","Output","The result of your circuit.","OUT",{{"D",1}},{{"Q",1}}),
            part(K::Low,"LOW","Constant 0","Always sends 0. Nothing to change or switch.","0",{}),
            part(K::High,"HIGH","Power · always 1","Always sends 1. Unlike a signal you can flip, this value never changes.","1",{}),
            part(K::Nmos,"NMOS","nMOS transistor","Gate 1 connects source to drain. Gate 0 disconnects it (Z). This is a directional digital switch model.","nMOS",{{"G",1},{"S",1}},{{"D",1}}),
            part(K::Pmos,"PMOS","pMOS transistor","Gate 0 connects source to drain. Gate 1 disconnects it (Z). The partner of nMOS.","pMOS",{{"G",1},{"S",1}},{{"D",1}}),
            part(K::Join,"JOIN","Junction","Joins two drivers. Z yields to a driven value. Opposing 0 and 1 drivers cause a conflict (!).","JOIN",{{"A",1},{"B",1}}),
            part(K::PullDown,"PULLDOWN","Pull-down resistor","Gently holds a disconnected (Z) signal at 0. An active driver wins.","R ↓",{{"D",1}}),
            part(K::Dff,"DFF","Clocked cell","Stores D on each clock step. Starts at 0. All cells capture simultaneously.","DFF",{{"D",1}}),
            part(K::Split4,"SPLIT4","Split bus","Unpacks a four-bit number. b0 is the least significant bit (worth 1).","SPLIT",{{"D",4}},{{"b0",1},{"b1",1},{"b2",1},{"b3",1}}),
            part(K::Pack4,"PACK4","Join bus","Packs b0, b1, b2, b3 into a four-bit number. Their values are 1, 2, 4, 8.","BUS",{{"b0",1},{"b1",1},{"b2",1},{"b3",1}},{{"Q",4}}),
            part(K::Switch,"SWITCH","Switch","A transistor and resistor working together: Q follows G.","SW",{{"G",1}}),
            part(K::Not,"NOT","NOT gate","Flips a bit. 0 becomes 1; 1 becomes 0.","NOT",{{"A",1}}),
            part(K::Nand,"NAND","NAND gate","Outputs 0 only when both inputs are 1. You can build every logic gate with this.","NAND",{{"A",1},{"B",1}}),
            part(K::And,"AND","AND gate","Outputs 1 only when both inputs are 1.","AND",{{"A",1},{"B",1}}),
            part(K::Or,"OR","OR gate","Outputs 1 when at least one input is 1.","OR",{{"A",1},{"B",1}}),
            part(K::Xor,"XOR","XOR gate","Outputs 1 when the two inputs are different.","XOR",{{"A",1},{"B",1}}),
            part(K::Mux,"MUX","Selector","S=0 chooses A. S=1 chooses B.","MUX",{{"A",1},{"B",1},{"S",1}}),
            part(K::Demux,"DEMUX","Router","S=0 sends D to A. S=1 sends D to B. The other output is 0.","DEMUX",{{"D",1},{"S",1}},{{"A",1},{"B",1}}),
            part(K::HalfAdder,"HALF","Half adder","Adds two bits. S is the sum bit and C is the carry.","½ ADD",{{"A",1},{"B",1}},{{"S",1},{"C",1}}),
            part(K::FullAdder,"FULL","Full adder","Adds A + B + carry-in. C is the carry-out.","ADD",{{"A",1},{"B",1},{"Cin",1}},{{"S",1},{"C",1}}),
            part(K::Not4,"NOT4","4-bit NOT","Flips each of the four bits.","NOT₄",{{"A",4}},{{"Q",4}}),
            part(K::And4,"AND4","4-bit AND","Applies AND to each matching pair of bits.","AND₄",{{"A",4},{"B",4}},{{"Q",4}}),
            part(K::Add4,"ADD4","4-bit adder","Adds A + B + Cin. S wraps at 16; C reports overflow.","ADD₄",{{"A",4},{"B",4},{"Cin",1}},{{"S",4},{"C",1}}),
            part(K::Zero4,"ZERO4","Zero detector","Outputs 1 exactly when all four input bits are 0.","= 0",{{"A",4}}),
            part(K::Mux4,"MUX4","4-bit selector","Selects an entire bus: A if S=0, B if S=1.","MUX₄",{{"A",4},{"B",4},{"S",1}},{{"Q",4}}),
            part(K::Alu4,"ALU4","Arithmetic logic unit","M=0 adds A+B (modulo 16). M=1 computes bitwise AND. Z says whether Q is zero.","ALU₄",{{"A",4},{"B",4},{"M",1}},{{"Q",4},{"Z",1}}),
            part(K::Bit,"BIT","1-bit memory","Captures D on a clock step and holds it between steps.","BIT",{{"D",1}}),
            part(K::Register4,"REG4","4-bit register","On a step, stores D if Load=1; otherwise holds Q.","REG₄",{{"D",4},{"Load",1}},{{"Q",4}}),
            part(K::Counter4,"COUNT4","Program counter","On a step, Reset clears Q; otherwise En increments it. Wraps from 15 to 0.","PC₄",{{"En",1},{"Reset",1}},{{"Q",4}}),
            part(K::Decoder2,"DECODE2","2-to-4 decoder","Turns a two-bit address (b0 + 2×b1) into one active selection line.","DEC",{{"b0",1},{"b1",1}},{{"Q0",1},{"Q1",1},{"Q2",1},{"Q3",1}}),
            part(K::Ram2,"RAM2","2-word RAM","Two four-bit words. Reads Addr immediately; writes D to Addr on a step when Write=1.","RAM",{{"D",4},{"Addr",1},{"Write",1}},{{"Q",4}}),
            part(K::Cpu4,"CPU4","Tiny processor","00 LOAD I, 01 ADD I, 10 AND I, 11 JUMP I (OP1 OP0). En runs one instruction per step. Reset clears A and PC, even if En=0.","CPU",{{"I",4},{"OP0",1},{"OP1",1},{"En",1},{"Reset",1}},{{"A",4},{"PC",4}})
            ,part(K::Relay,"RELAY","Signal link","Carries a 0 or 1 from one place to another.","LINK",{{"Signal",1}},{{"Light",1}})
            ,part(K::Beacon,"BEACON","Always on","Keeps a light on with a constant 1.","ON",{},{{"Light",1}})
            ,part(K::Gate,"GATE","Controlled switch","EN enables the path: EN=1 passes data D to Q. EN=0 holds Q at 0. D means data; EN means enable.","SWITCH",{{"D",1},{"EN",1}},{{"Q",1}})
            ,part(K::ClosedGate,"CLOSED_GATE","Reverse switch","An active-low enable: EN=0 passes data D to Q. EN=1 holds Q at 0.","REVERSE",{{"D",1},{"EN",1}},{{"Q",1}})
        };
        for (auto& s : v) if (int(s.kind) >= int(K::Switch)) s.definition = recipe(s);
        return v;
    }();
    return all;
}
const Component& component(Kind kind) {
    auto i = int(kind);
    if (i < 0 || i >= int(components().size())) throw std::runtime_error("Unknown component type.");
    return components()[i];
}
Kind kind_from_key(const std::string& key) {
    for (const auto& c : components()) if (c.key == key) return c.kind;
    throw std::runtime_error("Unknown component: " + key);
}
Circuit blank(Kind kind) { return Builder(component(kind)).c; }
Circuit reference(int id) { return level(id).solution; }
bool is_sequential(Kind kind) {
    if (kind == K::Dff) return true;
    for (auto n : component(kind).definition.nodes) if (is_sequential(n.kind)) return true;
    return false;
}

const std::vector<Chapter>& chapters() {
    static const std::vector<Chapter> all = {
        {"Signals", "Send a message, light a bulb, and open a switch."},
        {"Rules", "Build NAND first, then use it to make every other logic rule."},
        {"Numbers", "See how 0 and 1 make numbers, then build an adder."},
        {"Calculator", "Choose between arithmetic and logic in one small machine."},
        {"Memory", "Keep a bit, store a number, and count clock steps."},
        {"Computer", "Address memory and put your building blocks into a processor."}
    };
    return all;
}

const std::vector<Level>& levels() {
    static const auto all = [] {
        std::vector<Level> v;
        auto add = [&](int chapter, K target, const char* title, const char* subtitle,
                       const char* story, const char* goal, const char* explanation,
                       std::vector<std::string> hints, bool sequential = false, Circuit solution = {}) {
            if (solution.nodes.empty()) solution = component(target).definition;
            std::vector<K> allowed;
            for (auto n : solution.nodes)
                if (n.kind != K::Input && n.kind != K::Output && std::find(allowed.begin(), allowed.end(), n.kind) == allowed.end()) allowed.push_back(n.kind);
            v.push_back({int(v.size()) + 1, chapter, title, subtitle, story, goal, explanation, hints, target, allowed, sequential, std::move(solution), {}, {}, {}});
        };
        add(0,K::Relay,"Send your first signal","One connection. Your first discovery.",
            "Imagine sending a tiny message to a friend. Here, your message is either 0 (off) or 1 (on). A wire carries that message to a light.",
            "Make the bulb turn on when Signal is 1, and turn off when Signal is 0.",
            "Signal is your switch: you choose 0 or 1. Light is the output: it shows what arrived. Gold wires flow when they carry 1. Blue wires carry 0 and stay still.",
            {"Signal's right-hand circle sends a signal. The bulb's circle underneath receives it.","Click Signal's right-hand circle, then Light's bottom circle. Or drag between them.","Click the number inside Signal. At 1 the bulb glows; at 0 it turns off. Press Check circuit to try both possibilities."});
        v.back().scene="signal";
        v.back().steps={"Click Signal's right dot, then Light's bottom dot to draw a wire.","Click Signal's number. Try both 0 and 1 and watch the bulb.","Press Check circuit below your task to finish the experiment."};
        add(0,K::Beacon,"A light that stays on","Some messages never change.",
            "A lighthouse needs a light that stays on. Your switchable signal can change, but the Power block always sends 1.",
            "Connect Power to Light to keep the light on all the time.",
            "You now have two useful ideas: a variable you can flip between 0 and 1, and a constant that always sends the same value. That is all the power knowledge this game needs.",
            {"Find the Power block marked 1. It is already on the board.","It has one sending dot on its right. The light has one receiving dot at its base.","Connect those dots. Power always sends 1, so the light stays on."});
        v.back().scene="power";
        v.back().steps={"Click Power's right dot, then Light's bottom dot.","Press Check circuit below your task. The bulb should stay on."};
        Builder railway(component(K::Gate));
        railway.out(0,railway.g(K::Gate,{railway.in(0),railway.in(1)}));
        add(0,K::Gate,"The railway switch","You decide when the train can pass.",
            "A train is waiting at a signal. One switch says whether a train is here; the other says GO. The train reaches the station only when both say 1.",
            "Q must be 1 only when D and EN are both 1. D is the train; EN is permission to pass.",
            "Watch the little bridge inside the switch. EN=0 leaves a gap; EN=1 closes it so D can pass. A closed bridge can carry 0 too: closed means connected, not necessarily on. These controlled switches are the idea behind transistors; no electricity course is needed.",
            {"D means data: connect the D input to the switch's upper dot. EN means enable: connect it to the lower dot.","Connect the switch's Q dot to the output bulb Q.","Try D=1, EN=0. Now enable the path with EN=1. Finally, try EN=1 with no data (D=0)."},false,railway.c);
        v.back().scene="rail";
        v.back().steps={"Wire D to D, EN to EN, and the switch's Q to the bulb Q.","Set D to 1. Flip EN and watch the bridge and the bulb.","Press Check circuit below your task to test all four possibilities."};
        add(1,K::Not,"The opposite day machine","One NAND. Two connected inputs.",
            "NAND is your universal building block. Start by giving both its inputs the same signal. What happens when that signal changes?",
            "Make Q show the opposite of A: 0 becomes 1, and 1 becomes 0.",
            "Tying a NAND's two inputs together turns it into NOT. At A=0, NAND sees 00 and outputs 1. At A=1, it sees 11 and outputs 0.",
            {"Add one NAND gate.","Connect A to both NAND input dots. One output can feed several inputs.","Connect NAND's Q to the bulb Q. Try both values of A."});
        add(1,K::And,"Both together","Turn NAND's answer around.",
            "NAND switches off when both inputs are on. Flip its output to make a rule that switches on only when both are on.",
            "Q should be 1 only when A and B are both 1.",
            "AND is NAND followed by NOT. You can also use two NAND gates: connect both inputs of the second to the first gate's output.",
            {"Start with a NAND and a NOT gate, or use two NAND gates.","Send A and B to the first NAND.","Invert that NAND's result, then connect it to Q. If using a second NAND, wire both its inputs to the first NAND's output."});
        Builder nand(component(K::Nand));
        auto both=nand.g(K::Gate,{nand.in(0),nand.in(1)});
        nand.out(0,nand.g(K::ClosedGate,{nand.g(K::High),both}));
        add(1,K::Nand,"The universal gate","Your first logic gate: NAND.",
            "You know how an enable opens a path. A reverse switch does the opposite: EN=0 connects it; EN=1 blocks it. Combine the two kinds of switch to build NAND.",
            "Q must be 1 for 00, 01, and 10. Only A=1 and B=1 should make Q=0.",
            "The controlled switch produces 1 only when A and B are 1. Use that signal to control a reverse switch carrying a constant 1. Together they make NAND. Every logic gate you build next can be made from NANDs.",
            {"Add Power, a controlled switch, and a reverse switch. Watch the bridges inside them.","Connect A to the controlled switch's D and B to its EN. Connect that switch's Q to the reverse switch's EN.","Power goes to the reverse switch's D. Its Q goes to the bulb. Only when A=B=1 does it block the 1."},false,nand.c);
        v.back().steps={"Add Power, one controlled switch, and one reverse switch.","Use A and B to control the first path. Its result enables the reverse path carrying Power.","Match the expected truth table, then press Check circuit."};
        add(1,K::Or,"Either way","Give your circuit a choice.",
            "A doorbell can ring from the front door OR the back door. One pressed button is enough.","Q should be 1 when A, B, or both are 1.",
            "De Morgan's law: A OR B equals NOT ((NOT A) AND (NOT B)). NAND already does that final NOT.",
            {"You have NOT and NAND. Think about when OR should output 0.","Invert each input before it reaches NAND.","A → NOT → NAND.A; B → NOT → NAND.B; NAND → Q."});
        add(1,K::Xor,"Spot the difference","Same is off. Different is on.",
            "XOR notices a difference. It powers addition, error detection, and plenty of clever puzzles.","Q should be 1 exactly when A and B differ. Use only NAND gates.",
            "Unlike OR, XOR is 0 when both inputs are 1. A shared intermediate NAND lets four NAND gates solve the puzzle.",
            {"Start with T = NAND(A, B). You will reuse T twice.","Make U = NAND(A, T) and V = NAND(B, T).", "The final answer is NAND(U, V). Four gates, one clever pattern."});
        add(1,K::Mux,"Choose your signal","A railway switch for bits.",
            "Two signals arrive, but only one can leave. A selector bit decides which one gets through.","When S=0, output A. When S=1, output B.",
            "A multiplexer chooses data. Its rule is (A AND NOT S) OR (B AND S). S is a control signal.",
            {"Gate A with the opposite of S.","Gate B with S itself.","OR those two results together. Only one path is open at a time."});
        add(1,K::Demux,"Send it somewhere","One signal, two destinations.",
            "Now reverse the idea: route one incoming signal toward one of two places.","S=0 sends D to A; S=1 sends D to B. The unselected output stays 0.",
            "A demultiplexer routes data. Later it will decide which memory location gets written.",
            {"You need two AND gates and one NOT.","A is D AND NOT S.","B is D AND S."});
        add(2,K::HalfAdder,"One plus one","When two bits need a second digit.",
            "In binary, 1 + 1 = 10. The right digit is the sum; the left digit is a carry into the next column.","Add A and B. Output the sum bit S and carry bit C.",
            "XOR gives the sum without carry. AND detects when both inputs are 1, producing the carry.",
            {"Try writing 0+0, 0+1, 1+0, and 1+1 in binary.","The sum column looks like XOR; the carry column looks like AND.","Send both inputs to both gates. XOR → S; AND → C."});
        add(2,K::FullAdder,"Pass it on","Make room for the carry.",
            "When adding a column of digits, you also need the carry from the previous column. Combine two half adders to handle three bits.",
            "Add A + B + Cin. Output the sum S and carry C.","A full adder is two half adders with their carry outputs combined using OR.",
            {"First add A and B with a half adder.","Feed its sum and Cin into a second half adder.","The second sum is S. OR the two carry outputs to get C."});
        add(2,K::Not4,"A handful of bits","Think in numbers, four bits at a time.",
            "Four bits can describe the numbers 0 through 15. A bus keeps those four wires together so bigger circuits stay readable.",
            "Flip every bit of A. For example, 0011 (3) becomes 1100 (12).",
            "Split unpacks a bus; Join bus packs it again. b0 is worth 1, b1 is worth 2, b2 is worth 4, and b3 is worth 8.",
            {"Split A into its four bits.","Pass each bit through its own NOT gate.","Pack the results back in the same order and connect the bus to Q."});
        v.back().example_inputs={{0},{1},{3},{5},{10},{15}};
        add(2,K::And4,"Four lanes of logic","The same idea, side by side.",
            "Bitwise operations do one simple task across an entire number. This is how computers mask and filter bits.",
            "AND each matching pair of bits in A and B. Example: 1010 AND 1100 = 1000.",
            "Parallel circuits work on separate bits at the same time. Bus widths must match: a four-bit port needs a four-bit wire.",
            {"Split both A and B.","Use four AND gates, pairing b0 with b0, b1 with b1, and so on.","Pack the four results into Q."});
        v.back().example_inputs={{0,15},{15,15},{10,12},{5,10},{7,3},{15,9}};
        add(2,K::Add4,"The ripple effect","Your first real calculator.",
            "Line up four full adders and let each carry ripple into its neighbor. Now your circuit can add whole numbers.",
            "Compute A + B + Cin. S is the bottom four bits; C reports a sum of 16 or more.",
            "Binary addition moves from least significant to most significant bit. The carry is the only connection between neighboring columns.",
            {"Split A and B into bits and start at b0.","Connect Cin to the first full adder. Chain each carry-out to the next carry-in.","Pack the four sum bits. The fourth adder's carry becomes C."});
        v.back().example_inputs={{0,0,0},{3,4,0},{3,4,1},{15,1,0},{15,0,1},{15,15,1}};
        add(3,K::Zero4,"Nothing to see here","Sometimes zero is the answer.",
            "A processor needs to know when a result is zero. This tiny detector will help it make decisions.","Output 1 only when A is 0000.",
            "If any bit is 1, the number is nonzero. OR the bits together, then invert the result.",
            {"Split A and combine its bits with OR gates.","Pair the low two bits, pair the high two bits, then OR the pairs.","Pass the final OR through NOT."});
        v.back().example_inputs={{0},{1},{2},{4},{8},{15}};
        add(3,K::Mux4,"Switch the whole train","Choose a four-bit word.",
            "Your single-bit selector can become a selector for an entire number. All four lanes share one decision.","S=0 chooses A; S=1 chooses B. Route all four bits together.",
            "A control signal can fan out to many inputs. One select bit drives all four multiplexers.",
            {"Split both buses and use four selectors.","Each selector receives matching A and B bits. All S inputs share the external S.","Pack the four selected bits into Q."});
        v.back().example_inputs={{3,12,0},{3,12,1},{0,15,0},{0,15,1},{10,5,0},{10,5,1}};
        add(3,K::Alu4,"The thinking machine","Arithmetic meets logic.",
            "The arithmetic logic unit is the calculator inside a processor. Give it a mode switch so it can do more than one job.",
            "M=0: Q=(A+B) modulo 16. M=1: Q=A AND B. Z=1 when Q is zero.",
            "Compute both candidate answers, then select one. Hardware often does several things in parallel and chooses the useful result.",
            {"Compute ADD4 and AND4 in parallel. Tie the adder's Cin to Constant 0.","Use MUX4 with M to choose between sum and AND.","Connect the selected result to Q and to a zero detector for Z."});
        v.back().example_inputs={{3,5,0},{3,5,1},{10,12,0},{10,12,1},{15,1,0},{0,15,1}};
        add(4,K::Bit,"Hold that thought","Give your circuit a memory.",
            "Until now, outputs changed as soon as inputs changed. A clocked cell remembers a bit until you tell it to capture a new one.",
            "Connect D to a clocked cell and its output to Q. Q must change only when you press Step clock.",
            "The clock is a shared event, not a wire in this game. Every cell captures its old input simultaneously. Cells start at 0. The clocked cell is a provided timing primitive.",
            {"Place one clocked cell.","Wire D into the cell and the cell's Q into the output.","Change D: Q holds still. Press Step clock: Q captures D."},true);
        add(4,K::Register4,"Keep a number","Memory with an on switch.",
            "A register is a small shelf for a number. Add a Load signal so it can choose between saving new data and keeping what it has.",
            "On a clock step, Load=1 stores D. Load=0 keeps the previous Q. Start at 0.",
            "Feed the old Q back through a selector. The selector chooses old Q or new D before the next clock step. Feedback is safe when it passes through memory.",
            {"Split D. Each bit needs one memory cell and one selector.","Connect each cell's output to its selector's A input; D's matching bit to B; Load to S.","The selector feeds the cell. Pack the four cell outputs into Q."},true);
        add(4,K::Counter4,"One step further","A heartbeat for your computer.",
            "A program counter remembers where the processor is in its program. Build one that can pause, count, and restart.",
            "On each step: Reset=1 clears Q. Otherwise En=1 adds 1, wrapping at 16. En=0 holds Q.",
            "Reset has priority over enable. Combine a register, an adder, and a selector. The previous count feeds the next calculation.",
            {"Make constants 0000 and 0001 using Constant 0, Power, and Join bus.","Add 1 to the register output. Reset selects 0000 instead of the sum.","Register Load is En OR Reset. Connect its Q to the output."},true);
        add(4,K::Decoder2,"Pick an address","Turn a number into a destination.",
            "Memory uses a binary address to pick one location. A decoder turns two address bits into four individual selection lines.",
            "Exactly one output is 1: Q0 for 00, Q1 for 01, Q2 for 10, Q3 for 11 (b1 b0).",
            "Each output recognizes one unique combination of true and inverted address bits.",
            {"Make NOT b0 and NOT b1.","Q0 = NOT b0 AND NOT b1. Q1 = b0 AND NOT b1.","Q2 = NOT b0 AND b1. Q3 = b0 AND b1."});
        add(5,K::Ram2,"A place for everything","Build a tiny memory bank.",
            "One register remembers one number. A memory bank uses an address to choose among several registers. Start with two.",
            "Read the word at Addr immediately. On a step, Write=1 stores D only at Addr. Both words start at 0.",
            "A router selects which register loads. A bus selector chooses which register you read. Reading and writing use the same address.",
            {"Use DEMUX to route Write using Addr.","Each router output enables one REG4. Both registers receive D.","Use MUX4 to read either register according to Addr."},true);
        add(5,K::Cpu4,"Hello, little computer","Put your ideas to work.",
            "You have switches, arithmetic, control, and memory. Now assemble an instruction-driven processor with an accumulator A and a program counter PC.",
            "On a step with En=1: 00 loads I, 01 adds I, 10 ANDs I, 11 jumps PC to I (OP1 OP0). Other instructions increment PC. Reset clears both registers and wins over En.",
            "Instructions are supplied through the inputs, like a front panel computer. LOAD, ADD, and AND change A. JUMP preserves A and changes PC. Arithmetic wraps to four bits.",
            {"Use two REG4 chips for A and PC. Decode OP0/OP1. Feed A and I to ALU4; OP1 selects its mode.","For A, select I on LOAD, otherwise ALU output. Load A only for enabled non-JUMP instructions. Reset selects zero and forces Load.","For PC, add 1 to the old PC, select I on JUMP, then select zero on Reset. Load PC when En OR Reset. See a worked circuit if you need a map."},true);
        std::rotate(v.begin()+3,v.begin()+5,v.begin()+6); // NAND, NOT, AND; IDs remain 6, 4, 5.
        std::vector<K> learned;
        for(auto& lesson : v) {
            const auto add_part=[&](K kind) {
                if(std::find(lesson.allowed.begin(),lesson.allowed.end(),kind)==lesson.allowed.end()) lesson.allowed.push_back(kind);
            };
            // The tray emphasizes the example's parts, then offers earlier logic blocks.
            for(auto kind : learned) if(kind!=lesson.target) add_part(kind);
            if(lesson.target!=K::Relay && lesson.target!=K::Beacon && lesson.target!=K::Gate) learned.push_back(lesson.target);
        }
        return v;
    }();
    return all;
}
const Level& level(int id) {
    for(const auto& l : levels()) if(l.id==id) return l;
    throw std::runtime_error("Unknown lesson.");
}

std::vector<TestRow> test_vectors(int id) {
    const auto& l = level(id);
    std::vector<TestRow> rows;
    auto row = [&](std::vector<int> in, std::vector<int> out, bool tick = false) { rows.push_back({in, out, {}, tick, false}); };
    if (!l.sequential) {
        const auto& spec = component(l.target);
        int bits = 0;
        for (auto p : spec.inputs) bits += p.width;
        for (int mask = 0; mask < (1 << bits); ++mask) {
            int shift = bits;
            std::vector<int> x;
            for (auto p : spec.inputs) { shift -= p.width; x.push_back((mask >> shift) & ((1 << p.width) - 1)); }
            int a = x.empty() ? 0 : x[0], b = x.size() > 1 ? x[1] : 0, c = x.size() > 2 ? x[2] : 0;
            std::vector<int> y;
            switch (l.target) {
            case K::Switch: case K::Relay: y = {a}; break;
            case K::Beacon: y = {1}; break;
            case K::Gate: y = {a & b}; break;
            case K::Not: y = {1 - a}; break;
            case K::Nand: y = {!(a && b)}; break;
            case K::And: y = {a & b}; break;
            case K::Or: y = {a | b}; break;
            case K::Xor: y = {a ^ b}; break;
            case K::Mux: case K::Mux4: y = {c ? b : a}; break;
            case K::Demux: y = {b ? 0 : a, b ? a : 0}; break;
            case K::HalfAdder: y = {(a+b)&1, (a+b)>>1}; break;
            case K::FullAdder: y = {(a+b+c)&1, (a+b+c)>>1}; break;
            case K::Not4: y = {a ^ 15}; break;
            case K::And4: y = {a & b}; break;
            case K::Add4: y = {(a+b+c)&15, (a+b+c)>>4}; break;
            case K::Zero4: y = {a == 0}; break;
            case K::Alu4: { int q = c ? a & b : (a+b)&15; y = {q, q == 0}; break; }
            case K::Decoder2: { int q = a + 2*b; y = {q==0, q==1, q==2, q==3}; break; }
            default: throw std::runtime_error("Missing combinational specification.");
            }
            row(x,y);
        }
        return rows;
    }
    int q = 0, pc = 0, memory[2] = {0,0};
    // Deterministic stateful traces cover all data/control combinations and hold
    // behavior. Expected state is a behavioral specification, never a circuit.
    auto step = [&](std::vector<int> x, bool tick) {
        int a = x[0], b = x.size()>1 ? x[1] : 0;
        std::vector<int> y;
        if (l.target == K::Bit) { if(tick) q=a; y={q}; }
        if (l.target == K::Register4) { if(tick && b) q=a; y={q}; }
        if (l.target == K::Counter4) { if(tick) q=b ? 0 : (q+a)&15; y={q}; }
        if (l.target == K::Ram2) { if(tick && x[2]) memory[b]=a; y={memory[b]}; }
        if (l.target == K::Cpu4) {
            if(tick) {
                if(x[4]) { q=0; pc=0; }
                else if(x[3]) {
                    int op = x[1] + 2*x[2];
                    if(op==0) q=a;
                    if(op==1) q=(q+a)&15;
                    if(op==2) q&=a;
                    pc = op==3 ? a : (pc+1)&15;
                }
            }
            y={q,pc};
        }
        row(x,y,tick);
    };
    if(l.target == K::Bit) {
        step({1},false); step({1},true); step({0},false); step({0},true); step({1},false); step({1},true);
        for(int i=0;i<12;++i) { step({(i/2)%2},false); step({i%2},true); }
    }
    if(l.target == K::Register4) {
        step({7,0},false); step({7,1},true); step({3,0},false); step({3,0},true); step({3,1},true); step({12,0},true);
        for(int v=0;v<16;++v) for(int load=0;load<2;++load) { step({v,load},false); step({v,load},true); step({15-v,0},true); }
    }
    if(l.target == K::Counter4) {
        for(int i=0;i<36;++i) { step({1,0},false); step({1,0},true); step({0,0},true); }
        step({0,1},true); step({1,0},true); step({1,1},true);
    }
    if(l.target == K::Ram2) {
        step({5,0,1},false); step({5,0,1},true); step({9,1,1},true); step({0,0,0},false); step({7,0,0},true); step({0,1,0},false);
        for(int v=0;v<16;++v) for(int addr=0;addr<2;++addr) {
            step({v,addr,1},false); step({v,addr,1},true); step({15-v,1-addr,0},true); step({0,addr,0},false);
        }
    }
    if(l.target == K::Cpu4) {
        step({0,0,0,0,0},false);
        step({7,0,0,1,0},true); step({3,1,0,0,0},false); step({3,1,0,1,0},true);
        step({6,0,1,1,0},true); step({12,1,1,1,0},true);
        for(int v=0;v<16;++v) for(int op=0;op<4;++op) {
            step({v,op&1,op>>1,1,0},false); step({v,op&1,op>>1,1,0},true);
            step({15-v,op&1,op>>1,0,0},true);
        }
        step({15,0,0,0,1},true); step({7,0,0,1,0},true); step({3,1,0,1,0},true);
        step({6,0,1,1,0},true); step({12,1,1,1,0},true); step({4,1,1,1,1},true);
    }
    return rows;
}
} // namespace signal_garden
