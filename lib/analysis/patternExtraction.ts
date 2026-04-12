import type { FinishedGameAnalysisIntakePayload } from '@/lib/finishedGameAnalysisIntake';
import type { EngineServiceResult } from '@/lib/analysis/engineComputeService';

export type PatternExtractionOutput = {
  criticalMoments: Array<{ ply: number; san: string; reason: string }>;
  patternTags: string[];
  suggestedThemes: string[];
};

export function extractPatternOutputs(
  intake: FinishedGameAnalysisIntakePayload,
  engine: EngineServiceResult
): PatternExtractionOutput {
  const moves = intake.move_logs ?? [];
  const criticalMoments = moves
    .map((m, idx) => ({ ply: idx + 1, san: String(m.san ?? '').trim() }))
    .filter((m) => Boolean(m.san) && (m.san.includes('!') || m.san.includes('?') || m.san.includes('#')))
    .slice(0, 8)
    .map((m) => ({
      ply: m.ply,
      san: m.san,
      reason: m.san.includes('?') ? 'mistake-signal' : m.san.includes('#') ? 'mate-signal' : 'sharp-move',
    }));

  const patternTags = [...new Set([...engine.tacticalTags, ...criticalMoments.map((x) => x.reason)])];
  const suggestedThemes = patternTags.includes('check-pressure')
    ? ['King Safety', 'Forcing Moves']
    : ['Fork Awareness', 'Calculation Discipline'];

  return { criticalMoments, patternTags, suggestedThemes };
}
