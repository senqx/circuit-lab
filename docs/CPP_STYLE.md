# C++ conventions

The engine, native example, and C++ tests share these conventions. The configured
standard is C++17; newer language features require a deliberate toolchain change.
The existing CMake/CTest setup remains the test runner.

- Two-space indentation, K&R braces, and braces on every conditional and loop.
- Prefer lines under 80 characters; 120 is the maximum.
- Types and enum values use PascalCase; functions, variables, and constants use
  camelCase. ALL_CAPS is reserved for macros.
- Class members use `m_`. Raw pointers use `p_`, including pointers to const;
  non-const references use `r_`. Combine member prefixes as `mp_` and `mr_`.
  Const references and smart pointers have no pointer/reference prefix. Struct
  fields have no `m_` prefix. Preserve canonical forms such as `main` arguments.
- Use west const and attach pointer/reference symbols to the type. Compare raw
  pointers explicitly with `nullptr`.
- Prefer explicit domain types; use `auto` for iterators, structured bindings,
  lambdas, and initializers whose type is already clear.
- Pass small values by copy and larger borrowed values by const reference. Use
  RAII and moves for ownership; the opaque C handle has an explicit destroy API.
- Public declarations live in `.h` files, with concise Doxygen documentation.
  Implementation comments explain non-obvious constraints and avoid repeating
  the header documentation.
- Use assertions for internal invariants and exceptions for invalid input. The
  C ABI catches all exceptions and preserves an error result even if allocating
  the diagnostic fails.

`.clang-format` targets clang-format 20 and covers the mechanical layout. For
example, from the repository root:

```sh
clang-format -i src/engine/include/signal/*.h src/engine/src/*.cpp \
  examples/native.cpp tests/engine_tests.cpp
```

Review details that clang-format cannot fully express: wrapped function/lambda
signatures start their arguments on the next line with four-space continuation
indentation, and place the opening brace on its own line. Constructor bodies
with member initializer lists also start with a separate brace. Short signatures
retain K&R braces. Wrapped aggregates put each field on its own line and close
on a separate line; wrapped calls close beside their last argument unless it is
itself a multiline block. Keep member access together and separate distinct
logical blocks with blank lines.

The public C++ interface is `signal/engine.h` in namespace `circuit`, with names
such as `kindFromKey`, `isSequential`, and `testVectors`. Native C++ consumers of
the earlier header/namespace must update their includes and identifiers and
rebuild. The C ABI uses conventional prefixed names such as `circuit_create`,
shared by the Python and WebAssembly adapters. See [C ABI integration](ENGINE.md#c-abi)
when updating an external consumer. JSON keys, component keys, and lesson IDs
are compatibility contracts, independent of C++ naming conventions.
