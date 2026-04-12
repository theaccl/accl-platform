export function logSupabaseWriteError(_label: string, payload: unknown) {
  console.error('[accl Supabase write]', payload);
}

export function logLiveTimeControlInsert(_label: string, payload: unknown) {
  console.debug('[accl live_time_control]', payload);
}

