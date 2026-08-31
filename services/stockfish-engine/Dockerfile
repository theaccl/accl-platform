FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS node-runtime-source

FROM node-runtime-source AS payload

COPY --chown=0:0 --chmod=0555 services/stockfish-engine/dist/index.js /payload/app/index.js
COPY --chown=0:0 --chmod=0444 services/stockfish-engine/dist/licenses.txt /payload/app/licenses.txt
COPY --chown=0:0 --chmod=0555 services/stockfish-engine/build-input/stockfish /payload/opt/stockfish/stockfish
COPY --chown=0:0 services/stockfish-engine/third_party/stockfish/ /payload/usr/share/doc/accl-stockfish/

RUN find /payload/usr/share/doc/accl-stockfish -type d -exec chmod 0555 {} + \
    && find /payload/usr/share/doc/accl-stockfish -type f -exec chmod 0444 {} +

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f

LABEL org.opencontainers.image.title="ACCL Stockfish Engine Runtime" \
      org.opencontainers.image.description="Private bounded Stockfish runtime for ACCL" \
      org.opencontainers.image.revision="5d679638dfd2c0816afd86b9d49598aa7610ab9c"

ENV NODE_ENV=production \
    PORT=8080 \
    ENGINE_WORKER_COUNT=2 \
    ENGINE_QUEUE_CAPACITY=8 \
    ENGINE_CLOUD_RUN_CONCURRENCY=32 \
    ENGINE_REQUEST_TIMEOUT_SECONDS=30 \
    ENGINE_THREADS_PER_WORKER=1 \
    ENGINE_HASH_MIB_PER_WORKER=128 \
    STOCKFISH_BINARY_PATH=/opt/stockfish/stockfish \
    STOCKFISH_BINARY_SHA256=23219830b9789eba3c6b7921ea8f4e7567ee36b610e59e8839d8484d8f32462e

COPY --from=node-runtime-source --chown=0:0 --chmod=0555 /usr/local/bin/node /usr/local/bin/node
COPY --from=payload /payload/ /

WORKDIR /app

USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:8080/healthz/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["/usr/local/bin/node", "/app/index.js"]
