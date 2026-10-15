#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// Strings are UTF-8 JSON, valid until the next string-returning call on this
// thread. Handles own their circuit and must be freed. No exception crosses C.
const char* sg_catalog(void);
const char* sg_reference(int level_id);
void* sg_create(void);
void sg_destroy(void* circuit);
int sg_node(void* circuit, int id, const char* kind, int width);
int sg_wire(void* circuit, int from, int output, int to, int input);
int sg_state(void* circuit, const char* key, int value);
const char* sg_simulate(void* circuit, const int* inputs, int count, int tick);
const char* sg_check(void* circuit, int level_id);

#ifdef __cplusplus
}
#endif
