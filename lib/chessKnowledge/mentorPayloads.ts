import type { FinishedGameAnalysisIntakePayload } from '@/lib/finishedGameAnalysisIntake';

import { openingContextOverridesEngine } from './authority';

/** Sanitized opening metadata for Adaptive Mentor — no raw book text, no live-assist flags. */
export type SanitizedOpeningContext = {
  familyId: string | null;
  familyDisplayName: string | null;
  lineName: string | null;
  ecoCode: string | null;
  sourceLabel: string | null;
  strategicThemeTags: string[];
  riskLevel: string | null;
  authority: 'classification_only';
};

/** Sanitized engine summary — no raw MultiPV trees or internal job ids. */
export type SanitizedEngineVerdict = {
  verdict: string | null;
  centipawnEval: number | null;
  bestMoveSan: string | null;
  qualityLabel: string | null;
  tablebaseResult: string | null;
  authority: 'engine_or_tablebase';
};

export type TrainerExplanationPayload = {
  schemaVersion: 'tep.1';
  gameId: string;
  playerColor: 'white' | 'black' | null;
  explanationMode: 'post_game_only';
  opening: SanitizedOpeningContext | null;
  engine: SanitizedEngineVerdict | null;
  repertoireNote: string | null;
  tacticalMotifLabels: string[];
  strategicThemeLabels: string[];
  practicalLesson: string | null;
  /** Explicit constitutional flag for consumers. */
  openingOverridesEngine: false;
};

const FORBIDDEN_MENTOR_KEYS = [
  'raw_artifact',
  'multipv',
  'engine_depth',
  'copyrighted_text',
  'book_excerpt',
  'pdf_page',
  'active_game_fen',
  'live_assistance',
] as const;

function containsForbiddenKey(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_MENTOR_KEYS.some((f) => lower === f || lower.includes(f))) {
      return true;
    }
  }
  return false;
}

export function sanitizeOpeningMetadataForMentor(input: {
  familyId?: string | null;
  familyDisplayName?: string | null;
  lineName?: string | null;
  ecoCode?: string | null;
  sourceLabel?: string | null;
  strategicThemeTags?: string[];
  riskLevel?: string | null;
}): SanitizedOpeningContext {
  return {
    familyId: input.familyId ?? null,
    familyDisplayName: input.familyDisplayName ?? null,
    lineName: input.lineName ?? null,
    ecoCode: input.ecoCode ?? null,
    sourceLabel: input.sourceLabel ?? null,
    strategicThemeTags: [...(input.strategicThemeTags ?? [])],
    riskLevel: input.riskLevel ?? null,
    authority: 'classification_only',
  };
}

export function sanitizeEngineArtifactForMentor(input: {
  verdict?: string | null;
  centipawnEval?: number | null;
  bestMoveSan?: string | null;
  qualityLabel?: string | null;
  tablebaseResult?: string | null;
}): SanitizedEngineVerdict {
  return {
    verdict: input.verdict ?? null,
    centipawnEval: input.centipawnEval ?? null,
    bestMoveSan: input.bestMoveSan ?? null,
    qualityLabel: input.qualityLabel ?? null,
    tablebaseResult: input.tablebaseResult ?? null,
    authority: 'engine_or_tablebase',
  };
}

export function sanitizeRepertoireContextForMentor(note: string | null): string | null {
  if (!note?.trim()) return null;
  return note.trim().slice(0, 500);
}

export function buildTrainerExplanationPayload(input: {
  intake: FinishedGameAnalysisIntakePayload;
  playerColor: 'white' | 'black' | null;
  opening?: SanitizedOpeningContext | null;
  engine?: SanitizedEngineVerdict | null;
  repertoireNote?: string | null;
  tacticalMotifLabels?: string[];
  strategicThemeLabels?: string[];
  practicalLesson?: string | null;
}): TrainerExplanationPayload {
  const payload: TrainerExplanationPayload = {
    schemaVersion: 'tep.1',
    gameId: input.intake.game.id,
    playerColor: input.playerColor,
    explanationMode: 'post_game_only',
    opening: input.opening ?? null,
    engine: input.engine ?? null,
    repertoireNote: sanitizeRepertoireContextForMentor(input.repertoireNote ?? null),
    tacticalMotifLabels: [...(input.tacticalMotifLabels ?? [])],
    strategicThemeLabels: [...(input.strategicThemeLabels ?? [])],
    practicalLesson: input.practicalLesson?.trim().slice(0, 800) ?? null,
    openingOverridesEngine: openingContextOverridesEngine(),
  };

  if (containsForbiddenKey(payload as unknown as Record<string, unknown>)) {
    throw new Error('Trainer explanation payload contains forbidden authority fields.');
  }

  return payload;
}

export function buildOpeningExplanationPayload(
  opening: SanitizedOpeningContext,
  engine: SanitizedEngineVerdict | null
): Pick<TrainerExplanationPayload, 'opening' | 'engine' | 'openingOverridesEngine' | 'explanationMode'> {
  return {
    explanationMode: 'post_game_only',
    opening,
    engine,
    openingOverridesEngine: openingContextOverridesEngine(),
  };
}

export function buildTacticalPatternExplanationPayload(input: {
  motifLabels: string[];
  engine: SanitizedEngineVerdict | null;
  practicalLesson?: string | null;
}): {
  tacticalMotifLabels: string[];
  engine: SanitizedEngineVerdict | null;
  practicalLesson: string | null;
  explanationMode: 'post_game_only';
} {
  return {
    tacticalMotifLabels: [...input.motifLabels],
    engine: input.engine,
    practicalLesson: input.practicalLesson?.trim().slice(0, 800) ?? null,
    explanationMode: 'post_game_only',
  };
}
