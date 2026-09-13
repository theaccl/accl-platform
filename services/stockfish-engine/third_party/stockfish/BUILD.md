# Reproducible build record

Target: unmodified official Stockfish 18, Linux `x86-64-universal`, from commit `cb3d4ee9b47d0c5aae855b12379378ea1439675c` with the two network inputs recorded in `SOURCE.md`.

## Measured build

The native build completed on 2026-08-30 in an isolated Docker Linux/amd64 engine. Docker networking was disabled for compilation. The two pre-staged NNUE files were validated by the upstream `scripts/net.sh`; no network download occurred.

- builder: `docker.io/library/gcc@sha256:470d3decc32e6a67a14de00611b8b8f96d405a6c4b6ad7a028538792f7239e51`
- GCC/G++: `12.5.0`
- GNU ld/strip: `2.40`
- GNU Make: `4.3`
- builder glibc: `2.36-9+deb12u14`
- builder libstdc++: `12.2.0-14+deb12u1`
- build target: `make -j2 build ARCH=x86-64`
- release cleanup: upstream `make strip`
- PGO: not used
- source modifications: none
- executable size: `113122992` bytes
- executable SHA-256: `23219830b9789eba3c6b7921ea8f4e7567ee36b610e59e8839d8484d8f32462e`

The build stage is prepared by extracting the recorded source archive and placing the two validated network files in `src/`. The path-independent container command is:

```text
docker run --rm --network none \
  --mount type=bind,source=<staged-source>,target=/src \
  -w /src/src \
  gcc@sha256:470d3decc32e6a67a14de00611b8b8f96d405a6c4b6ad7a028538792f7239e51 \
  sh -lc 'make -j2 build ARCH=x86-64 && make strip'
```

Two independently staged clean builds produced the same byte length and SHA-256, establishing byte-for-byte reproducibility under this pinned recipe.

## Runtime compatibility and identity

The stripped executable was tested in:

`docker.io/library/debian@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171`

That runtime supplies glibc `2.36-9+deb12u14` and libstdc++ `12.2.0-14+deb12u1`. The executable is dynamically linked ELF64 x86-64 and ran successfully there. The only engine input was `uci` followed by `quit`; no position, search, benchmark, or PGO command ran. The identity output reported:

```text
id name Stockfish 18
id author the Stockfish developers (see AUTHORS file)
option name EvalFile type string default nn-c288c895ea92.nnue
option name EvalFileSmall type string default nn-37f18f62d772.nnue
uciok
```

The candidate executable remains outside tracked repository content in the isolated build-artifact area. On 2026-08-30 it entered the local-only engine image described below for controlled engineering verification. It has not entered a registry, publication, deployment, or distribution channel.

## Local service image recipe

- Node source stage: `docker.io/library/node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e`
- final runtime base: `gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f`
- platform: `linux/amd64`
- copied Node executable: `24.20.0`, SHA-256 `89af8424dd53e560b1933f87ba650d8bf57c83ca5a04600eefb31f416aabbae7`
- runtime identity: UID/GID `65532:65532`

Only `/usr/local/bin/node` is copied from the Node source stage. npm, Yarn, Perl, and the Node base filesystem do not enter the final runtime. Node's required standard Debian 12 runtime libraries are supplied by the pinned Distroless C++ base.

The final image digest, SBOM, vulnerability report, and runtime-verification result are deliberately recorded outside this embedded file in `ACCL_SLICE3_ENGINE_IMAGE_EVIDENCE.md`. Embedding the image's own digest or generated report hashes here would create an impossible self-referential build. Publication, deployment, and distribution remain prohibited pending the final external digest-bound P2 review.
