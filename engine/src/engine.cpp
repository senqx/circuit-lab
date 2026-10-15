#include "signal/engine.hpp"
#include <algorithm>
#include <deque>
#include <stdexcept>

namespace signal_garden {
namespace {
using K = Kind;
struct Ref { int node = -1, port = 0; };
struct Flat {
    K kind;
    int width;
    std::string key;
    std::vector<Ref> inputs;
    std::vector<int> values;
    int contact = unknown;
};
struct Handles { std::vector<Ref> inputs, outputs; };
struct Compiled {
    std::vector<Flat> flat;
    std::map<int, Handles> visible;
    std::map<int, int> contact_nodes;
    std::vector<int> input_nodes;
    std::vector<Ref> outputs;
    std::vector<int> order;

    Handles expand(const Circuit& circuit, const std::string& prefix, bool top, int depth = 0) {
        if (depth > 32 || flat.size() > 32768) throw std::runtime_error("Circuit is too large to expand.");
        if (circuit.nodes.size() > 512 || circuit.wires.size() > 4096) throw std::runtime_error("Use at most 512 parts and 4096 wires.");
        std::map<int, Handles> refs;
        std::map<int, const Node*> nodes;
        for (const auto& n : circuit.nodes) {
            if(n.id < 1 || n.id > 1000000 || !nodes.emplace(n.id, &n).second) throw std::runtime_error("Every part needs a unique positive ID.");
            const auto& spec = component(n.kind);
            std::string key = prefix + std::to_string(n.id);
            const int begin = int(flat.size());
            if (!spec.definition.nodes.empty()) {
                refs[n.id] = expand(spec.definition, key + ".", false, depth + 1);
            } else {
                bool terminal = n.kind == K::Input || n.kind == K::Output;
                if (terminal && n.width != 1 && n.width != 4) throw std::runtime_error("Ports must be one or four bits wide.");
                int inputs = int(spec.inputs.size());
                // Nested input terminals are aliases driven by the parent.
                if(n.kind == K::Input && !top) inputs = 1;
                if(flat.size() >= 32768) throw std::runtime_error("Circuit expands beyond 32768 primitives.");
                int index = int(flat.size());
                flat.push_back({n.kind == K::Input && !top ? K::Output : n.kind, terminal ? n.width : 1, key, std::vector<Ref>(inputs), std::vector<int>(spec.outputs.size(), unknown)});
                Handles h;
                for(int i=0;i<inputs;++i) h.inputs.push_back({index,i});
                for(int i=0;i<int(spec.outputs.size());++i) h.outputs.push_back({index,i});
                refs[n.id] = h;
            }
            if(top) {
                int contact = -1, count = 0;
                for(int i=begin;i<int(flat.size());++i) if(flat[i].kind==K::Nmos || flat[i].kind==K::Pmos) { contact=i; ++count; }
                if(count==1) contact_nodes[n.id]=contact;
            }
        }
        auto port_width = [&](const Node& n, int p, bool output) {
            auto ports = output ? component(n.kind).outputs : component(n.kind).inputs;
            if(p < 0 || p >= int(ports.size())) throw std::runtime_error("Wire refers to a port that does not exist.");
            return n.kind == K::Input || n.kind == K::Output ? n.width : ports[p].width;
        };
        for (auto w : circuit.wires) {
            if(!nodes.count(w.from) || !nodes.count(w.to)) throw std::runtime_error("Wire refers to a missing part.");
            const auto& source = *nodes.at(w.from);
            const auto& target = *nodes.at(w.to);
            if(source.kind == K::Output || target.kind == K::Input) throw std::runtime_error("Connect an output pin to an input pin.");
            int sw = port_width(source, w.output, true), tw = port_width(target, w.input, false);
            if(sw != tw) throw std::runtime_error("Wire widths differ. Use Split bus or Join bus between bits and buses.");
            auto dst = refs.at(w.to).inputs.at(w.input);
            auto& input = flat.at(dst.node).inputs.at(dst.port);
            if(input.node != -1) throw std::runtime_error("This input already has a wire. Use a Junction to join transistor drivers.");
            input = refs.at(w.from).outputs.at(w.output);
        }
        Handles result;
        // Numeric terminal IDs establish a stable public port order.
        for(auto [id, node] : nodes) {
            if(node->kind == K::Input) {
                if(top) input_nodes.push_back(refs.at(id).outputs[0].node);
                else result.inputs.push_back(refs.at(id).inputs[0]);
            }
            if(node->kind == K::Output) result.outputs.push_back(refs.at(id).outputs[0]);
        }
        if(top) { visible = refs; outputs = result.outputs; }
        return result;
    }
    explicit Compiled(const Circuit& circuit) {
        expand(circuit, "", true);
        std::vector<int> degree(flat.size());
        std::vector<std::vector<int>> next(flat.size());
        for(int i=0;i<int(flat.size());++i) {
            const auto& f=flat[i];
            for(auto r : f.inputs) {
                if(r.node < 0) continue;
                if(f.kind != K::Dff) { ++degree[i]; next[r.node].push_back(i); }
            }
        }
        std::deque<int> ready;
        for(int i=0;i<int(flat.size());++i) if(degree[i]==0) ready.push_back(i);
        while(!ready.empty()) {
            int i=ready.front(); ready.pop_front(); order.push_back(i);
            for(int n : next[i]) if(--degree[n]==0) ready.push_back(n);
        }
        if(order.size()!=flat.size()) throw std::runtime_error("This feedback loop has no memory cell. Route feedback through a clocked cell or register.");
    }
    int value(Ref r) const { return r.node < 0 ? unknown : flat[r.node].values[r.port]; }
    void settle(const State& state) {
        for(int index : order) {
            auto& f = flat[index];
            auto in = [&](int n) { return value(f.inputs[n]); };
            int q=unknown;
            switch(f.kind) {
            case K::Input: continue;
            case K::Output: q=in(0); break;
            case K::Low: q=0; break;
            case K::High: q=1; break;
            case K::Nmos: case K::Pmos: {
                int g=in(0);
                f.contact=g<0 ? unknown : int(g==(f.kind==K::Nmos ? 1 : 0));
                if(g<0) q=g == conflict ? conflict : unknown;
                else q=f.contact ? in(1) : floating;
                break;
            }
            case K::Join: {
                int a=in(0), b=in(1);
                if(a==conflict || b==conflict) q=conflict;
                else if(a==unknown || b==unknown) q=unknown;
                else if(a==floating) q=b;
                else if(b==floating) q=a;
                else q=a==b ? a : conflict;
                break;
            }
            case K::PullDown: q=in(0)==floating ? 0 : in(0); break;
            case K::Dff: { auto it=state.find(f.key); q=it==state.end() ? 0 : it->second; break; }
            case K::Split4:
                for(int p=0;p<4;++p) f.values[p]=in(0)<0 ? in(0) : (in(0)>>p)&1;
                continue;
            case K::Pack4:
                q=0;
                for(int p=0;p<4;++p) { if(in(p)<0) { q=in(p); break; } q|=in(p)<<p; }
                break;
            default: throw std::runtime_error("Composite was not expanded.");
            }
            f.values[0]=q;
        }
    }
    Result run(const std::vector<int>& inputs, const State& state, bool tick, bool details) {
        if(inputs.size()!=input_nodes.size()) throw std::runtime_error("Input count does not match the circuit.");
        for(int i=0;i<int(inputs.size());++i) {
            auto& f = flat[input_nodes[i]];
            if(inputs[i]<0 || inputs[i]>=(1<<f.width)) throw std::runtime_error("Input value is outside its bus width.");
            f.values[0]=inputs[i];
        }
        State current;
        for(const auto& f : flat) if(f.kind==K::Dff) {
            auto it=state.find(f.key);
            int v=it==state.end() ? 0 : it->second;
            if(v<conflict || v>1) throw std::runtime_error("Memory state is not a bit.");
            current[f.key]=v;
        }
        settle(current);
        if(tick) {
            // Capture every old D before publishing any new Q.
            State next;
            for(const auto& f : flat) if(f.kind==K::Dff) next[f.key]=value(f.inputs[0]);
            current=std::move(next);
            settle(current);
        }
        Result result;
        for(auto r : outputs) result.outputs.push_back(value(r));
        if(details) for(const auto& [id, h] : visible) for(auto r : h.outputs) result.signals[id].push_back(value(r));
        if(details) for(const auto& [id, index] : contact_nodes) result.contacts[id]=flat[index].contact;
        result.state=std::move(current);
        result.primitives=int(flat.size());
        return result;
    }
};
void verify_lesson(const Circuit& c, const Level& l) {
    std::vector<Node> ins, outs;
    for(auto n : c.nodes) {
        if(n.kind==K::Input) ins.push_back(n);
        else if(n.kind==K::Output) outs.push_back(n);
        // Grade behavior, not the reference recipe. Old saves and alternative
        // constructions are valid; using the finished target itself is not.
        else if(n.kind==l.target && std::find(l.allowed.begin(),l.allowed.end(),n.kind)==l.allowed.end())
            throw std::runtime_error("Build " + component(n.kind).name + " from smaller parts instead of using the finished block.");
    }
    auto sort=[](Node a, Node b){return a.id<b.id;};
    std::sort(ins.begin(),ins.end(),sort); std::sort(outs.begin(),outs.end(),sort);
    const auto& spec=component(l.target);
    if(ins.size()!=spec.inputs.size() || outs.size()!=spec.outputs.size()) throw std::runtime_error("Keep all of the lesson's input and output terminals.");
    for(int i=0;i<int(ins.size());++i) if(ins[i].id!=i+1 || ins[i].width!=spec.inputs[i].width) throw std::runtime_error("Lesson input terminals have changed.");
    for(int i=0;i<int(outs.size());++i) if(outs[i].id!=i+50 || outs[i].width!=spec.outputs[i].width) throw std::runtime_error("Lesson output terminals have changed.");
}
} // namespace

Result simulate(const Circuit& circuit, const std::vector<int>& inputs, const State& state, bool tick) {
    try { return Compiled(circuit).run(inputs,state,tick,true); }
    catch(const std::exception& e) { Result r; r.error=e.what(); return r; }
}
Check check(const Circuit& circuit, int level_id) {
    Check result;
    try {
        const auto& l=level(level_id);
        verify_lesson(circuit,l);
        Compiled compiled(circuit);
        result.rows=test_vectors(level_id);
        result.total=int(result.rows.size());
        State state;
        for(auto& row : result.rows) {
            auto actual=compiled.run(row.inputs,state,row.tick,false);
            state=std::move(actual.state);
            row.actual=std::move(actual.outputs);
            row.passed=row.expected==row.actual;
            result.correct+=row.passed;
        }
        result.passed=result.correct==result.total;
        if(!result.passed) result.error="Not quite yet. Compare the highlighted actual and expected outputs, then follow the signals back.";
    } catch(const std::exception& e) { result.error=e.what(); }
    return result;
}
} // namespace signal_garden
