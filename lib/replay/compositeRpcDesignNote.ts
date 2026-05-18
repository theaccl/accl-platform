/**
 * Phase 1C design note — not implemented yet.
 *
 * ## Target: `apply_bot_game_turn_system` (bot games only)
 *
 * Single SECURITY DEFINER transaction:
 * 1. `SELECT … FROM games WHERE id = p_game_id FOR UPDATE`
 * 2. Optimistic FEN check (human `p_expected_fen`)
 * 3. Apply human ply → update clocks/turn/fen
 * 4. `INSERT` human row into `game_move_logs`
 * 5. If still active and bot to move: apply bot ply + bot log insert
 * 6. If terminal: `finish_game_system` once (after final ply)
 * 7. `RETURN` final `games` row + optional log ids
 *
 * ## Extend `apply_move_and_maybe_finish_system` vs new RPC?
 *
 * **Recommend new composite RPC for bot dual-ply**, and **extend the existing RPC**
 * with optional `p_move_log jsonb` for single-ply paths (human PvP, human-only terminal).
 *
 * Reasons:
 * - Bot games need two plies + two logs atomically; overloading one RPC with bot-only
 *   branching increases regression risk for tournament/free PvP.
 * - Optional log payload on the existing RPC is lower risk: null log = current behavior;
 *   non-null = insert in same transaction for all game types using submit-move.
 *
 * ## Migration order (suggested)
 * 1. ~~Add `p_move_log jsonb` to `apply_move_and_maybe_finish_system` (nullable).~~ **Done (Phase 1D)**
 * 2. ~~Switch submit-move human/bot ply to pass log payload.~~ **Done (Phase 1D)**
 * 3. Add `apply_bot_game_turn_system` for bot_game human+bot pair.
 * 4. Deprecate second RPC call on bot path (optional; two RPCs still atomic per ply).
 */
export const COMPOSITE_RPC_DESIGN_NOTE_VERSION = 'accl_phase_1d_v1';
