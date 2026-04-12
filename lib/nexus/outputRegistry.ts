import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  validateNexusOutput,
  type NexusOutputRecord,
  type NexusOutputType,
  type NexusSubjectScope,
} from '@/lib/nexus/contract';

export type NexusAdvisoryStoredRecord = NexusOutputRecord & {
  id: string;
  subject_id: string | null;
  created_at: string;
};

export type NexusRegistryWriteInput = {
  output: NexusOutputRecord;
  subject_id?: string | null;
};

export type NexusRegistryQuery = {
  subject_scope?: NexusSubjectScope;
  subject_id?: string;
  output_type?: NexusOutputType;
  generated_after?: string;
  generated_before?: string;
  active_only?: boolean;
  expired_only?: boolean;
  limit?: number;
};

export interface NexusOutputRegistryRepo {
  insert(input: {
    output: NexusOutputRecord;
    subject_id: string | null;
  }): Promise<NexusAdvisoryStoredRecord>;
  query(filter: NexusRegistryQuery): Promise<NexusAdvisoryStoredRecord[]>;
}

export class SupabaseNexusOutputRegistryRepo implements NexusOutputRegistryRepo {
  async insert(input: {
    output: NexusOutputRecord;
    subject_id: string | null;
  }): Promise<NexusAdvisoryStoredRecord> {
    const supabase = createServiceRoleClient();
    const { output, subject_id } = input;
    const { data, error } = await supabase
      .from('nexus_advisory_outputs')
      .insert({
        output_type: output.output_type,
        subject_scope: output.subject_scope,
        subject_id,
        confidence: output.confidence,
        source_refs: output.source_refs,
        content: output.content,
        model_version: output.model_version,
        policy_version: output.policy_version,
        generated_at: output.generated_at,
        expires_at: output.expires_at ?? null,
      })
      .select(
        'id,output_type,subject_scope,subject_id,confidence,source_refs,content,model_version,policy_version,generated_at,expires_at,created_at'
      )
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to persist NEXUS advisory output');
    }

    return data as NexusAdvisoryStoredRecord;
  }

  async query(filter: NexusRegistryQuery): Promise<NexusAdvisoryStoredRecord[]> {
    const supabase = createServiceRoleClient();
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));

    let q = supabase
      .from('nexus_advisory_outputs')
      .select(
        'id,output_type,subject_scope,subject_id,confidence,source_refs,content,model_version,policy_version,generated_at,expires_at,created_at'
      )
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (filter.subject_scope) q = q.eq('subject_scope', filter.subject_scope);
    if (filter.subject_id) q = q.eq('subject_id', filter.subject_id);
    if (filter.output_type) q = q.eq('output_type', filter.output_type);
    if (filter.generated_after) q = q.gte('generated_at', filter.generated_after);
    if (filter.generated_before) q = q.lte('generated_at', filter.generated_before);

    const nowIso = new Date().toISOString();
    if (filter.active_only && !filter.expired_only) {
      q = q.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    } else if (filter.expired_only && !filter.active_only) {
      q = q.lte('expires_at', nowIso);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as NexusAdvisoryStoredRecord[];
  }
}

export class NexusOutputRegistryService {
  constructor(private readonly repo: NexusOutputRegistryRepo) {}

  async writeAdvisoryRecord(input: NexusRegistryWriteInput): Promise<NexusAdvisoryStoredRecord> {
    const valid = validateNexusOutput(input.output);
    if (!valid.ok) {
      const summary = valid.errors.map((e) => `${e.category}:${e.message}`).join('; ');
      throw new Error(`NEXUS_OUTPUT_VALIDATION_FAILED ${summary}`);
    }
    const subject_id = (input.subject_id ?? '').trim() || null;
    return this.repo.insert({
      output: valid.value,
      subject_id,
    });
  }

  async listBySubjectScope(subject_scope: NexusSubjectScope, limit = 50): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query({ subject_scope, limit });
  }

  async listBySubjectId(subject_id: string, limit = 50): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query({ subject_id, limit });
  }

  async listByOutputType(output_type: NexusOutputType, limit = 50): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query({ output_type, limit });
  }

  async listRecent(limit = 50): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query({ limit });
  }

  async listActive(limit = 50): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query({ active_only: true, limit });
  }

  async listExpired(limit = 50): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query({ expired_only: true, limit });
  }

  async query(filter: NexusRegistryQuery): Promise<NexusAdvisoryStoredRecord[]> {
    return this.repo.query(filter);
  }
}

export class InMemoryNexusOutputRegistryRepo implements NexusOutputRegistryRepo {
  private rows: NexusAdvisoryStoredRecord[] = [];
  private seq = 0;

  async insert(input: {
    output: NexusOutputRecord;
    subject_id: string | null;
  }): Promise<NexusAdvisoryStoredRecord> {
    this.seq += 1;
    const row: NexusAdvisoryStoredRecord = {
      ...input.output,
      id: `nexus-${this.seq}`,
      subject_id: input.subject_id,
      created_at: new Date().toISOString(),
    };
    this.rows.unshift(row);
    return row;
  }

  async query(filter: NexusRegistryQuery): Promise<NexusAdvisoryStoredRecord[]> {
    const now = Date.now();
    let out = [...this.rows];

    if (filter.subject_scope) out = out.filter((r) => r.subject_scope === filter.subject_scope);
    if (filter.subject_id) out = out.filter((r) => r.subject_id === filter.subject_id);
    if (filter.output_type) out = out.filter((r) => r.output_type === filter.output_type);
    if (filter.generated_after) out = out.filter((r) => Date.parse(r.generated_at) >= Date.parse(filter.generated_after!));
    if (filter.generated_before) out = out.filter((r) => Date.parse(r.generated_at) <= Date.parse(filter.generated_before!));
    if (filter.active_only && !filter.expired_only) {
      out = out.filter((r) => !r.expires_at || Date.parse(r.expires_at) > now);
    } else if (filter.expired_only && !filter.active_only) {
      out = out.filter((r) => Boolean(r.expires_at) && Date.parse(r.expires_at!) <= now);
    }
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
    return out.slice(0, limit);
  }
}

