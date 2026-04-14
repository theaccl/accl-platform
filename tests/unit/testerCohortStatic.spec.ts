import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('tester cohort tooling (static)', () => {
  test('operator tester-readiness route uses moderator guard and readiness evaluator', () => {
    const p = join(process.cwd(), 'app', 'api', 'operator', 'tester-readiness', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('requireModerator');
    expect(src).toContain('evaluateTesterProfileReadiness');
    expect(src).toContain('accl_tester');
    expect(src).not.toMatch(/\.email|email:/i);
  });

  test('tester access policy documents route gate assumption', () => {
    const p = join(process.cwd(), 'lib', 'tester', 'testerAccessPolicy.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('TESTER_ROUTES_REQUIRE_ACCL_TESTER_FLAG');
    expect(src).toContain('false');
  });

  test('middleware still gates /tester for username', () => {
    const p = join(process.cwd(), 'lib', 'middlewareUsernameGate.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain("'/tester'");
  });
});
