import type { SupabaseClient } from '@supabase/supabase-js';

export type ModeratorRoleChangeAuditRecord = {
  id: string;
  acted_by: string;
  target_user_id: string;
  role_granted_or_revoked: 'GRANTED_MODERATOR' | 'REVOKED_MODERATOR';
  previous_roles: string[];
  new_roles: string[];
  created_at: string;
};

type RoleChangeRpcResult = {
  acted_by: string;
  target_user_id: string;
  role_granted_or_revoked: ModeratorRoleChangeAuditRecord['role_granted_or_revoked'];
  previous_roles: string[];
  new_roles: string[];
  created_at: string;
};

export class SupabaseModeratorRoleAdminStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async grantModeratorRole(actedBy: string, targetUserId: string): Promise<RoleChangeRpcResult> {
    const { data, error } = await this.supabase.rpc('set_moderator_role_binding', {
      p_acted_by: actedBy,
      p_target_user_id: targetUserId,
      p_grant: true,
    });
    if (error) throw new Error(error.message);
    return data as RoleChangeRpcResult;
  }

  async revokeModeratorRole(actedBy: string, targetUserId: string): Promise<RoleChangeRpcResult> {
    const { data, error } = await this.supabase.rpc('set_moderator_role_binding', {
      p_acted_by: actedBy,
      p_target_user_id: targetUserId,
      p_grant: false,
    });
    if (error) throw new Error(error.message);
    return data as RoleChangeRpcResult;
  }

  async listAuditHistory(limit = 100): Promise<ModeratorRoleChangeAuditRecord[]> {
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const { data, error } = await this.supabase
      .from('moderator_role_audit_history')
      .select('id,acted_by,target_user_id,role_granted_or_revoked,previous_roles,new_roles,created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ModeratorRoleChangeAuditRecord[];
  }
}
