-- Finish pipeline hook: auto-attempt Vault winner emission on status transition to finished.
-- Narrow integration: uses existing trusted emitter + orchestrator idempotency/audit path.

create or replace function public.trg_games_apply_free_rating_after_finish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Existing finish pipeline behavior (rating trigger path remains intact).
  perform public.apply_free_play_rating_update_core(new.id);

  -- Vault winner emission hook.
  -- Safety:
  -- - emitter handles eligibility (finished + winner only) and skips draws/no-winner
  -- - orchestrator enforces idempotency via milestone_key uniqueness
  -- - we isolate emitter failures so game-finish persistence is never blocked
  begin
    perform public.emit_vault_relic_for_finished_game_winner(new.id);
  exception
    when others then
      -- emitter writes error audit rows before raising; swallow here to avoid breaking finish flow
      null;
  end;

  return new;
end;
$$;

comment on function public.trg_games_apply_free_rating_after_finish() is
  'After games.status transitions to finished: apply rating side effects and attempt Vault winner emitter (safe, idempotent, audited).';
