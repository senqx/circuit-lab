#include "signal/bridge.h"
#include "signal/engine.hpp"
#include <exception>
#include <stdexcept>

namespace {
using namespace signal_garden;
thread_local std::string response;
struct Handle { Circuit circuit; State state; std::string error; bool failed = false; };
std::string quote(const std::string& s) {
    std::string out="\"";
    for(unsigned char c : s) {
        if(c=='"' || c=='\\') { out+='\\'; out+=char(c); }
        else if(c=='\n') out+="\\n";
        else if(c=='\r') out+="\\r";
        else if(c=='\t') out+="\\t";
        else if(c<32) { const char* hex="0123456789abcdef"; out+="\\u00"; out+=hex[c>>4]; out+=hex[c&15]; }
        else out+=char(c);
    }
    return out+'"';
}
template<class T, class F> std::string array(const T& list, F fn) {
    std::string out="[";
    bool first=true;
    for(const auto& item : list) { if(!first) out+=','; first=false; out+=fn(item); }
    return out+']';
}
std::string ints(const std::vector<int>& v) { return array(v,[](int n){return std::to_string(n);}); }
std::string ports(const std::vector<Port>& v) {
    return array(v,[](const Port& p){return "{\"name\":"+quote(p.name)+",\"width\":"+std::to_string(p.width)+"}";});
}
std::string circuit_json(const Circuit& c) {
    return "{\"nodes\":"+array(c.nodes,[](const Node& n){
        return "{\"id\":"+std::to_string(n.id)+",\"kind\":"+quote(component(n.kind).key)+",\"width\":"+std::to_string(n.width)+"}";
    })+",\"wires\":"+array(c.wires,[](Wire w){
        return "{\"from\":"+std::to_string(w.from)+",\"output\":"+std::to_string(w.output)+",\"to\":"+std::to_string(w.to)+",\"input\":"+std::to_string(w.input)+"}";
    })+"}";
}
std::string row_json(const TestRow& r) {
    return "{\"inputs\":"+ints(r.inputs)+",\"expected\":"+ints(r.expected)+",\"actual\":"+ints(r.actual)+",\"tick\":"+(r.tick?"true":"false")+",\"passed\":"+(r.passed?"true":"false")+"}";
}
const char* error(const char* s) noexcept {
    try { response="{\"error\":"+quote(s)+"}"; return response.c_str(); }
    catch(...) { return "{\"error\":\"Engine could not allocate a response.\"}"; }
}
template<class F> const char* respond(F fn) {
    try { response=fn(); return response.c_str(); }
    catch(const std::exception& e) { return error(e.what()); }
    catch(...) { return error("Engine could not complete the request."); }
}
Handle& get(void* p) {
    if(!p) throw std::runtime_error("Missing circuit handle.");
    return *static_cast<Handle*>(p);
}
template<class F> int modify(void* p,F fn) {
    try { auto& h=get(p); fn(h); return 1; }
    catch(...) {
        if(p) {
            auto& h=*static_cast<Handle*>(p); h.failed=true;
            try { throw; }
            catch(const std::exception& e) { try { h.error=e.what(); } catch(...) {} }
            catch(...) {}
        }
        return 0;
    }
}
}
extern "C" {
const char* sg_catalog() { return respond([] {
    return "{\"version\":2,\"chapters\":"+array(chapters(),[](const Chapter& c){return "{\"name\":"+quote(c.name)+",\"goal\":"+quote(c.goal)+"}";})+",\"components\":"+array(components(),[](const Component& c){
        return "{\"key\":"+quote(c.key)+",\"name\":"+quote(c.name)+",\"description\":"+quote(c.description)+",\"symbol\":"+quote(c.symbol)+",\"inputs\":"+ports(c.inputs)+",\"outputs\":"+ports(c.outputs)+",\"sequential\":"+(is_sequential(c.kind)?"true":"false")+",\"inside\":"+((c.kind==Kind::Nmos||c.kind==Kind::Pmos||c.kind==Kind::Join||c.kind==Kind::PullDown||c.kind==Kind::Switch)?"true":"false")+",\"composite\":"+(c.definition.nodes.empty()?"false":"true")+"}";
    })+",\"levels\":"+array(levels(),[](const Level& l){
        auto vectors=test_vectors(l.id);
        int count=int(vectors.size());
        return "{\"id\":"+std::to_string(l.id)+",\"chapter\":"+std::to_string(l.chapter)+",\"title\":"+quote(l.title)+",\"subtitle\":"+quote(l.subtitle)+",\"story\":"+quote(l.story)+",\"goal\":"+quote(l.goal)+",\"concept\":"+quote(l.explanation)+",\"hints\":"+array(l.hints,[](const std::string& s){return quote(s);})+",\"scene\":"+quote(l.scene)+",\"steps\":"+array(l.steps,[](const std::string& s){return quote(s);})+",\"wireGoal\":"+std::to_string(l.solution.wires.size())+",\"target\":"+quote(component(l.target).key)+",\"allowed\":"+array(l.allowed,[](Kind k){return quote(component(k).key);})+",\"sequential\":"+(l.sequential?"true":"false")+",\"tests\":"+array(vectors,row_json)+",\"testCount\":"+std::to_string(count)+",\"exampleInputs\":"+array(l.example_inputs,ints)+",\"starter\":"+circuit_json(blank(l.target))+"}";
    })+"}";
}); }
const char* sg_reference(int id) { return respond([&]{return circuit_json(reference(id));}); }
void* sg_create() { try { return new Handle; } catch(...) { return nullptr; } }
void sg_destroy(void* p) { delete static_cast<Handle*>(p); }
int sg_node(void* p,int id,const char* kind,int width) { return modify(p,[&](Handle& h){
    if(!kind || h.circuit.nodes.size()>=512) throw std::runtime_error("Invalid part or too many parts.");
    h.circuit.nodes.push_back({id,kind_from_key(kind),width});
}); }
int sg_wire(void* p,int from,int output,int to,int input) { return modify(p,[&](Handle& h){
    if(h.circuit.wires.size()>=4096) throw std::runtime_error("Too many wires.");
    h.circuit.wires.push_back({from,output,to,input});
}); }
int sg_state(void* p,const char* key,int value) { return modify(p,[&](Handle& h){
    if(!key || std::string(key).size()>256 || h.state.size()>=32768) throw std::runtime_error("Invalid memory state.");
    h.state[key]=value;
}); }
const char* sg_simulate(void* p,const int* inputs,int count,int tick) { return respond([&]{
    auto& h=get(p);
    if(h.failed) throw std::runtime_error(h.error.empty()?"Could not build circuit.":h.error);
    if(count<0 || count>32 || (count>0 && !inputs)) throw std::runtime_error("Invalid inputs.");
    std::vector<int> values;
    if(count) values.assign(inputs,inputs+count);
    auto r=simulate(h.circuit,values,h.state,tick!=0);
    if(!r.error.empty()) throw std::runtime_error(r.error);
    std::string signals="{",state="{",contacts="{";
    for(const auto& [id,v] : r.signals) { if(signals.size()>1) signals+=','; signals+=quote(std::to_string(id))+":"+ints(v); }
    for(const auto& [key,v] : r.state) { if(state.size()>1) state+=','; state+=quote(key)+":"+std::to_string(v); }
    for(const auto& [id,v] : r.contacts) { if(contacts.size()>1) contacts+=','; contacts+=quote(std::to_string(id))+":"+std::to_string(v); }
    return "{\"outputs\":"+ints(r.outputs)+",\"signals\":"+signals+"},\"contacts\":"+contacts+"},\"state\":"+state+"},\"primitives\":"+std::to_string(r.primitives)+"}";
}); }
const char* sg_check(void* p,int id) { return respond([&]{
    auto& h=get(p);
    if(h.failed) throw std::runtime_error(h.error.empty()?"Could not build circuit.":h.error);
    auto r=check(h.circuit,id);
    return "{\"passed\":"+std::string(r.passed?"true":"false")+",\"total\":"+std::to_string(r.total)+",\"correct\":"+std::to_string(r.correct)+",\"error\":"+quote(r.error)+",\"rows\":"+array(r.rows,row_json)+"}";
}); }
}
