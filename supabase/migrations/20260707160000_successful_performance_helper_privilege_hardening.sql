-- Successful Performance v1: revoke direct EXECUTE on internal helper functions.
-- Follow-up to 20260705120000_successful_performance_read_foundation.sql.
-- Main RPC privilege posture unchanged; helpers remain callable only via SECURITY DEFINER owner.

begin;

revoke execute on function
  public.successful_performance_strict_control(text, text)
from public, anon, authenticated;

revoke execute on function
  public.successful_performance_mode_from_control(text)
from public, anon, authenticated;

revoke execute on function
  public.successful_performance_player_outcome(text, uuid, uuid, uuid)
from public, anon, authenticated;

commit;
