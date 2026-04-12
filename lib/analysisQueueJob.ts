/**
 * Minimal analysis job envelope stored in `finished_game_analysis_jobs`.
 * Full game payload is NOT duplicated here — canonical data remains `get_finished_game_analysis_intake`.
 */
export type FinishedAnalysisJobStatus =
  | 'queued'
  | 'no_finished_intake'
  | 'running'
  | 'completed'
  | 'failed';

export const ANALYSIS_JOB_QUEUE_SCHEMA_VERSION = 'ajq.1' as const;

export type FinishedGameAnalysisJobRow = {
  id: string;
  game_id: string;
  status: FinishedAnalysisJobStatus;
  job_schema_version: string;
  correlation_id: string | null;
  intake_schema_version: string | null;
  analysis_partition: string | null;
  move_count: number | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  result_meta: Record<string, unknown>;
};

/** Request body for POST /api/internal/analysis-queue */
export type EnqueueAnalysisJobBody = {
  game_id: string;
  correlation_id?: string | null;
};

/** Response after enqueue RPC */
export type EnqueueAnalysisJobResponse = {
  job_id: string;
  status: FinishedAnalysisJobStatus;
  job_schema_version: string;
  game_id: string;
  intake_schema_version: string | null;
  analysis_partition: string | null;
  move_count: number | null;
};

/** One cycle from POST /api/internal/analysis-queue/process */
export type ProcessOneJobResult = {
  claimed: boolean;
  job_id?: string;
  game_id?: string;
  final_status?: FinishedAnalysisJobStatus;
  finalize_ok?: boolean;
  artifact_id?: string;
  error?: string;
};

export type ProcessBatchResponse = {
  batch_requested: number;
  results: ProcessOneJobResult[];
};
