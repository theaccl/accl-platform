/**
 * Build JSON body for Management API migration apply (stdout).
 * Usage: node scripts/apply-migration-psql-body.mjs <migration.sql> > body.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/apply-migration-psql-body.mjs <filename.sql>');
  process.exit(1);
}
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8');
const outPath = join(process.cwd(), 'tmp', 'migration-apply-body.json');
writeFileSync(outPath, JSON.stringify({ query: sql, read_only: false }), 'utf8');
console.log(outPath);
