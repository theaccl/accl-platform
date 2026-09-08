import { expect, test } from '@playwright/test';
import { aiIssueDecision, issueReportSchema, manualIssueDecisionSchema, publicIssueReport, type IssueReport } from '../../lib/imageGenerator/issueReviewPolicy';

const legitimate = { legitimate: true, uncertain: false, objectiveFailure: true, evidenceComplete: true, explanation: 'All candidates show the same rendering failure.' };
test('AI approves a supported legitimate issue', () => {
  expect(aiIssueDecision(legitimate, true)).toBe('approved');
});
for (const [name, assessment, complete] of [
  ['uncertain', { ...legitimate, uncertain: true }, true],
  ['negative', { ...legitimate, legitimate: false }, true],
  ['subjective', { ...legitimate, objectiveFailure: false }, true],
  ['AI reports missing evidence', { ...legitimate, evidenceComplete: false }, true],
  ['server reports missing evidence', legitimate, false],
  ['malformed', { legitimate: true }, true],
] as const) test(`AI sends ${name} assessments to manual review`, () => {
  expect(aiIssueDecision(assessment, complete)).toBe('pending_manual');
});
test('report inputs cannot supply decisions, reviewer identity, or replacement amounts', () => {
  const input = { category: 'technical_failure', details: 'Every candidate failed to render.', review_method: 'ai' };
  expect(issueReportSchema.safeParse(input).success).toBe(true);
  for (const key of ['status', 'reviewer_id', 'replacement_amount', 'owner_id']) {
    expect(issueReportSchema.safeParse({ ...input, [key]: 'forged' }).success).toBe(false);
  }
  expect(manualIssueDecisionSchema.safeParse({ decision: 'approved', note: 'yes' }).success).toBe(false);
});
test('owner response excludes internal reviewer and AI evidence', () => {
  const report = { id: 'report', ai_model: 'private-model', ai_assessment: { private: true }, reviewer_id: 'moderator' } as unknown as IssueReport;
  expect(publicIssueReport(report)).not.toHaveProperty('ai_model');
  expect(publicIssueReport(report)).not.toHaveProperty('ai_assessment');
  expect(publicIssueReport(report)).not.toHaveProperty('reviewer_id');
});
