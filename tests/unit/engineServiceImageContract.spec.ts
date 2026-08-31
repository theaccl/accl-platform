import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

test('engine image requires an exact source revision and preserves the pinned non-root runtime', async () => {
  const dockerfile = await readFile(
    path.resolve(process.cwd(), 'services/stockfish-engine/Dockerfile'),
    'utf8'
  );
  expect(dockerfile).toContain('ARG ACCL_SOURCE_REVISION');
  expect(dockerfile).toContain('test "${#ACCL_SOURCE_REVISION}" -eq 40');
  expect(dockerfile).toContain('org.opencontainers.image.revision="$ACCL_SOURCE_REVISION"');
  expect(dockerfile).toContain('gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a');
  expect(dockerfile).toContain('USER 65532:65532');
  expect(dockerfile).not.toContain('org.opencontainers.image.revision="5d679638');
});
