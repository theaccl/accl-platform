"use client";

import { useEffect, useState } from "react";
import NavigationBar from "@/components/NavigationBar";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type ControlCenterPayload = {
  summary_strip?: {
    queue_health?: { level?: string; reason?: string };
    bot_health?: { level?: string; reason?: string };
    trainer_health?: { level?: string; reason?: string };
    tournament_enforcement_health?: { level?: string; reason?: string };
    env_health?: { level?: string; reason?: string };
  };
  queue?: {
    statuses_surfaced?: string[];
    stale_threshold_seconds?: number;
    last_success_at?: string | null;
    last_failure_at?: string | null;
    failed_jobs?: Array<Record<string, unknown>>;
    stale_running_jobs?: Array<Record<string, unknown>>;
    summary?: Record<string, unknown> | null;
  };
  engine?: {
    statuses_surfaced?: string[];
    recent_completed_job_engine_visibility?: Array<Record<string, unknown>>;
  };
  bot?: {
    statuses_surfaced?: string[];
    stale_threshold_seconds?: number;
    last_success_at?: string | null;
    last_failure_at?: string | null;
    anomalies?: Array<Record<string, unknown>>;
    recent_games?: Array<Record<string, unknown>>;
  };
  trainer?: {
    statuses_surfaced?: string[];
    stale_threshold_seconds?: number;
    last_success_at?: string | null;
    last_failure_at?: string | null;
    outcomes_by_completed_job?: Array<Record<string, unknown>>;
  };
  tournament_enforcement?: {
    statuses_surfaced?: string[];
    reopened_tournament_games?: Array<Record<string, unknown>>;
    recent_protected_position_fingerprints?: Array<Record<string, unknown>>;
  };
  env_health?: {
    required?: Record<string, boolean>;
    bot_profile_provisioning?: Record<string, unknown>;
  };
  generated_at?: string;
  error?: string;
};

type NexusAdvisoryPayload = {
  filters?: {
    output_type?: string | null;
    subject_scope?: string | null;
    status?: string;
    window_hours?: number;
    limit?: number;
  };
  total?: number;
  items?: Array<
    Record<string, unknown> & {
      operator_actions?: Array<Record<string, unknown>>;
    }
  >;
  error?: string;
};

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#161b22] rounded-xl p-4">
      <h2 className="text-base font-semibold mb-3">{props.title}</h2>
      {props.children}
    </section>
  );
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function levelClass(level?: string): string {
  if (level === "green") return "bg-green-900/40 text-green-300 border-green-700";
  if (level === "yellow") return "bg-yellow-900/40 text-yellow-300 border-yellow-700";
  return "bg-red-900/40 text-red-300 border-red-700";
}

function ageLabel(seconds: unknown): string {
  const n = typeof seconds === "number" ? seconds : Number(seconds ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0s";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

export default function ModeratorControlCenterPage() {
  const [data, setData] = useState<ControlCenterPayload | null>(null);
  const [nexusData, setNexusData] = useState<NexusAdvisoryPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string>("");
  const [actionState, setActionState] = useState<string>("");
  const [nexusOutputType, setNexusOutputType] = useState<string>("all");
  const [nexusSubjectScope, setNexusSubjectScope] = useState<string>("all");
  const [nexusStatus, setNexusStatus] = useState<string>("active");
  const [nexusWindowHours, setNexusWindowHours] = useState<number>(168);
  const [nexusLimit, setNexusLimit] = useState<number>(40);

  function advisoryBadgeClass(outputType: string): string {
    if (outputType === "insight") return "bg-blue-900/40 text-blue-300 border-blue-700";
    if (outputType === "warning") return "bg-yellow-900/40 text-yellow-300 border-yellow-700";
    if (outputType === "recommendation") return "bg-green-900/40 text-green-300 border-green-700";
    if (outputType === "anomaly_flag") return "bg-red-900/40 text-red-300 border-red-700";
    return "bg-gray-900/40 text-gray-300 border-gray-700";
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const t = sessionData.session?.access_token;
      if (!t) {
        setError("No auth session. Sign in with moderator account.");
        setLoading(false);
        return;
      }
      setToken(t);
      const res = await fetch("/api/operator/control-center", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const text = await res.text();
      let payload: ControlCenterPayload = {};
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text.slice(0, 300) };
      }
      if (!res.ok) {
        setError(payload.error ?? `Request failed: ${res.status}`);
        setData(payload);
      } else {
        setData(payload);
      }

      const qs = new URLSearchParams();
      if (nexusOutputType !== "all") qs.set("output_type", nexusOutputType);
      if (nexusSubjectScope !== "all") qs.set("subject_scope", nexusSubjectScope);
      qs.set("status", nexusStatus);
      qs.set("window_hours", String(nexusWindowHours));
      qs.set("limit", String(nexusLimit));
      const nexusRes = await fetch(`/api/operator/nexus-advisories?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const nexusText = await nexusRes.text();
      let nPayload: NexusAdvisoryPayload = {};
      try {
        nPayload = JSON.parse(nexusText);
      } catch {
        nPayload = { error: nexusText.slice(0, 300) };
      }
      setNexusData(nPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [nexusOutputType, nexusSubjectScope, nexusStatus, nexusWindowHours, nexusLimit]);

  async function runAction(payload: Record<string, unknown>) {
    if (!token) return;
    setActionState("Running action...");
    try {
      const res = await fetch("/api/operator/control-center", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        setActionState(`Action failed: ${text.slice(0, 200)}`);
      } else {
        setActionState(`Action complete: ${text.slice(0, 180)}`);
        await load();
      }
    } catch (e) {
      setActionState(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Operator Control Center</h1>
          <button onClick={() => void load()} className="px-3 py-2 text-sm rounded bg-[#21262d] hover:bg-[#30363d]">
            Refresh
          </button>
        </div>
        <p className="text-sm text-gray-400">
          Live backend truth view for queue, engine, bots, trainer, tournament enforcement, and env health.
        </p>
        {data?.summary_strip ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {Object.entries(data.summary_strip).map(([k, v]) => (
              <div key={k} className={`rounded border px-2 py-2 text-xs ${levelClass(v?.level)}`}>
                <p className="font-semibold">{k}</p>
                <p>{v?.level ?? "red"}</p>
                <p className="opacity-90">{v?.reason ?? "unknown"}</p>
              </div>
            ))}
          </div>
        ) : null}
        {loading ? <p className="text-sm text-gray-300">Loading...</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {actionState ? <p className="text-sm text-blue-300">{actionState}</p> : null}
        {data ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Queue Monitoring">
              <p className="text-xs text-gray-400 mb-2">
                stale threshold: {data.queue?.stale_threshold_seconds ?? "?"}s | last success:{" "}
                {String(data.queue?.last_success_at ?? "n/a")} | last failure:{" "}
                {String(data.queue?.last_failure_at ?? "n/a")}
              </p>
              {(data.queue?.failed_jobs ?? []).slice(0, 8).map((j, i) => (
                <div key={`f-${i}`} className="mb-2 border border-[#30363d] rounded p-2 text-xs">
                  <p>failed job: {String(j.id ?? "")}</p>
                  <p>game: {String(j.game_id ?? "")}</p>
                  <p>age in state: {ageLabel(j.age_in_state_seconds)}</p>
                  <div className="flex gap-3 mt-1">
                    <Link className="underline" href={String((j.links as Record<string, string> | undefined)?.analyze ?? "#")}>
                      open analyze
                    </Link>
                    <button
                      className="underline"
                      onClick={() => void runAction({ action: "retry_failed_queue_job", job_id: j.id })}
                    >
                      retry failed job
                    </button>
                  </div>
                </div>
              ))}
              <pre className="text-xs whitespace-pre-wrap">{pretty(data.queue ?? {})}</pre>
            </Card>
            <Card title="Engine Execution Visibility">
              {(data.engine?.recent_completed_job_engine_visibility ?? []).slice(0, 8).map((e, i) => (
                <div key={`e-${i}`} className="mb-2 border border-[#30363d] rounded p-2 text-xs">
                  <p>job: {String(e.job_id ?? "")}</p>
                  <p>game: {String(e.game_id ?? "")}</p>
                  <p>artifact: {String(e.artifact_id ?? "")}</p>
                  <p>status: {String(e.status ?? "")}</p>
                  <div className="flex gap-3 mt-1">
                    <Link className="underline" href={String((e.links as Record<string, string> | undefined)?.analyze ?? "#")}>
                      open analyze
                    </Link>
                    {String(e.status ?? "") !== "ok" ? (
                      <button
                        className="underline"
                        onClick={() => void runAction({ action: "rerun_trainer_generation", game_id: e.game_id })}
                      >
                        rerun trainer generation
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <pre className="text-xs whitespace-pre-wrap">{pretty(data.engine ?? {})}</pre>
            </Card>
            <Card title="Bot Activity Visibility">
              <p className="text-xs text-gray-400 mb-2">stale threshold: {data.bot?.stale_threshold_seconds ?? "?"}s</p>
              {(data.bot?.anomalies ?? []).slice(0, 8).map((b, i) => (
                <div key={`b-${i}`} className="mb-2 border border-[#30363d] rounded p-2 text-xs">
                  <p>game: {String(b.game_id ?? "")}</p>
                  <p>user: {String(b.user_id ?? "")}</p>
                  <p>anomaly: {String(b.anomaly ?? "")}</p>
                  <p>age in state: {ageLabel(b.age_in_state_seconds)}</p>
                  <div className="flex gap-3 mt-1">
                    <Link className="underline" href={String((b.links as Record<string, string> | undefined)?.game ?? "#")}>
                      open game
                    </Link>
                    <Link className="underline" href={String((b.links as Record<string, string> | undefined)?.analyze ?? "#")}>
                      open analyze
                    </Link>
                  </div>
                </div>
              ))}
              <pre className="text-xs whitespace-pre-wrap">{pretty(data.bot ?? {})}</pre>
            </Card>
            <Card title="Trainer Generation Visibility">
              <p className="text-xs text-gray-400 mb-2">
                stale threshold: {data.trainer?.stale_threshold_seconds ?? "?"}s | last success:{" "}
                {String(data.trainer?.last_success_at ?? "n/a")} | last failure:{" "}
                {String(data.trainer?.last_failure_at ?? "n/a")}
              </p>
              {(data.trainer?.outcomes_by_completed_job ?? []).slice(0, 8).map((t, i) => (
                <div key={`t-${i}`} className="mb-2 border border-[#30363d] rounded p-2 text-xs">
                  <p>job: {String(t.job_id ?? "")}</p>
                  <p>game: {String(t.game_id ?? "")}</p>
                  <p>status: {String(t.status ?? "")}</p>
                  <p>age in state: {ageLabel(t.age_in_state_seconds)}</p>
                  <div className="flex gap-3 mt-1">
                    <Link className="underline" href={String((t.links as Record<string, string> | undefined)?.train ?? "#")}>
                      open train
                    </Link>
                    {String(t.status ?? "") !== "generated_for_both_players" ? (
                      <button
                        className="underline"
                        onClick={() => void runAction({ action: "rerun_trainer_generation", game_id: t.game_id })}
                      >
                        rerun trainer generation
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <pre className="text-xs whitespace-pre-wrap">{pretty(data.trainer ?? {})}</pre>
            </Card>
            <Card title="Tournament Enforcement Visibility">
              {(data.tournament_enforcement?.reopened_tournament_games ?? []).slice(0, 8).map((g, i) => (
                <div key={`te-${i}`} className="mb-2 border border-[#30363d] rounded p-2 text-xs">
                  <p>game: {String(g.game_id ?? "")}</p>
                  <p>issue: {String(g.issue ?? "")}</p>
                  <div className="flex gap-3 mt-1">
                    <Link className="underline" href={String((g.links as Record<string, string> | undefined)?.game ?? "#")}>
                      open game
                    </Link>
                    <Link className="underline" href={String((g.links as Record<string, string> | undefined)?.analyze ?? "#")}>
                      open analyze
                    </Link>
                  </div>
                </div>
              ))}
              <pre className="text-xs whitespace-pre-wrap">{pretty(data.tournament_enforcement ?? {})}</pre>
            </Card>
            <Card title="Env/Config Health">
              <pre className="text-xs whitespace-pre-wrap">{pretty(data.env_health ?? {})}</pre>
            </Card>
            <Card title="NEXUS Advisory Panel (Read-Only)">
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                <select
                  value={nexusOutputType}
                  onChange={(e) => setNexusOutputType(e.target.value)}
                  className="bg-[#0D1117] border border-[#30363d] rounded px-2 py-1"
                >
                  <option value="all">all output types</option>
                  <option value="insight">insight</option>
                  <option value="warning">warning</option>
                  <option value="recommendation">recommendation</option>
                  <option value="anomaly_flag">anomaly_flag</option>
                </select>
                <select
                  value={nexusSubjectScope}
                  onChange={(e) => setNexusSubjectScope(e.target.value)}
                  className="bg-[#0D1117] border border-[#30363d] rounded px-2 py-1"
                >
                  <option value="all">all scopes</option>
                  <option value="player">player</option>
                  <option value="game">game</option>
                  <option value="system">system</option>
                  <option value="moderation">moderation</option>
                </select>
                <select
                  value={nexusStatus}
                  onChange={(e) => setNexusStatus(e.target.value)}
                  className="bg-[#0D1117] border border-[#30363d] rounded px-2 py-1"
                >
                  <option value="active">active</option>
                  <option value="expired">expired</option>
                  <option value="all">all</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={nexusWindowHours}
                  onChange={(e) => setNexusWindowHours(Math.max(1, Number(e.target.value || 168)))}
                  className="w-24 bg-[#0D1117] border border-[#30363d] rounded px-2 py-1"
                  title="window hours"
                />
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={nexusLimit}
                  onChange={(e) => setNexusLimit(Math.max(1, Math.min(200, Number(e.target.value || 40))))}
                  className="w-20 bg-[#0D1117] border border-[#30363d] rounded px-2 py-1"
                  title="limit"
                />
              </div>
              <p className="text-xs text-gray-400 mb-2">
                NEXUS advisory is separate from operator execution. Any action shown below routes through existing bounded endpoints.
              </p>
              {(nexusData?.items ?? []).map((row, i) => (
                <div key={`nx-${i}`} className="mb-2 border border-[#30363d] rounded p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded border ${advisoryBadgeClass(String(row.output_type ?? ""))}`}>
                      {String(row.output_type ?? "")}
                    </span>
                    <span className="text-gray-300">scope: {String(row.subject_scope ?? "")}</span>
                    <span className="text-gray-300">subject_id: {String(row.subject_id ?? "n/a")}</span>
                    <span className="text-gray-300">confidence: {String(row.confidence ?? "")}</span>
                    <span className="text-gray-300">status: {String(row.status ?? "")}</span>
                    <span className="text-gray-300">priority: {String(row.display_priority ?? "")}</span>
                    <span className="text-gray-300">quality: {String(row.quality_score ?? "")}</span>
                  </div>
                  <p className="font-semibold">{String((row.content as Record<string, unknown> | undefined)?.title ?? "")}</p>
                  <p className="text-gray-300">{String((row.content as Record<string, unknown> | undefined)?.summary ?? "")}</p>
                  <div className="mt-1 text-gray-400">
                    <p>model_version: {String(row.model_version ?? "")}</p>
                    <p>policy_version: {String(row.policy_version ?? "")}</p>
                    <p>generated_at: {String(row.generated_at ?? "")}</p>
                    <p>expires_at: {String(row.expires_at ?? "null")}</p>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer">source_refs</summary>
                    <pre className="text-xs whitespace-pre-wrap">{pretty(row.source_refs ?? [])}</pre>
                  </details>
                  <details className="mt-1">
                    <summary className="cursor-pointer">operator actions (safe only)</summary>
                    <div className="mt-1 space-y-2">
                      {((row.operator_actions ?? []) as Array<Record<string, unknown>>).length === 0 ? (
                        <p className="text-gray-400">No eligible actions for this advisory class.</p>
                      ) : (
                        ((row.operator_actions ?? []) as Array<Record<string, unknown>>).map((act, idx) => {
                          const type = String(act.action_type ?? "");
                          const explanation = String(act.explanation ?? "");
                          if (type === "open_triage_page") {
                            return (
                              <div key={`nxa-${i}-${idx}`} className="border border-[#30363d] rounded p-2">
                                <p>{type}</p>
                                <p className="text-gray-400">{explanation}</p>
                                <Link className="underline" href={String(act.route ?? "#")}>
                                  Open triage page
                                </Link>
                              </div>
                            );
                          }
                          if (type === "rerun_trainer_generation") {
                            const body = act.body as Record<string, unknown> | undefined;
                            return (
                              <div key={`nxa-${i}-${idx}`} className="border border-[#30363d] rounded p-2">
                                <p>{type}</p>
                                <p className="text-gray-400">{explanation}</p>
                                <button
                                  className="underline"
                                  onClick={() => void runAction((body ?? {}) as Record<string, unknown>)}
                                >
                                  Run safe action
                                </button>
                              </div>
                            );
                          }
                          if (type === "retry_failed_queue_job") {
                            const failedJobId = String(data?.queue?.failed_jobs?.[0]?.id ?? "");
                            return (
                              <div key={`nxa-${i}-${idx}`} className="border border-[#30363d] rounded p-2">
                                <p>{type}</p>
                                <p className="text-gray-400">{explanation}</p>
                                {failedJobId ? (
                                  <button
                                    className="underline"
                                    onClick={() =>
                                      void runAction({
                                        action: "retry_failed_queue_job",
                                        job_id: failedJobId,
                                      })
                                    }
                                  >
                                    Retry latest failed queue job ({failedJobId})
                                  </button>
                                ) : (
                                  <p className="text-gray-500">No failed queue job available for retry context.</p>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={`nxa-${i}-${idx}`} className="border border-[#30363d] rounded p-2">
                              <p>{type}</p>
                              <p className="text-gray-400">{explanation}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </details>
                </div>
              ))}
              <pre className="text-xs whitespace-pre-wrap">{pretty(nexusData ?? {})}</pre>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

