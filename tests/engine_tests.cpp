#include "signal/engine.hpp"
#include "signal/bridge.h"
#include <iostream>
#include <algorithm>
#include <csignal>
#include <stdexcept>
#include <string>

using namespace signal_garden;
using K=Kind;
int assertions=0;
void expect(bool condition,const std::string& message) {
    ++assertions;
    if(!condition) throw std::runtime_error(message);
}
Circuit chip(K kind) {
    auto c=blank(kind);
    c.nodes.push_back({100,kind});
    const auto& s=component(kind);
    for(int i=0;i<int(s.inputs.size());++i) c.wires.push_back({i+1,0,100,i});
    for(int i=0;i<int(s.outputs.size());++i) c.wires.push_back({100,i,i+50,0});
    return c;
}
int main() {
    try {
        for(const auto& l:levels()) {
            auto r=check(reference(l.id),l.id);
            expect(r.passed,"Reference lesson "+std::to_string(l.id)+": "+r.error);
            expect(r.correct==r.total && r.total>0,"Every lesson checks at least one case");
            expect(r.rows.size()==size_t(r.total),"Checking preserves every expected and actual row for the UI");
            const auto vectors=test_vectors(l.id);
            for(const auto& input:l.example_inputs)
                expect(std::any_of(vectors.begin(),vectors.end(),[&](const TestRow& row){return row.inputs==input;}),"Teaching examples belong to the public specification");
            std::cout<<"Lesson "<<l.id<<" "<<l.title<<": "<<r.correct<<" / "<<r.total<<"\n";
        }
        expect(levels()[3].target==K::Nand && levels()[4].target==K::Not && levels()[5].target==K::And,"NAND is the first gate in the journey, before NOT and AND");
        expect(level(4).target==K::Not && level(5).target==K::And && level(6).target==K::Nand,"Existing lesson IDs stay stable after reordering");
        auto and_nands=blank(K::And);
        and_nands.nodes.push_back({100,K::Nand});and_nands.nodes.push_back({101,K::Nand});
        and_nands.wires={{1,0,100,0},{2,0,100,1},{100,0,101,0},{100,0,101,1},{101,0,50,0}};
        expect(check(and_nands,5).passed,"AND made from two NANDs passes every row");
        and_nands.nodes.push_back({102,K::Not});
        expect(check(and_nands,5).passed,"An unused unwired spare does not fail a correct circuit");
        auto legacy_nand=blank(K::Nand);
        legacy_nand.nodes.push_back({100,K::And});legacy_nand.nodes.push_back({101,K::Not});
        legacy_nand.wires={{1,0,100,0},{2,0,100,1},{100,0,101,0},{101,0,50,0}};
        expect(check(legacy_nand,6).passed,"Previously saved AND-plus-NOT NAND circuits still pass");
        for(auto kind : {K::Not,K::And,K::Or,K::Xor}) {
            const auto& definition=component(kind).definition;
            expect(std::any_of(definition.nodes.begin(),definition.nodes.end(),[](Node n){return n.kind==K::Nand;}),"Logic definitions build on NAND");
        }
        // Check transistor physics independently, including disconnected drivers.
        auto n=chip(K::Nmos), p=chip(K::Pmos), j=chip(K::Join);
        expect(simulate(n,{0,1}).outputs==std::vector<int>{floating},"nMOS off is Z");
        expect(simulate(n,{1,0}).outputs==std::vector<int>{0},"nMOS conducts low");
        expect(simulate(p,{0,1}).outputs==std::vector<int>{1},"pMOS conducts high");
        expect(simulate(p,{1,0}).outputs==std::vector<int>{floating},"pMOS off is Z");
        expect(simulate(chip(K::Gate),{0,1}).contacts.at(100)==1,"Closed switch passes a zero too");
        expect(simulate(chip(K::Gate),{1,0}).contacts.at(100)==0,"Normal switch opens at zero");
        expect(simulate(chip(K::ClosedGate),{0,0}).contacts.at(100)==1,"Reverse switch closes at zero even without a high signal");
        expect(simulate(chip(K::ClosedGate),{1,1}).contacts.at(100)==0,"Reverse switch opens at one");
        auto no_control=chip(K::Gate);no_control.wires.erase(no_control.wires.begin()+1);
        expect(simulate(no_control,{1,0}).contacts.at(100)==unknown,"Missing control leaves the contact unknown");
        expect(simulate(j,{0,1}).outputs==std::vector<int>{conflict},"Opposing drivers conflict");
        auto broken=reference(5);
        broken.wires.pop_back();
        expect(!check(broken,5).passed,"Missing output fails");
        auto duplicate=reference(5); duplicate.wires.push_back(duplicate.wires[0]);
        expect(!simulate(duplicate,{0,0}).error.empty(),"Multiple drivers rejected");
        auto wrong=reference(5); wrong.nodes[0].width=4;
        expect(!simulate(wrong,{0,0}).error.empty(),"Bus mismatch rejected");
        wrong=reference(5); wrong.nodes.push_back(wrong.nodes[0]);
        expect(!simulate(wrong,{0,0}).error.empty(),"Duplicate IDs rejected");
        wrong=reference(5); wrong.wires[0].output=8;
        expect(!simulate(wrong,{0,0}).error.empty(),"Invalid output port rejected");
        wrong=reference(5); wrong.wires[0].input=-1;
        expect(!simulate(wrong,{0,0}).error.empty(),"Negative input port rejected");
        wrong=reference(5); wrong.wires[0].from=999;
        expect(!simulate(wrong,{0,0}).error.empty(),"Missing part rejected");
        auto cheat=chip(K::And);
        expect(!check(cheat,5).passed,"Target chip cannot solve its own lesson");
        auto cycle=blank(K::Not);
        cycle.nodes.push_back({100,K::Not}); cycle.wires={{100,0,100,0},{100,0,50,0}};
        expect(!simulate(cycle,{0}).error.empty(),"Combinational cycle rejected");
        auto chain=blank(K::Bit);
        chain.nodes.push_back({100,K::Dff}); chain.nodes.push_back({101,K::Dff});
        chain.wires={{1,0,100,0},{100,0,101,0},{101,0,50,0}};
        auto first=simulate(chain,{1},{},true);
        expect(first.outputs==std::vector<int>{0},"Clock captures simultaneously");
        expect(simulate(chain,{0},first.state,true).outputs==std::vector<int>{1},"Second clock moves prior bit");
        expect(simulate(chain,{0},first.state,false).outputs==std::vector<int>{0},"No tick preserves state");
        auto reordered=chain;
        std::swap(reordered.nodes[2],reordered.nodes[3]);
        expect(simulate(reordered,{0},first.state,true).outputs==std::vector<int>{1},"State keys survive node reordering");
        auto bad_state=first.state;
        bad_state["100"]=12;
        expect(!simulate(chain,{0},bad_state).error.empty(),"Invalid memory state rejected");
        auto feedback=blank(K::Bit);
        feedback.nodes.push_back({100,K::Dff}); feedback.nodes.push_back({101,K::Not});
        feedback.wires={{100,0,101,0},{101,0,100,0},{100,0,50,0}};
        auto f1=simulate(feedback,{0},{},true);
        expect(f1.error.empty() && f1.outputs==std::vector<int>{1},"Clocked feedback is legal");
        expect(simulate(feedback,{0},f1.state,true).outputs==std::vector<int>{0},"Clocked feedback toggles");
        auto incomplete=chip(K::Nmos); incomplete.wires.pop_back();
        expect(simulate(incomplete,{1,1}).outputs==std::vector<int>{unknown},"Unconnected is distinct from floating");
        auto wrong_terminal=reference(1); wrong_terminal.nodes[0].id=8;
        expect(!check(wrong_terminal,1).passed,"Lesson interface cannot be renamed");
        Circuit too_large;
        for(int i=1;i<=513;++i) too_large.nodes.push_back({i,K::High});
        expect(!simulate(too_large,{}).error.empty(),"Graph size limit is enforced");
        auto many_chips=blank(K::Bit);
        for(int i=100;i<150;++i) many_chips.nodes.push_back({i,K::Cpu4});
        expect(!simulate(many_chips,{0}).error.empty(),"Expanded primitive limit is enforced");
        expect(!simulate(n,{2,0}).error.empty(),"Invalid input value rejected");
        expect(!simulate(n,{0}).error.empty(),"Invalid input count rejected");
        auto circuit=reference(8);
        auto r=simulate(circuit,{1,0});
        expect(r.outputs==std::vector<int>{1},"XOR 1,0");
        circuit.wires.back().from=1;
        expect(!check(circuit,8).passed,"Behaviorally wrong but valid circuit fails");
        expect(std::string(sg_reference(-1)).find("error")!=std::string::npos,"C ABI contains invalid level exception");
        expect(std::string(sg_check(nullptr,1)).find("error")!=std::string::npos,"C ABI contains null handle exception");
        void* handle=sg_create();
        expect(handle!=nullptr,"C ABI creates a handle");
        expect(sg_node(handle,1,"BOGUS",1)==0,"C ABI rejects unknown component");
        expect(std::string(sg_check(handle,1)).find("Unknown component")!=std::string::npos,"C ABI retains builder error");
        sg_destroy(handle);
        std::cout<<"Passed "<<assertions<<" assertions.\n";
    } catch(const std::exception& e) { std::cerr<<"FAIL: "<<e.what()<<"\n"; return 1; }
}
