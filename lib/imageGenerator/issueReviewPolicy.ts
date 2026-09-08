import { z } from 'zod';

export const issueReportSchema = z.object({
  category: z.enum(['technical_failure', 'unusable_result', 'prompt_mismatch', 'other']),
  details: z.string().trim().min(10).max(2000),
  review_method: z.enum(['manual', 'ai']),
}).strict();

export const manualIssueDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().min(10).max(1000),
}).strict();

export const aiIssueAssessmentSchema = z.object({
  legitimate: z.boolean(),
  uncertain: z.boolean(),
  evidenceComplete: z.boolean(),
  objectiveFailure: z.boolean(),
  explanation: z.string().min(1).max(1000),
});

// Self-reported confidence alone is never sufficient to replace a token.
// All inconclusive or negative AI assessments get a human decision.
export function aiIssueDecision(assessment: unknown, evidenceComplete: boolean): 'approved' | 'pending_manual' {
  const parsed = aiIssueAssessmentSchema.safeParse(assessment);
  return evidenceComplete && parsed.success && parsed.data.legitimate && !parsed.data.uncertain
    && parsed.data.evidenceComplete && parsed.data.objectiveFailure ? 'approved' : 'pending_manual';
}

export type IssueReport = {
  id: string; request_id: string; owner_id: string;
  category: string; details: string; review_method: 'manual' | 'ai';
  status: 'pending_ai' | 'reviewing_ai' | 'pending_manual' | 'approved' | 'rejected';
  resolution_note: string | null; replacement_amount: number; created_at: string;
  ai_deadline: string | null;
};

export function publicIssueReport(report: IssueReport) {
  return { id: report.id, request_id: report.request_id, category: report.category, details: report.details,
    review_method: report.review_method, status: report.status, resolution_note: report.resolution_note,
    replacement_amount: report.replacement_amount, created_at: report.created_at };
}
