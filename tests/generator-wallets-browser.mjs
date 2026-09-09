import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
const output = process.env.GENERATOR_BROWSER_OUTPUT_DIR || mkdtempSync(join(tmpdir(), 'accl-wallets-'));
mkdirSync(output, { recursive: true });
const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3148';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local browser fixture origin required');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1150 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const user = { id: '1bbc9f6a-053a-4b90-b21f-3aefcbf6d18f', aud: 'authenticated', role: 'authenticated', email: 'synthetic-wallet@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const expires = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expires, aud: 'authenticated' })}.synthetic-signature`, refresh_token: 'synthetic-wallet-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${encode(session)}`, url: origin, sameSite: 'Lax' }]);
let mode = 'all';
const writes = [];
let generationBalance = 4;
let loseNextResponse = false;
const committedKeys = new Set();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.startsWith('/auth/v1/')) return json(user);
  if (url.pathname.startsWith('/rest/v1/')) return json([]);
  if (url.origin !== origin) return route.abort();
  if (url.pathname === '/api/image-generations/entitlements') {
    if (mode === 'error') return json({ error: 'Synthetic failure' }, 500);
    return json({ image_generator: true, can_commission: mode !== 'zero', membership_tier: 'plus', generator_contract: { tier: 'plus', label: 'Plus', initialCandidates: 2, maxReferences: 1 }, generation_tokens: mode === 'unlimited' ? { balance: null, unlimited: true } : { balance: mode === 'zero' ? 0 : generationBalance, purchased_balance: mode === 'all' ? 2 : undefined }, ...(mode === 'all' ? { guidance_tokens: { balance: 2, purchased_balance: 1 }, compare_tokens: { balance: 3, purchased_balance: 0 } } : {}) });
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.method() === 'POST') writes.push({ path: url.pathname, body: req.postDataJSON(), key: req.headers()['idempotency-key'] });
    if (url.pathname === '/api/image-generations' && req.method() === 'POST') {
      const key = req.headers()['idempotency-key'];
      if (!committedKeys.has(key)) { generationBalance--; committedKeys.add(key); }
      if (loseNextResponse) { loseNextResponse = false; return route.abort('failed'); }
      return json({ generation: { id: '10000000-0000-4000-8000-000000000001', status: 'queued' } }, 202);
    }
    return json({});
  }
  return route.continue();
});
const wallet = name => page.locator(`[data-wallet="${name}"]`);
async function reload() {
  await page.goto(`${origin}/image-generator`);
  await page.getByRole('link', { name: 'View Vault', exact: true }).first().waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-wallet="generation"] [data-wallet-total]')?.textContent?.includes('…'));
}
try {
  await reload();
  assert.equal(await wallet('generation').locator('[data-wallet-total]').innerText(), '4');
  assert.equal(await wallet('generation').locator('[data-wallet-purchased]').innerText(), '2');
  assert.equal(await wallet('guidance').locator('[data-wallet-total]').innerText(), '2');
  assert.equal(await wallet('compare').locator('[data-wallet-total]').innerText(), '3');
  assert.equal(await page.getByRole('button', { name: /^Use \d/ }).count(), 0);
  const generate = page.getByRole('button', { name: 'Generate · 1 Generation Token', exact: true });
  const prompt = page.getByRole('textbox', { name: 'Describe the profile image you want ACCL to generate' });
  assert.equal(await generate.isEnabled(), true, 'An optional prompt can be empty');
  await page.getByRole('radio', { name: 'Storm arena', exact: true }).check();
  await prompt.fill('Blue armor');
  await prompt.press('Enter');
  assert.equal(writes.filter(x => /^\/api\/(image-generations|saved-creations)/.test(x.path)).length, 0, 'Selection and typing must never submit');
  await prompt.fill(Array(51).fill('chess').join(' '));
  assert.equal(await generate.isDisabled(), true);
  await prompt.fill(Array(50).fill('chess').join(' '));
  assert.equal(await generate.isEnabled(), true);
  await prompt.fill('Blue armor with warm golden lighting');
  const squares = await page.locator('[data-wallet]').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
  for (const box of squares) assert.ok(Math.abs(box.width - box.height) < 2, JSON.stringify(box));
  await page.screenshot({ path: `${output}/generator-wallets-demo-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No page-level horizontal overflow');
  await wallet('compare').scrollIntoViewIfNeeded();
  await page.getByRole('radio', { name: 'Gold rook emblem', exact: true }).check();
  await page.screenshot({ path: `${output}/generator-wallets-demo-mobile.png`, fullPage: true });
  await generate.click();
  await page.waitForFunction(() => document.querySelector('[data-wallet="generation"] [data-wallet-total]')?.textContent === '3');
  const commissions = writes.filter(x => x.path === '/api/image-generations');
  assert.equal(commissions.length, 1);
  assert.deepEqual(commissions[0].body, { prompt: 'Blue armor with warm golden lighting', style: 'gold', reference_ids: [] });
  assert.equal(await wallet('guidance').locator('[data-wallet-total]').innerText(), '2');
  assert.equal(await wallet('compare').locator('[data-wallet-total]').innerText(), '3');
  mode = 'zero'; await reload();
  assert.equal(await wallet('generation').locator('[data-wallet-total]').innerText(), '0');
  assert.equal(await generate.isDisabled(), true);
  assert.equal(await wallet('guidance').locator('[data-wallet-total]').innerText(), '—');
  assert.match(await wallet('guidance').innerText(), /Coming soon/);
  mode = 'unlimited'; await reload();
  assert.equal(await wallet('generation').locator('[data-wallet-total]').innerText(), '∞');
  assert.equal(await page.getByRole('button', { name: 'Generate · Unlimited', exact: true }).isEnabled(), true);
  mode = 'error'; await page.reload();
  await page.getByRole('button', { name: 'Could not verify generator access. Try again.' }).waitFor();
  assert.equal(await wallet('generation').locator('[data-wallet-total]').innerText(), '—');
  assert.equal(await page.getByRole('button', { name: /^Generate ·/ }).isDisabled(), true);
  assert.equal(writes.filter(x => /^\/api\/(image-generations|saved-creations)/.test(x.path)).length, 1);
  mode = 'all'; await reload();
  await prompt.fill('Retry-safe chess portrait');
  loseNextResponse = true;
  await generate.click();
  await page.getByText('ACCL could not reach the generator. Please try again in a moment.').waitFor();
  assert.equal(await prompt.isDisabled(), true, 'Keep an uncertain request payload stable');
  await reload();
  await page.getByText('A previous submission needs confirmation. Press Generate to safely recover the same commission.').waitFor();
  assert.equal(writes.filter(x => x.path === '/api/image-generations').length, 2, 'Reload must not auto-submit');
  assert.equal(await prompt.inputValue(), 'Retry-safe chess portrait');
  await generate.click();
  await page.waitForFunction(() => document.querySelector('[data-wallet="generation"] [data-wallet-total]')?.textContent === '2');
  const attempts = writes.filter(x => x.path === '/api/image-generations');
  assert.equal(attempts.length, 3);
  assert.equal(attempts[1].key, attempts[2].key, 'Lost response must reuse the same idempotency key');
  assert.deepEqual(attempts[1].body, attempts[2].body);
  assert.equal(committedKeys.size, 2, 'Three HTTP attempts create only two commissions');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', scenarios: ['separate balances', 'purchased subset not double-counted', 'styles do not charge', 'typing Enter does not generate', '50 word boundary', 'explicit Generate only', 'authoritative refresh', 'square desktop cards', 'mobile scroll without page overflow', 'zero', 'missing wallets', 'unlimited', 'lookup failure', 'lost-response reload recovery', 'same-key retry without duplicate charge'], applicationWrites: writes.map(x => x.path), pageErrors: errors, screenshotBalances: 'synthetic fixtures only' }));
} finally { await browser.close(); }
