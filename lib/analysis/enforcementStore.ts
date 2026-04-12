import type { SupabaseClient } from '@supabase/supabase-js';

import type { ActionRecommendation, SuspicionTier } from './intelligence';

export type EnforcementState =
  | 'NO_RESTRICTION'
  | 'MONITOR_ONLY'
  | 'LIMITED_ANALYSIS'
  | 'TRAINER_LOCKED'
  | 'REVIEW_LOCKED';

export type ModeratorOverrideAction = 'CLEAR_RESTRICTION' | 'TEMPORARY_UNLOCK' | 'KEEP_LOCKED_PENDING_REVIEW';

export type ModeratorOverrideInput = {
  userId: string;
  moderatorId: string;
  action: ModeratorOverrideAction;
  reason?: string | null;
  expiresAt?: string | null;
};

export type EffectiveEnforcementState = {
  userId: string;
  state: EnforcementState;
  source: 'baseline' | 'override';
  baselineState: EnforcementState;
  overrideAction: ModeratorOverrideAction | null;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
  sourceSuspicionTier: SuspicionTier | null;
  sourceRecommendedAction: ActionRecommendation['recommended_action'] | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ModeratorOverrideResult = {
  userId: string;
  baselineState: EnforcementState;
  effectiveState: EnforcementState;
  overrideAction: ModeratorOverrideAction;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
  source: 'baseline' | 'override';
};

export type PersistedEnforcementState = {
  user_id: string;
  enforcement_state: EnforcementState;
  source_suspicion_tier: SuspicionTier;
  source_recommended_action: ActionRecommendation['recommended_action'];
  source_reason_json: unknown;
  override_action: ModeratorOverrideAction | null;
  override_state: EnforcementState | null;
  override_reason: string | null;
  override_expires_at: string | null;
  override_set_by: string | null;
  updated_at: string;
  created_at: string;
};

export interface AntiCheatEnforcementStore {
  upsertFromRecommendation(input: {
    userId: string;
    suspicionTier: SuspicionTier;
    recommendation: ActionRecommendation;
    reasonJson: unknown;
  }): Promise<void>;
  getEffectiveState(userId: string): Promise<EffectiveEnforcementState>;
  getStateDetails(userId: string): Promise<PersistedEnforcementState | null>;
  applyModeratorOverride(input: ModeratorOverrideInput): Promise<ModeratorOverrideResult>;
}

export function enforcementStateForTier(tier: SuspicionTier): EnforcementState {
  switch (tier) {
    case 'CLEAR':
      return 'NO_RESTRICTION';
    case 'WATCH':
      return 'MONITOR_ONLY';
    case 'WARNING':
      return 'LIMITED_ANALYSIS';
    case 'SOFT_LOCK_RECOMMENDED':
      return 'TRAINER_LOCKED';
    case 'ESCALATE_REVIEW':
      return 'REVIEW_LOCKED';
  }
}

function overrideStateForAction(action: ModeratorOverrideAction): EnforcementState {
  if (action === 'CLEAR_RESTRICTION') return 'NO_RESTRICTION';
  if (action === 'TEMPORARY_UNLOCK') return 'MONITOR_ONLY';
  return 'REVIEW_LOCKED';
}

function isOverrideExpired(expiresAt: string | null, nowIso: string): boolean {
  if (!expiresAt) return false;
  return expiresAt <= nowIso;
}

export class SupabaseAntiCheatEnforcementStore implements AntiCheatEnforcementStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async upsertFromRecommendation(input: {
    userId: string;
    suspicionTier: SuspicionTier;
    recommendation: ActionRecommendation;
    reasonJson: unknown;
  }): Promise<void> {
    const baselineState = enforcementStateForTier(input.suspicionTier);
    const { error } = await this.supabase.from('anti_cheat_enforcement_states').upsert(
      {
        user_id: input.userId,
        enforcement_state: baselineState,
        source_suspicion_tier: input.suspicionTier,
        source_recommended_action: input.recommendation.recommended_action,
        source_reason_json: input.reasonJson,
      },
      { onConflict: 'user_id' }
    );
    if (error) throw new Error(error.message);
  }

  async getStateDetails(userId: string): Promise<PersistedEnforcementState | null> {
    const { data, error } = await this.supabase
      .from('anti_cheat_enforcement_states')
      .select(
        'user_id,enforcement_state,source_suspicion_tier,source_recommended_action,source_reason_json,override_action,override_state,override_reason,override_expires_at,override_set_by,updated_at,created_at'
      )
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as PersistedEnforcementState | null) ?? null;
  }

  async getEffectiveState(userId: string): Promise<EffectiveEnforcementState> {
    const data = await this.getStateDetails(userId);
    if (!data) {
      return {
        userId,
        state: 'NO_RESTRICTION',
        source: 'baseline',
        baselineState: 'NO_RESTRICTION',
        overrideAction: null,
        overrideReason: null,
        overrideExpiresAt: null,
        sourceSuspicionTier: null,
        sourceRecommendedAction: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    const row = data;
    const nowIso = new Date().toISOString();
    const hasOverride =
      row.override_state &&
      row.override_action &&
      !isOverrideExpired(row.override_expires_at, nowIso);
    if (hasOverride) {
      return {
        userId: row.user_id,
        state: row.override_state!,
        source: 'override',
        baselineState: row.enforcement_state,
        overrideAction: row.override_action,
        overrideReason: row.override_reason,
        overrideExpiresAt: row.override_expires_at,
        sourceSuspicionTier: row.source_suspicion_tier,
        sourceRecommendedAction: row.source_recommended_action,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    return {
      userId: row.user_id,
      state: row.enforcement_state,
      source: 'baseline',
      baselineState: row.enforcement_state,
      overrideAction: row.override_action,
      overrideReason: row.override_reason,
      overrideExpiresAt: row.override_expires_at,
      sourceSuspicionTier: row.source_suspicion_tier,
      sourceRecommendedAction: row.source_recommended_action,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async applyModeratorOverride(input: ModeratorOverrideInput): Promise<ModeratorOverrideResult> {
    const overrideState = overrideStateForAction(input.action);
    const { error } = await this.supabase.from('anti_cheat_enforcement_states').upsert(
      {
        user_id: input.userId,
        enforcement_state: overrideState,
        source_suspicion_tier: 'CLEAR',
        source_recommended_action: 'NO_ACTION',
        source_reason_json: { source: 'moderator_override_seed' },
        override_action: input.action,
        override_state: overrideState,
        override_reason: input.reason ?? null,
        override_expires_at: input.expiresAt ?? null,
        override_set_by: input.moderatorId,
      },
      { onConflict: 'user_id' }
    );
    if (error) throw new Error(error.message);
    const auditInsert = await this.supabase.from('anti_cheat_enforcement_override_history').insert({
      acted_by: input.moderatorId,
      target_user_id: input.userId,
      action: input.action,
      reason: input.reason ?? null,
      expires_at: input.expiresAt ?? null,
    });
    if (auditInsert.error) throw new Error(auditInsert.error.message);
    const effective = await this.getEffectiveState(input.userId);
    return {
      userId: input.userId,
      baselineState: effective.baselineState,
      effectiveState: effective.state,
      overrideAction: input.action,
      overrideReason: input.reason ?? null,
      overrideExpiresAt: input.expiresAt ?? null,
      source: effective.source,
    };
  }
}

export class InMemoryAntiCheatEnforcementStore implements AntiCheatEnforcementStore {
  private rows = new Map<string, PersistedEnforcementState>();

  async upsertFromRecommendation(input: {
    userId: string;
    suspicionTier: SuspicionTier;
    recommendation: ActionRecommendation;
    reasonJson: unknown;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const existing = this.rows.get(input.userId);
    const baselineState = enforcementStateForTier(input.suspicionTier);
    this.rows.set(input.userId, {
      user_id: input.userId,
      enforcement_state: baselineState,
      source_suspicion_tier: input.suspicionTier,
      source_recommended_action: input.recommendation.recommended_action,
      source_reason_json: input.reasonJson,
      override_action: existing?.override_action ?? null,
      override_state: existing?.override_state ?? null,
      override_reason: existing?.override_reason ?? null,
      override_expires_at: existing?.override_expires_at ?? null,
      override_set_by: existing?.override_set_by ?? null,
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
    });
  }

  async getStateDetails(userId: string): Promise<PersistedEnforcementState | null> {
    return this.rows.get(userId) ?? null;
  }

  async getEffectiveState(userId: string): Promise<EffectiveEnforcementState> {
    const row = this.rows.get(userId);
    if (!row) {
      return {
        userId,
        state: 'NO_RESTRICTION',
        source: 'baseline',
        baselineState: 'NO_RESTRICTION',
        overrideAction: null,
        overrideReason: null,
        overrideExpiresAt: null,
        sourceSuspicionTier: null,
        sourceRecommendedAction: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    const nowIso = new Date().toISOString();
    const hasOverride =
      row.override_state &&
      row.override_action &&
      !isOverrideExpired(row.override_expires_at, nowIso);
    if (hasOverride) {
      return {
        userId: row.user_id,
        state: row.override_state!,
        source: 'override',
        baselineState: row.enforcement_state,
        overrideAction: row.override_action,
        overrideReason: row.override_reason,
        overrideExpiresAt: row.override_expires_at,
        sourceSuspicionTier: row.source_suspicion_tier,
        sourceRecommendedAction: row.source_recommended_action,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    return {
      userId: row.user_id,
      state: row.enforcement_state,
      source: 'baseline',
      baselineState: row.enforcement_state,
      overrideAction: row.override_action,
      overrideReason: row.override_reason,
      overrideExpiresAt: row.override_expires_at,
      sourceSuspicionTier: row.source_suspicion_tier,
      sourceRecommendedAction: row.source_recommended_action,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async applyModeratorOverride(input: ModeratorOverrideInput): Promise<ModeratorOverrideResult> {
    const nowIso = new Date().toISOString();
    const existing = this.rows.get(input.userId);
    const overrideState = overrideStateForAction(input.action);
    this.rows.set(input.userId, {
      user_id: input.userId,
      enforcement_state: existing?.enforcement_state ?? 'NO_RESTRICTION',
      source_suspicion_tier: existing?.source_suspicion_tier ?? 'CLEAR',
      source_recommended_action: existing?.source_recommended_action ?? 'NO_ACTION',
      source_reason_json: existing?.source_reason_json ?? [],
      override_action: input.action,
      override_state: overrideState,
      override_reason: input.reason ?? null,
      override_expires_at: input.expiresAt ?? null,
      override_set_by: input.moderatorId,
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
    });
    const effective = await this.getEffectiveState(input.userId);
    return {
      userId: input.userId,
      baselineState: effective.baselineState,
      effectiveState: effective.state,
      overrideAction: input.action,
      overrideReason: input.reason ?? null,
      overrideExpiresAt: input.expiresAt ?? null,
      source: effective.source,
    };
  }
}
