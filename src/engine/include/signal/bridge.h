#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/*! C ABI shared by native and WebAssembly clients.
    Strings are UTF-8 JSON, valid until the next string-returning call on this
    thread. Handles own their circuit and must be freed. No exception crosses C. */
const char* circuit_catalog(void);
const char* circuit_reference(int levelId);
void* circuit_create(void);
void circuit_destroy(void* p_circuit);
int circuit_node(void* p_circuit, int id, const char* p_kind, int width);
int circuit_wire(void* p_circuit, int from, int output, int to, int input);
int circuit_state(void* p_circuit, const char* p_key, int value);
const char* circuit_simulate(void* p_circuit, const int* p_inputs, int count, int tick);
const char* circuit_check(void* p_circuit, int levelId);

#ifdef __cplusplus
}

#endif
