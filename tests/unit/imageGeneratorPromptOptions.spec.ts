import { expect, test } from '@playwright/test';
import { createGenerationSchema, createRefinementSchema } from '../../lib/imageGenerator/api';
import { composePlayerPrompt, DEFAULT_EDIT_PROMPT, GENERATOR_STYLES, promptWordCount } from '../../lib/imageGenerator/promptOptions';

test('50 user words pass and 51 fail for generation and edits, including whitespace', () => {
  const fifty = Array(50).fill('chess').join(' \n\t');
  expect(promptWordCount(fifty)).toBe(50);
  for (const prompt of [fifty, '', '  \n\t  ']) {
    expect(createGenerationSchema.safeParse({ prompt }).success).toBe(true);
    expect(createRefinementSchema.safeParse({ source_candidate_id: '00000000-0000-4000-8000-000000000001', guidance: prompt }).success).toBe(true);
  }
  expect(createGenerationSchema.safeParse({ prompt: `${fifty} extra` }).success).toBe(false);
  expect(createRefinementSchema.safeParse({ source_candidate_id: '00000000-0000-4000-8000-000000000001', guidance: `${fifty} extra` }).success).toBe(false);
  expect(createGenerationSchema.safeParse({ prompt: 'a'.repeat(2001) }).success).toBe(false);
});

test('optional prompts have deterministic defaults and only known styles are accepted', () => {
  expect(createGenerationSchema.parse({})).toMatchObject({ prompt: '', style: 'automatic' });
  expect(composePlayerPrompt('', 'automatic', true)).toBe(DEFAULT_EDIT_PROMPT);
  expect(composePlayerPrompt('blue armor', 'storm')).toContain(GENERATOR_STYLES.storm.prompt);
  expect(composePlayerPrompt('blue armor', 'storm')).toContain('blue armor');
  expect(createGenerationSchema.safeParse({ style: 'spend-compare-tokens' }).success).toBe(false);
  expect(createGenerationSchema.safeParse({ prompt: 2 }).success).toBe(false);
});
