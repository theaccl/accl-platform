import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export async function createGeneratorTestDb() {
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);
create table public.profiles(id uuid primary key,avatar_url text,avatar_path text,profile_background_url text);
create table public.player_badge_state(user_id uuid,peak_rank_band integer);
create table public.tournament_entries(id uuid primary key default gen_random_uuid(),user_id uuid,tournament_id uuid,unique(user_id,tournament_id));
`);
const migrations = [
 '20260830185514_image_generator_slice_1_foundation.sql',
 '20260830201229_image_generator_slice_1_advisor_hardening.sql',
 '20260830214500_pro_billing_image_generator_entitlement.sql',
 '20260830230000_image_generation_worker_retry_schedule.sql',
 '20260830233000_image_generation_moderation_safety.sql',
 '20260830234500_profile_imagery_derivatives.sql',
 '20260831015904_image_generation_reference_inputs.sql',
 '20260831050722_accl_generation_tokens_and_tiers.sql',
 '20260831052551_internal_generator_unlimited_grants.sql',
 '20260831053706_internal_unlimited_pending_email_allowlist.sql',
 '20260831060000_generation_token_economy_enforcement.sql',
 '20260831063000_generation_tier_reference_and_placement_contracts.sql',
 '20260831064500_allow_multiple_references_per_request.sql',
 '20260831070000_generation_guided_refinements.sql',
 '20260831072000_saved_creation_lineage.sql',
 '20260831165125_image_generation_cost_controls.sql',
 '20260831173500_pro_anniversary_token_issuance.sql',
 '20260902150716_image_generation_durable_idempotent_replays.sql',
 '20260908190222_image_generation_issue_reviews.sql',
 '20260909080215_generator_launch_wallets.sql',
 '20260909080817_generator_launch_retained_candidates.sql',
 '20260909081123_generator_fixture_queue_isolation.sql',
 '20260909081714_launch_membership_billing_and_battlefield.sql',
];

for(const name of migrations) { try { await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8')); } catch(error) { await db.close(); throw new Error(`${name}: ${error.message}`); } }
return db;
}
