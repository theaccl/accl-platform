import { expect, test } from '@playwright/test';
import { evaluateTesterProfileReadiness } from '@/lib/tester/testerReadiness';

test.describe('tester cohort readiness evaluation', () => {
  test('cohort_ready when username valid, safe, and accl_tester true', () => {
    const r = evaluateTesterProfileReadiness({
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: 'tester_alpha1',
      accl_tester: true,
    });
    expect(r.cohort_ready).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.checks.username_claimed).toBe(true);
    expect(r.checks.tester_cohort_flag).toBe(true);
  });

  test('missing username fails readiness', () => {
    const r = evaluateTesterProfileReadiness({
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: null,
      accl_tester: true,
    });
    expect(r.cohort_ready).toBe(false);
    expect(r.issues).toContain('missing_username');
  });

  test('email-shaped username fails', () => {
    const r = evaluateTesterProfileReadiness({
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: 'bad@test.com',
      accl_tester: true,
    });
    expect(r.cohort_ready).toBe(false);
    expect(r.issues).toContain('email_shaped_username');
  });

  test('invalid username per ACCL rules fails', () => {
    const r = evaluateTesterProfileReadiness({
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: 'ab',
      accl_tester: true,
    });
    expect(r.cohort_ready).toBe(false);
    expect(r.issues).toContain('invalid_username');
  });

  test('missing tester flag fails', () => {
    const r = evaluateTesterProfileReadiness({
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: 'okuser',
      accl_tester: false,
    });
    expect(r.cohort_ready).toBe(false);
    expect(r.issues).toContain('tester_flag_false');
  });

  test('null profile row', () => {
    const r = evaluateTesterProfileReadiness(null);
    expect(r.cohort_ready).toBe(false);
    expect(r.issues).toContain('missing_profile_row');
  });
});
