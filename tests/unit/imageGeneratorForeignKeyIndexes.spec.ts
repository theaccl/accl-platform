import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260902152902_image_generation_foreign_key_indexes.sql'
  ),
  'utf8'
);

test('indexes both image-generation lineage foreign keys', () => {
  expect(migration).toContain(
    'create index image_generation_refinements_source_candidate_idx\n' +
      '  on public.image_generation_refinements (source_candidate_id);'
  );
  expect(migration).toContain(
    'create index image_generation_requests_parent_saved_creation_idx\n' +
      '  on public.image_generation_requests (parent_saved_creation_id);'
  );
  expect(migration.match(/create index/g)).toHaveLength(2);
});

test('keeps the index migration atomic', () => {
  expect(migration.trimStart()).toMatch(/^begin;/);
  expect(migration.trimEnd()).toMatch(/commit;$/);
});
