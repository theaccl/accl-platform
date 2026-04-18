"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NavigationBar from "@/components/NavigationBar";
import { publicDisplayNameFromProfileUsername } from "@/lib/profileIdentity";
import { validateAcclUsername } from "@/lib/usernameRules";
import { supabase } from "@/lib/supabaseClient";

type ChatMsg = {
  id: string;
  created_at: string;
  sender_id: string;
  body: string;
  sender_username: string | null;
};

type ThreadRow = { thread_id: string; peer_id: string; last_at: string };

type LookupResult =
  | { ok: true; id: string; username: string | null }
  | { ok: false; message: string };

async function lookupPeerForMailbox(raw: string): Promise<LookupResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a username." };
  }
  const isEmailShape = trimmed.includes("@");
  let normalizedUsername: string | null = null;
  if (!isEmailShape) {
    const v = validateAcclUsername(trimmed);
    if (!v.ok) {
      return { ok: false, message: v.error };
    }
    normalizedUsername = v.username;
  }

  const { data, error } = await supabase.rpc("resolve_profile_for_challenge_lookup", {
    p_username: normalizedUsername,
    p_email: isEmailShape ? trimmed.toLowerCase() : null,
  });
  if (error) {
    return { ok: false, message: "Could not look up that player. Try again." };
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, message: "No player found with that username." };
  }
  const row = data as Record<string, unknown>;
  const id = row.id != null ? String(row.id) : "";
  if (!id) {
    return { ok: false, message: "No player found." };
  }
  const un =
    row.username != null && String(row.username).trim() !== "" ? String(row.username).trim() : null;
  return { ok: true, id, username: un };
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    if (!Number.isFinite(d)) return "—";
    const diff = Date.now() - d;
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TesterDmClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peerFromQuery = searchParams.get("peer")?.trim() ?? "";
  const toFromQuery = searchParams.get("to")?.trim() ?? "";

  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [peerId, setPeerId] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [composeInput, setComposeInput] = useState("");
  const [composeBusy, setComposeBusy] = useState(false);
  const [advancedPeerId, setAdvancedPeerId] = useState("");
  const [displayById, setDisplayById] = useState<Record<string, string>>({});
  const toParamHandled = useRef<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    setPeerId(peerFromQuery);
  }, [peerFromQuery]);

  useEffect(() => {
    setThreadId(null);
    setMessages([]);
  }, [peerId]);

  const loadThreads = useCallback(async () => {
    if (!token) return;
    setThreadsLoading(true);
    try {
      const res = await fetch("/api/chat/dm/threads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const j = (await res.json()) as { threads?: ThreadRow[] };
      setThreads(j.threads ?? []);
    } finally {
      setThreadsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const idsToHydrate = useMemo(() => {
    const s = new Set<string>();
    for (const t of threads) s.add(t.peer_id);
    if (peerId.trim()) s.add(peerId.trim());
    return [...s];
  }, [threads, peerId]);

  useEffect(() => {
    if (!idsToHydrate.length) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("profiles").select("id, username").in("id", idsToHydrate);
      if (cancelled || error || !data?.length) return;
      setDisplayById((prev) => {
        const next = { ...prev };
        for (const row of data as { id: string; username: string | null }[]) {
          next[row.id] = publicDisplayNameFromProfileUsername(row.username, row.id);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [idsToHydrate]);

  useEffect(() => {
    if (!toFromQuery || !token || !userId) return;
    if (toParamHandled.current === toFromQuery) return;
    let cancelled = false;
    void (async () => {
      const r = await lookupPeerForMailbox(toFromQuery);
      if (cancelled) return;
      toParamHandled.current = toFromQuery;
      if (!r.ok) {
        setErr(r.message);
        return;
      }
      if (r.id === userId) {
        setErr("You cannot message yourself.");
        return;
      }
      setPeerId(r.id);
      setErr(null);
      router.replace(`/tester/messages?peer=${encodeURIComponent(r.id)}`, { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [toFromQuery, token, userId, router]);

  const openThread = useCallback(async () => {
    if (!token || !peerId.trim() || peerId === userId) return;
    setErr(null);
    const res = await fetch("/api/chat/dm/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ peerId: peerId.trim() }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (j.error === "blocked") {
        setErr("You cannot message this player (blocked).");
      } else {
        setErr("Could not open this conversation.");
      }
      return;
    }
    const j = (await res.json()) as { thread_id?: string };
    if (j.thread_id) setThreadId(j.thread_id);
    void loadThreads();
  }, [peerId, token, userId, loadThreads]);

  const loadMessages = useCallback(async () => {
    if (!token || !threadId) return;
    const res = await fetch(
      `/api/chat/messages?channel=dm&threadId=${encodeURIComponent(threadId)}&limit=80`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-accl-viewer-ecosystem": "adult",
        },
      }
    );
    if (!res.ok) return;
    const j = (await res.json()) as { messages?: ChatMsg[] };
    setMessages(j.messages ?? []);
  }, [threadId, token]);

  useEffect(() => {
    if (!peerId.trim() || !token || !userId) return;
    if (peerId === userId) return;
    void openThread();
  }, [openThread, peerId, token, userId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  /** Realtime INSERT → immediate refetch (API applies mutes / ordering). Fallback poll if Realtime misses a frame. */
  useEffect(() => {
    if (!threadId || !token || !userId) return;
    const channel = supabase
      .channel(`dm-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tester_chat_messages",
          filter: `dm_thread_id=eq.${threadId}`,
        },
        () => {
          void loadMessages();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, token, userId, loadMessages]);

  useEffect(() => {
    const t = window.setInterval(() => void loadMessages(), 45000);
    return () => window.clearInterval(t);
  }, [loadMessages]);

  const selectPeer = useCallback(
    (id: string) => {
      if (!id.trim() || id === userId) return;
      setErr(null);
      setPeerId(id.trim());
      router.replace(`/tester/messages?peer=${encodeURIComponent(id.trim())}`, { scroll: false });
    },
    [router, userId]
  );

  const startChatFromUsername = async () => {
    if (!token || !userId || composeBusy) return;
    setComposeBusy(true);
    setErr(null);
    try {
      const r = await lookupPeerForMailbox(composeInput);
      if (!r.ok) {
        setErr(r.message);
        return;
      }
      if (r.id === userId) {
        setErr("You cannot message yourself.");
        return;
      }
      setComposeInput("");
      selectPeer(r.id);
    } finally {
      setComposeBusy(false);
    }
  };

  const applyAdvancedPeerId = () => {
    const t = advancedPeerId.trim();
    if (!UUID_RE.test(t)) {
      setErr("That does not look like a valid user ID.");
      return;
    }
    setErr(null);
    selectPeer(t);
    setAdvancedPeerId("");
  };

  const send = async () => {
    if (!token || !peerId.trim() || !draft.trim()) return;
    setErr(null);
    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-accl-viewer-ecosystem": "adult",
      },
      body: JSON.stringify({ channel: "dm", peerId: peerId.trim(), body: draft.trim() }),
    });
    if (!res.ok) {
      setErr("Send failed.");
      return;
    }
    const j = (await res.json()) as { dm_thread_id?: string };
    if (j.dm_thread_id) setThreadId(j.dm_thread_id);
    setDraft("");
    void loadMessages();
    void loadThreads();
  };

  const peerLabel = peerId.trim()
    ? displayById[peerId.trim()] ?? publicDisplayNameFromProfileUsername(null, peerId.trim())
    : null;

  if (!userId || !token) {
    return (
      <div className="min-h-screen bg-[#0D1117] text-[#e2e8f0]">
        <NavigationBar />
        <div className="mx-auto max-w-lg px-4 py-10">
          <p>Sign in to use your mailbox.</p>
          <Link href="/login" className="mt-4 inline-block text-sky-400 underline">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#e2e8f0]">
      <NavigationBar />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 border-b border-white/[0.08] pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Messages</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white" data-testid="mailbox-title">
            Mailbox
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            Direct messages with other players. Open a conversation below or start a new one by{" "}
            <span className="text-gray-300">ACCL username</span>.
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <aside
            className="flex w-full min-w-0 flex-col gap-4 lg:max-w-sm lg:shrink-0"
            aria-label="Inbox and new message"
          >
            <section
              className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-lg shadow-black/20"
              data-testid="mailbox-compose"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">New message</h2>
              <p className="mt-1 text-xs text-gray-500">Message someone by username (same as on your profile).</p>
              <label htmlFor="mailbox-compose-input" className="sr-only">
                Recipient username
              </label>
              <input
                id="mailbox-compose-input"
                data-testid="mailbox-compose-username"
                value={composeInput}
                onChange={(e) => setComposeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void startChatFromUsername();
                }}
                placeholder="@username"
                autoComplete="off"
                className="mt-3 w-full rounded-xl border border-[#334155] bg-[#0f172a] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
              <button
                type="button"
                data-testid="mailbox-compose-open"
                disabled={composeBusy || !composeInput.trim()}
                onClick={() => void startChatFromUsername()}
                className="mt-3 w-full rounded-xl border border-sky-700/50 bg-sky-950/40 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-950/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {composeBusy ? "Looking up…" : "Open chat"}
              </button>

              <details className="mt-4 border-t border-white/[0.06] pt-3">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
                  Advanced: open by user ID
                </summary>
                <p className="mt-2 text-[11px] text-gray-600">
                  For deep links (e.g. from another screen). Same as <code className="text-gray-500">?peer=</code> in
                  the URL.
                </p>
                <input
                  value={advancedPeerId}
                  onChange={(e) => setAdvancedPeerId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="mt-2 w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-2 font-mono text-xs text-gray-200"
                />
                <button
                  type="button"
                  onClick={applyAdvancedPeerId}
                  className="mt-2 text-xs font-medium text-sky-400 underline hover:text-sky-300"
                >
                  Use this ID
                </button>
              </details>
            </section>

            <section
              className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-lg shadow-black/20"
              data-testid="mailbox-inbox"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversations</h2>
              {threadsLoading ? (
                <p className="mt-3 text-sm text-gray-500">Loading…</p>
              ) : threads.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No conversations yet. Start a new message above.</p>
              ) : (
                <ul className="mt-2 max-h-[min(52vh,420px)] space-y-1 overflow-y-auto pr-1">
                  {threads.map((t) => {
                    const label =
                      displayById[t.peer_id] ?? publicDisplayNameFromProfileUsername(null, t.peer_id);
                    const active = peerId.trim() === t.peer_id;
                    return (
                      <li key={t.thread_id}>
                        <button
                          type="button"
                          data-testid={`mailbox-thread-${t.thread_id}`}
                          onClick={() => selectPeer(t.peer_id)}
                          className={`flex w-full flex-col rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-sky-500/50 bg-sky-950/35"
                              : "border-transparent bg-[#0f1420] hover:border-white/10 hover:bg-[#151d2c]"
                          }`}
                        >
                          <span className="truncate text-sm font-medium text-white">{label}</span>
                          <span className="text-[11px] text-gray-500">{formatRelativeTime(t.last_at)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>

          <section
            className="min-w-0 flex-1 rounded-2xl border border-[#2a3442] bg-[#111723] p-4 sm:p-5"
            aria-label="Active conversation"
            data-testid="mailbox-conversation"
          >
            {!peerId.trim() ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                <p className="text-sm text-gray-400">Select a conversation or start a new message.</p>
                <p className="mt-2 max-w-sm text-xs text-gray-600">
                  Your inbox shows people you have already messaged. Links from elsewhere open a chat automatically.
                </p>
              </div>
            ) : peerId.trim() === userId ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                <p className="text-sm text-red-400">You cannot message yourself.</p>
                <button
                  type="button"
                  className="mt-4 text-sm text-sky-400 underline"
                  onClick={() => {
                    setPeerId("");
                    router.replace("/tester/messages", { scroll: false });
                  }}
                >
                  Clear
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-white/[0.06] pb-3">
                  <h2 className="text-lg font-semibold text-white">{peerLabel}</h2>
                  <p className="mt-0.5 font-mono text-[11px] text-gray-500">{peerId.trim()}</p>
                </div>
                {err ? (
                  <p className="mt-3 text-sm text-red-400" role="alert">
                    {err}
                  </p>
                ) : null}
                <div
                  className="mt-4 max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-[#334155] bg-[#0f172a] p-3 text-sm"
                  data-testid="tester-dm-thread"
                >
                  {messages.length === 0 ? (
                    <p className="text-gray-500">No messages yet — say hello below.</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="mb-3">
                        <span className="text-gray-400">
                          {publicDisplayNameFromProfileUsername(m.sender_username, m.sender_id)}
                        </span>
                        <span className="text-gray-600"> · </span>
                        <span className="text-gray-200">{m.body}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="Write a message…"
                    data-testid="mailbox-message-draft"
                    className="min-h-[88px] w-full flex-1 resize-y rounded-xl border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                  />
                  <button
                    type="button"
                    data-testid="mailbox-send"
                    onClick={() => void send()}
                    className="shrink-0 rounded-xl border border-sky-600/50 bg-sky-900/30 px-5 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-900/45"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-gray-600">
          <Link href="/" className="text-gray-500 underline hover:text-gray-400">
            Home
          </Link>
        </p>
      </main>
    </div>
  );
}
