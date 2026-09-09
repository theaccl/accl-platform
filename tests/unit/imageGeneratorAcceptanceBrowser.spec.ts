import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { GENERATOR_TIER_CONTRACTS, type GeneratorMembershipTier } from '../../lib/imageGenerator/membership';

const generationId = '480a7a7c-f741-43d5-866d-cb2aa72fcf3e';
const ownerId = '90db2a68-98b4-46ad-8131-72fbc2174e97';
const candidateIds = [1, 2, 3, 4, 5].map((ordinal) => `bcc60e79-4434-40cb-abd8-${String(ordinal).padStart(12, '0')}`);

async function privateReview(page: Page, baseURL: string | undefined, options: {
  accountTier?: GeneratorMembershipTier;
  commissionTier?: GeneratorMembershipTier;
  reducedMotion?: boolean;
  approved?: boolean;
  placementFailure?: boolean;
  launch?: boolean;
} = {}) {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Synthetic acceptance tests must run against localhost');
  }
  const accountTier = options.accountTier ?? 'plus';
  const commissionTier = options.commissionTier ?? 'plus';
  const count = options.launch ? GENERATOR_TIER_CONTRACTS[commissionTier].initialCandidates : commissionTier === 'plus' ? 4 : commissionTier === 'pro' ? 5 : 3;
  let acceptedIds = [candidateIds[0]];
  const user = { id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'synthetic-owner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: ownerId, exp: expiresAt, aud: 'authenticated' })}.synthetic-signature`, refresh_token: 'synthetic-refresh', expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user };
  const authHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  await page.addInitScript(({ key, value }) => { document.cookie = `${key}=${value}; path=/; SameSite=Lax`; }, {
    key: `sb-${authHost.split('.')[0]}-auth-token`, value: `base64-${encode(session)}`,
  });
  await page.emulateMedia({ reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference' });
  const fixture = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#57337a' } }).png().toBuffer();
  const state = { accepted: options.approved === true, presentationClaims: 0, firstReveals: 0, placements: [] as unknown[], pageErrors: [] as string[] };
  page.on('pageerror', (error) => state.pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/auth/v1/')) return json(user);
    if (url.pathname.startsWith('/rest/v1/')) return json([]);
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (url.pathname === '/synthetic-candidate.png') return route.fulfill({ contentType: 'image/png', body: fixture });
    if (url.pathname === '/api/image-generations/entitlements') return json({ image_generator: true, can_commission: true, membership_tier: accountTier, generator_contract: GENERATOR_TIER_CONTRACTS[accountTier], generation_tokens: { balance: 1, unlimited: false } });
    if (url.pathname === `/api/image-generations/${generationId}`) return json({
      generation: { id: generationId, status: state.accepted ? 'approved' : 'review', membership_tier: commissionTier, keep_limit: options.launch ? GENERATOR_TIER_CONTRACTS[commissionTier].keepLimit : 1 },
      candidates: candidateIds.slice(0, count).map((id, index) => ({ id, ordinal: index + 1, status: state.accepted ? acceptedIds.includes(id) ? 'approved' : 'rejected' : 'review' })), refinements: [],
    });
    if (url.pathname.endsWith('/access')) return json({ url: `${baseURL}/synthetic-candidate.png` });
    if (url.pathname.endsWith('/presentation')) {
      state.presentationClaims += 1;
      const ids = state.firstReveals++ === 0 ? candidateIds.slice(0, count) : [];
      return json({ first_presentation_candidate_ids: ids });
    }
    if (url.pathname.endsWith('/approve')) { acceptedIds = request.postDataJSON().candidate_ids; state.accepted = true; return json({ approved: true }); }
    if (url.pathname === '/api/profile/imagery' || url.pathname === '/api/profile/imagery/set') {
      state.placements.push(request.postDataJSON());
      return options.placementFailure && state.placements.length === 1
        ? json({ error: 'Synthetic temporary placement failure' }, 500) : json({ placement: {}, placements: {} });
    }
    if (url.pathname.startsWith('/api/')) return json({});
    return route.continue();
  });
  await page.goto(`/image-generator?generation=${generationId}`);
  await expect(page.locator('[data-presentation-phase]')).toHaveCount(state.accepted ? 1 : count);
  return state;
}

test('launch Pro keeps two only after explicit confirmation, then offers either retained image for placement', async ({ page, baseURL }) => {
  const state = await privateReview(page, baseURL, { commissionTier: 'pro', launch: true, reducedMotion: true });
  await page.getByRole('button', { name: 'Keep candidate', exact: true }).nth(0).click();
  expect(state.accepted).toBe(false);
  await page.getByRole('button', { name: 'Keep candidate', exact: true }).nth(0).click();
  await expect(page.getByRole('button', { name: 'Keep candidate', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Accept 2 selections', exact: true }).click();
  await expect(page.locator('[data-presentation-phase="accepted_still"]')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'Candidate 2', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Candidate 2', exact: true }).check();
  expect(state.placements).toHaveLength(0);
  await page.getByRole('button', { name: 'Place matching icon + background', exact: true }).click();
  expect(state.placements[0]).toMatchObject({ candidate_id: candidateIds[1] });
});

test('synthetic accept-and-place stops every candidate motion and recovers the approved winner', async ({ page, baseURL }) => {
  const state = await privateReview(page, baseURL, { placementFailure: true });
  await expect(page.locator('[data-presentation-phase="reveal"]')).toHaveCount(4);
  const loadedImage = await page.getByAltText('Generated candidate 1', { exact: true }).elementHandle();
  await page.getByRole('button', { name: 'Accept candidate', exact: true }).first().click();
  await expect(page.locator('[data-presentation-phase="accepted_still"]')).toHaveCount(1);
  await expect(page.locator('[data-presentation-phase="rejected_still"]')).toHaveCount(3);
  await expect(page.locator('[data-presentation-phase="reveal"], [data-presentation-phase="holding"]')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await loadedImage?.evaluate((element) => element.isConnected)).toBe(true);
  const moving = await page.locator('[data-presentation-phase]').evaluateAll((cards) => cards.flatMap((card) => card.getAnimations({ subtree: true })).filter((animation) => animation.playState === 'running').map((animation) => ({
    target: ((animation.effect as KeyframeEffect).target as Element)?.tagName,
    properties: (animation.effect as KeyframeEffect).getKeyframes().map((frame) => Object.keys(frame)),
  })));
  expect(moving).toEqual([]);
  await page.getByRole('button', { name: 'Use as profile icon' }).click();
  await expect(page.getByText('Synthetic temporary placement failure')).toBeVisible();
  await page.getByRole('button', { name: 'Use as profile icon' }).click();
  await expect(page.getByText('Your accepted image is now placed as your profile icon.')).toBeVisible();
  expect(state.placements).toEqual(Array(2).fill({ candidate_id: candidateIds[0], surface: 'profile_image' }));
  await page.reload();
  await expect(page.locator('[data-presentation-phase="accepted_still"]')).toHaveCount(1);
  await expect(page.locator('[data-presentation-phase]')).toHaveCount(1);
  expect(state.presentationClaims).toBe(1);
  expect(state.pageErrors).toEqual([]);
});

test('synthetic reduced-motion review stays still and reload does not repeat first reveal', async ({ page, baseURL }) => {
  const state = await privateReview(page, baseURL, { reducedMotion: true });
  await expect(page.locator('[data-presentation-phase="still"]')).toHaveCount(4);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-presentation-phase="still"]')).toHaveCount(4);
  expect(state.presentationClaims).toBe(2);
  expect(state.pageErrors).toEqual([]);
});

test('synthetic recovered Pro commission keeps matching-set placement after downgrade', async ({ page, baseURL }) => {
  const state = await privateReview(page, baseURL, { accountTier: 'free', commissionTier: 'pro', approved: true });
  await page.getByRole('button', { name: 'Place matching icon + background' }).click();
  await expect(page.getByText('Your coordinated profile icon and background are now placed.')).toBeVisible();
  expect(state.placements).toEqual([{ candidate_id: candidateIds[0] }]);
  expect(state.presentationClaims).toBe(0);
  expect(state.pageErrors).toEqual([]);
});

test('synthetic recovered Plus commission retains single-placement choices after upgrade', async ({ page, baseURL }) => {
  const state = await privateReview(page, baseURL, { accountTier: 'pro', commissionTier: 'plus', approved: true });
  await expect(page.getByRole('button', { name: 'Place matching icon + background' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use as profile background' }).click();
  await expect(page.getByText('Your accepted image is now placed as your profile background.')).toBeVisible();
  expect(state.placements).toEqual([{ candidate_id: candidateIds[0], surface: 'profile_background' }]);
  expect(state.pageErrors).toEqual([]);
});

for (const method of ['manual', 'ai']) test(`generator issue ${method} submission survives a lost response and shows the replacement`, async ({ page, baseURL }, testInfo) => {
  const state = await privateReview(page, baseURL, { approved: true });
  let report: Record<string, unknown> | null = null;
  let submissions = 0;
  await page.route(`**/api/image-generations/${generationId}/issues`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.review_method).toBe(method);
      expect(body).not.toHaveProperty('replacement_amount');
      report ??= { id: 'synthetic-report', request_id: generationId, ...body, status: 'pending_manual', replacement_amount: 0,
        resolution_note: method === 'ai' ? 'AI could not confidently complete this review. Your report is waiting for manual review.' : null };
      submissions++;
      if (submissions === 1) return route.abort('failed');
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ report }) });
  });
  await page.getByRole('button', { name: 'Report a generator issue', exact: true }).click();
  await page.getByLabel('What went wrong?').fill('All candidates contain the same rendering defect.');
  await page.getByLabel('Review method', { exact: true }).selectOption(method);
  await page.getByRole('button', { name: 'Submit issue report', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Submit issue report', exact: true }).click();
  await expect(page.getByText('Waiting for manual review.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Report a generator issue', exact: true }).click();
  await expect(page.getByText('Waiting for manual review.', { exact: true })).toBeVisible();
  report = { ...(report ?? {}), status: 'approved', replacement_amount: 1, resolution_note: 'Confirmed the rendering defect.' };
  await page.route('**/api/image-generations/entitlements', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    image_generator: true, can_commission: true, membership_tier: 'plus', generator_contract: GENERATOR_TIER_CONTRACTS.plus,
    generation_tokens: { balance: 2, unlimited: false },
  }) }));
  await page.getByRole('button', { name: 'Refresh report status' }).click();
  await expect(page.getByText('Issue confirmed — 1 token replaced.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-wallet="generation"] [data-wallet-total]')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Submit issue report', exact: true })).toHaveCount(0);
  expect(state.pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`generator-issue-${method}.png`), fullPage: true });
});

test('generator issue endpoints reject signed-out owner and moderator requests', async ({ request, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Local checks only');
  for (const path of [`/api/image-generations/${generationId}/issues`, '/api/moderator/generator-issues', `/api/moderator/generator-issues/${generationId}`]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  for (const path of [`/api/image-generations/${generationId}/issues`, `/api/moderator/generator-issues/${generationId}`]) {
    expect((await request.post(path, { data: { decision: 'approved' } })).status()).toBe(401);
  }
});
