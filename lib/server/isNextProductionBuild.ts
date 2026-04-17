import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/** True while `next build` is executing route/module evaluation (not a public runtime API). */
export function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}
