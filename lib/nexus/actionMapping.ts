import type { NexusAdvisoryStoredRecord } from '@/lib/nexus/outputRegistry';

export type NexusEligibleAction =
  | {
      action_type: 'open_triage_page';
      explanation: string;
      route: string;
    }
  | {
      action_type: 'rerun_trainer_generation';
      explanation: string;
      endpoint: '/api/operator/control-center';
      method: 'POST';
      body: { action: 'rerun_trainer_generation'; game_id: string };
    }
  | {
      action_type: 'retry_failed_queue_job';
      explanation: string;
      endpoint: '/api/operator/control-center';
      method: 'POST';
      requires_context: 'failed_queue_job_id';
    };

export function mapAdvisoryToEligibleActions(advisory: NexusAdvisoryStoredRecord): NexusEligibleAction[] {
  const actions: NexusEligibleAction[] = [];
  const title = advisory.content.title.toLowerCase();
  const summary = advisory.content.summary.toLowerCase();
  const text = `${title} ${summary}`;

  // Insights remain advisory-only (no action controls).
  if (advisory.output_type === 'insight') return actions;

  // Never expose tournament-truth mutation actions.
  if (advisory.subject_scope === 'game' && advisory.subject_id) {
    actions.push({
      action_type: 'open_triage_page',
      explanation: 'Open game analysis/training triage for operator review.',
      route: `/finished/${advisory.subject_id}/analyze`,
    });
  }

  if (text.includes('trainer generation') && advisory.subject_scope === 'game' && advisory.subject_id) {
    actions.push({
      action_type: 'rerun_trainer_generation',
      explanation: 'Safe re-run through existing queue/trainer pipeline for this finished game.',
      endpoint: '/api/operator/control-center',
      method: 'POST',
      body: { action: 'rerun_trainer_generation', game_id: advisory.subject_id },
    });
  }

  if (text.includes('queue fail') || text.includes('stale queue') || text.includes('missing engine artifact')) {
    actions.push({
      action_type: 'retry_failed_queue_job',
      explanation: 'Retry uses existing bounded queue action endpoint; requires a selected failed job id.',
      endpoint: '/api/operator/control-center',
      method: 'POST',
      requires_context: 'failed_queue_job_id',
    });
  }

  return actions;
}

