import type { IntelligenceMode } from './modes';

export type ParsedProtectedAnalysisBody = {
  fen: string;
  mode: IntelligenceMode;
  gameId: string;
};

export type ProtectedAnalysisBodyParseResult =
  | { ok: true; value: ParsedProtectedAnalysisBody }
  | { ok: false; error: string; status: 400 };

export function parseProtectedAnalysisBody(input: unknown): ProtectedAnalysisBodyParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Invalid JSON body', status: 400 };
  }
  const record = input as Record<string, unknown>;
  const allowedKeys = new Set(['fen', 'mode', 'gameId']);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: 'Unsupported protected analysis field', status: 400 };
  }
  const fen = typeof record.fen === 'string' ? record.fen.trim() : '';
  if (!fen) return { ok: false, error: 'fen is required', status: 400 };
  const gameId = typeof record.gameId === 'string' ? record.gameId.trim() : '';
  if (!gameId) return { ok: false, error: 'gameId is required', status: 400 };
  const rawMode = typeof record.mode === 'string' ? record.mode.trim() : 'coach';
  if (!['coach', 'analyst', 'explainer'].includes(rawMode)) {
    return { ok: false, error: 'mode must be one of: coach | analyst | explainer', status: 400 };
  }
  return {
    ok: true,
    value: { fen, gameId, mode: rawMode as IntelligenceMode },
  };
}
