create index if not exists generation_token_ledger_generation_request_idx
  on public.generation_token_ledger (generation_request_id)
  where generation_request_id is not null;
