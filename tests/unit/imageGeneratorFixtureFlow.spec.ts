import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FixtureImageGenerationProvider, fixtureScope } from '../../lib/imageGenerator/fixtureProvider';
import { processOneImageGeneration } from '../../lib/imageGenerator/worker';
import { processOneImageRefinement } from '../../lib/imageGenerator/refinementWorker';
import { createProfileStillDerivative } from '../../lib/imageGenerator/derivatives';

test('fixture settings fail closed outside a bounded local or disposable preview scope', () => {
  const base={ACCL_IMAGE_GENERATION_TEST_MODE:'fixtures',ACCL_IMAGE_GENERATION_FIXTURE_SCOPE:'test-run-001',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'};
  expect(fixtureScope(base)).toBe('test-run-001');
  expect(()=>fixtureScope({...base,NODE_ENV:'production'})).toThrow();
  expect(()=>fixtureScope({...base,NEXT_PUBLIC_SUPABASE_URL:'https://nlptviibefbzisyqswuv.supabase.co'})).toThrow();
  expect(()=>fixtureScope({...base,ACCL_IMAGE_GENERATION_FIXTURE_SCOPE:''})).toThrow();
  expect(()=>fixtureScope({...base,ACCL_IMAGE_GENERATION_TEST_MODE:'fixture'})).toThrow();
});

test('real worker, local PostgreSQL, fixture bytes, refinement, keep-two and Pro placement cost zero', async () => {
  test.skip(!process.env.PGLITE_MODULE, 'Set PGLITE_MODULE to the separate local database runtime.');
  const { createGeneratorTestDb }=await import(pathToFileURL(resolve('tests/helpers/generatorLocalDb.mjs')).href);
  const { localGeneratorClient }=await import(pathToFileURL(resolve('tests/helpers/generatorLocalStorage.mjs')).href);
  const db=await createGeneratorTestDb();
  const {client,objects}=localGeneratorClient(db);
  const provider=new FixtureImageGenerationProvider('fixture-flow-001');
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('Outbound network forbidden in fixture flow');};
  try {
    const owner='00000000-0000-4000-8000-000000000003';
    await db.query('insert into auth.users(id) values($1)',[owner]);
    await db.query('insert into profiles(id) values($1)',[owner]);
    await db.query("insert into membership_entitlements(user_id,entitlement) values($1,'membership_pro')",[owner]);
    const request=(await db.query("select create_image_generation_request_with_references($1,'A chess identity',3::smallint,'fixture-flow-start','{}'::uuid[],$2,$3) r",[owner,provider.name,provider.model])).rows[0].r;
    expect((await db.query('select claim_next_image_generation_request() r')).rows[0].r).toBeNull();
    expect((await db.query("select claim_next_image_generation_request('fixture:another-run') r")).rows[0].r).toBeNull();
    const result=await processOneImageGeneration(client as SupabaseClient,provider);
    expect(result,JSON.stringify(result)).toMatchObject({final_status:'review',candidate_count:3});
    expect(objects.size).toBe(3);
    const candidates=(await db.query('select * from image_generation_candidates where request_id=$1 order by ordinal',[request.id])).rows;
    const refine=await client.rpc('create_image_generation_refinement',{p_owner_id:owner,p_request_id:request.id,p_source_candidate_id:candidates[0].id,p_guidance:'Improve the lighting',p_idempotency_key:'fixture-guidance-flow'});
    expect(refine.error).toBeNull();
    expect((await db.query('select claim_next_image_generation_refinement() r')).rows[0].r).toBeNull();
    const refined=await processOneImageRefinement(client as SupabaseClient,provider);
    expect(refined,JSON.stringify(refined)).toMatchObject({final_status:'review'});
    const ids=candidates.slice(0,2).map((c:{id:string})=>c.id);
    await db.query('select approve_image_generation_candidates($1,$2,$3)',[owner,request.id,ids]);
    const bytes=objects.get(`image-generation-candidates/${candidates[0].storage_path}`);
    const icon=await createProfileStillDerivative(bytes,'profile_image');
    const background=await createProfileStillDerivative(bytes,'profile_background');
    expect([icon.width,icon.height,background.width,background.height]).toEqual([512,512,1600,900]);
    const placementArgs={p_owner_id:owner,p_candidate_id:ids[0],p_icon_storage_path:`${owner}/fixture-icon.webp`,p_icon_byte_size:icon.byteSize,p_background_storage_path:`${owner}/fixture-background.webp`,p_background_byte_size:background.byteSize};
    const placed=await client.rpc('place_approved_profile_image_set',placementArgs);
    expect(placed.error).toBeNull();
    expect((await client.rpc('place_approved_profile_image_set',placementArgs)).error).toBeNull();
    expect((await client.rpc('place_approved_profile_image_set',{...placementArgs,p_candidate_id:candidates[2].id})).error).not.toBeNull();
    expect((await client.rpc('place_approved_profile_image_set',{...placementArgs,p_owner_id:'00000000-0000-4000-8000-000000000004'})).error).not.toBeNull();
    const account=(await db.query('select lifetime_spent from generation_token_accounts where user_id=$1',[owner])).rows[0];
    expect(account.lifetime_spent).toBe(1);
    const cost=(await db.query('select sum(provider_cost_usd)::float cost from image_generation_cost_events where request_id=$1',[request.id])).rows[0];
    expect(cost.cost).toBe(0);
    expect((await db.query('select count(*)::integer n from image_saved_creations where generation_request_id=$1',[request.id])).rows[0].n).toBe(2);
  } finally {globalThis.fetch=oldFetch;await db.close();}
});
