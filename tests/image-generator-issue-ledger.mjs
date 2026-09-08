// Local PostgreSQL WASM regression probe. Uses no Supabase account or network.
// Set PGLITE_MODULE to an installed @electric-sql/pglite module file, or install
// that package in a separate test runtime. No application dependency is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const read = (name) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const base = read('20260831050722_accl_generation_tokens_and_tiers.sql');
const economy = read('20260831060000_generation_token_economy_enforcement.sql');
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.image_generation_requests(id uuid primary key, owner_id uuid, token_state text, updated_at timestamptz);
`);
await db.exec(base.slice(0, base.indexOf('create function public.adjust_generation_token_balance')) + 'commit;');
await db.exec('alter table generation_token_accounts add column reserved integer not null default 0 check(reserved >= 0);');
await db.exec(economy.slice(economy.indexOf('alter table public.generation_token_ledger'), economy.indexOf('create table public.generation_token_weekly_mints')));
await db.exec(economy.slice(economy.indexOf('create or replace function public.transition_generation_token_redemption'), economy.indexOf('create or replace function public.create_image_generation_request')));
await db.exec(read('20260908190222_image_generation_issue_reviews.sql'));

const owner = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const moderator = '00000000-0000-4000-8000-000000000003';
await db.query('insert into auth.users values ($1),($2),($3)', [owner, stranger, moderator]);
async function fixture(index, cost = 1, state = 'spent') {
  const id = `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  await db.query('insert into image_generation_requests values ($1,$2,$3,now())', [id, owner, 'reserved']);
  await db.query(`insert into generation_token_accounts(user_id,reserved) values ($1,$2)
    on conflict(user_id) do update set reserved=generation_token_accounts.reserved+excluded.reserved`, [owner, cost]);
  await db.query(`insert into generation_token_redemptions(generation_request_id,user_id,membership_tier,token_cost,state,spent_at)
    values ($1,$2,$3,$4,'reserved',null)`, [id, owner, cost ? 'plus' : 'internal_unlimited', cost]);
  if (state !== 'reserved') await db.query("select transition_generation_token_redemption($1,'spend')", [id]);
  return id;
}
async function submit(id, method = 'manual', user = owner) {
  return (await db.query('select (public.submit_image_generation_issue($1,$2,$3,$4,$5)).*', [id, user, 'technical_failure', 'All candidates contain a confirmed rendering defect.', method])).rows[0];
}
async function resolve(id, decision = 'approved', type = 'manual') {
  return (await db.query('select (public.resolve_image_generation_issue($1,$2,$3,$4,$5,$6)).*',
    [id, decision, type, type === 'manual' ? moderator : null, 'Reviewed the evidence and confirmed the decision.', null])).rows[0];
}
async function balance() { return (await db.query('select balance from generation_token_accounts where user_id=$1', [owner])).rows[0]?.balance ?? 0; }

try {
  const id = await fixture(1);
  await assert.rejects(() => submit(id, 'manual', stranger), /Generation not found/);
  const report = await submit(id);
  assert.equal(await balance(), 0, 'Submitting must not return the spent token');
  assert.equal((await submit(id, 'ai')).id, report.id, 'Duplicate report must keep the original review choice');
  assert.equal((await resolve(report.id)).replacement_amount, 1);
  assert.equal((await resolve(report.id)).replacement_amount, 1);
  await db.query("select transition_generation_token_redemption($1,'refund')", [id]);
  assert.equal(await balance(), 1, 'Repeated review and later automatic refund cannot duplicate credit');
  const account = (await db.query('select lifetime_spent,lifetime_earned from generation_token_accounts where user_id=$1', [owner])).rows[0];
  assert.deepEqual(account, { lifetime_spent: 1, lifetime_earned: 0 }, 'Replacement preserves spending history and is not an earned allowance');
  assert.equal((await db.query("select count(*)::int as n from generation_token_ledger where event_type='commission_spend' and generation_request_id=$1", [id])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from generation_token_ledger where event_type='generator_issue_replacement'")).rows[0].n, 1);
  assert.equal((await resolve(report.id, 'rejected')).status, 'approved', 'Final decisions are immutable');

  const returnedId = await fixture(2);
  await db.query("select transition_generation_token_redemption($1,'refund')", [returnedId]);
  assert.equal((await resolve((await submit(returnedId)).id)).replacement_amount, 0, 'Previously returned token is ineligible');
  assert.equal((await resolve((await submit(await fixture(3, 0))).id)).replacement_amount, 0, 'Unlimited has no spent token to replace');
  const denied = await submit(await fixture(4));
  assert.equal((await resolve(denied.id, 'rejected')).replacement_amount, 0);
  const ai = await submit(await fixture(5), 'ai');
  await db.query('select claim_image_generation_issue_ai($1,$2)', [ai.id, 'synthetic/vision-model']);
  const replayClaim = await db.query('select (claim_image_generation_issue_ai($1,$2)).id', [ai.id, 'synthetic/vision-model']);
  assert.equal(replayClaim.rows[0].id, null, 'A duplicate call cannot start a second AI assessment');
  assert.equal((await resolve(ai.id, 'approved', 'ai')).replacement_amount, 1);
  const uncertain = await submit(await fixture(6), 'ai');
  await db.query('select claim_image_generation_issue_ai($1,$2)', [uncertain.id, 'synthetic/vision-model']);
  assert.equal((await resolve(uncertain.id, 'pending_manual', 'ai')).status, 'pending_manual');
  assert.equal((await resolve(uncertain.id, 'approved', 'ai')).status, 'pending_manual', 'Late AI cannot override handoff');
  assert.equal((await resolve(uncertain.id)).replacement_amount, 1);
  const expired = await submit(await fixture(7), 'ai');
  await db.query('select claim_image_generation_issue_ai($1,$2)', [expired.id, 'synthetic/vision-model']);
  await db.query("update image_generation_issue_reports set ai_deadline=now()-interval '1 second' where id=$1", [expired.id]);
  assert.equal((await resolve(expired.id, 'approved', 'ai')).replacement_amount, 0, 'Expired AI lease cannot approve');
  const reserved = await fixture(8, 1, 'reserved');
  await assert.rejects(() => submit(reserved), /has not spent/);
  await db.exec('set role authenticated');
  await assert.rejects(() => submit(id), /permission denied/);
  await assert.rejects(() => resolve(report.id), /permission denied/);
  await assert.rejects(() => db.query('select * from image_generation_issue_reports'), /permission denied/);
  await db.exec('reset role');
  console.log('PASS: local PostgreSQL report ownership, eligibility, AI claims/handoff/timeout, manual decisions, replay, restitution, Unlimited, and browser privilege denial.');
} finally { await db.close(); }
