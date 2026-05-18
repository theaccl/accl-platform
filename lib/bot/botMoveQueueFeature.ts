/**
 * Phase 1I queue feature gates — defaults OFF.
 * - BOT_MOVE_QUEUE_ENABLED: async cutover (not used until a later phase)
 * - BOT_MOVE_QUEUE_SHADOW: audit-parity writes after sync commit (1I-b)
 */

function envFlagEnabled(raw: string | undefined): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Async queue cutover — remains OFF for 1I-b. */
export function isBotMoveQueueEnabled(): boolean {
  return envFlagEnabled(process.env.BOT_MOVE_QUEUE_ENABLED);
}

/** Shadow audit writes after successful sync bot commit — default OFF. */
export function isBotMoveQueueShadowEnabled(): boolean {
  return envFlagEnabled(process.env.BOT_MOVE_QUEUE_SHADOW);
}
