"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Adult ecosystem only — K-12 hides referral surfaces per platform rules.
 */
export default function InvitePanel({ userId, k12 }: { userId: string | null; k12: boolean }) {
  const [copied, setCopied] = useState(false);

  const { inviteUrl, refCode } = useMemo(() => {
    const ref = userId ? userId.replace(/-/g, "").slice(0, 10) : "";
    if (typeof window === "undefined") {
      return { inviteUrl: "", refCode: ref };
    }
    const u = new URL(`${window.location.origin}/nexus`);
    if (ref) u.searchParams.set("ref", ref);
    return { inviteUrl: u.toString(), refCode: ref };
  }, [userId]);

  const copyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [inviteUrl]);

  if (k12) return null;

  return (
    <section
      className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
      aria-label="Invite"
    >
      <p className="text-xs text-gray-400">Invite</p>
      <p className="mt-1 text-sm text-gray-200">Share a link to Nexus. Optional ref code is included when you are signed in.</p>
      {refCode ? (
        <p className="mt-2 text-[11px] text-gray-500 font-mono">
          Ref: <span className="text-gray-400">{refCode}</span>
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">Sign in to attach a referral code to your link.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyInvite}
          disabled={!inviteUrl}
          className="rounded-lg bg-red-800/80 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white"
        >
          {copied ? "Copied" : "Copy Invite"}
        </button>
      </div>
    </section>
  );
}
