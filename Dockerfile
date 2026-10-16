FROM emscripten/emsdk:4.0.15 AS builder
WORKDIR /src
COPY CMakeLists.txt LICENSE ./
COPY src/engine/ src/engine/
COPY src/ui/ src/ui/
COPY scripts/build_app.py scripts/build_app.py
RUN emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build-wasm --parallel 2 \
    && python3 scripts/build_app.py --skip-compile

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /src/dist/app/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
