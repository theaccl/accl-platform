import { evaluatePositionWithStockfish } from '@/lib/chess/engine/stockfishAdapter';
import type { EngineIdentity } from '@/lib/chess/engine/types';
import type { EngineLeaseExecutor } from './coordinator';

export const STOCKFISH_FULL_NATIVE_IDENTITY: EngineIdentity = {
  name: 'stockfish',
  version: '18-cb3d4ee9b47d',
};

/** Thin compatibility boundary: Slice 2 remains the only UCI/score/result authority. */
export const executeStockfishLease: EngineLeaseExecutor = async ({
  request,
  position,
  transport,
}) =>
  await evaluatePositionWithStockfish({
    transport,
    position,
    limits: request.limits,
    identity: STOCKFISH_FULL_NATIVE_IDENTITY,
  });
