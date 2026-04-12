import type { NexusPayoutTrust } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";

function fmtUtc(utc: string) {
  return new Date(utc).toUTCString();
}

export default function PayoutTrustModule({ trust, k12 }: { trust: NexusPayoutTrust; k12: boolean }) {
  if (k12) {
    return (
      <ExpandablePanel
        title="Rewards & trust (K–12)"
        subtitle="Recognition-first — no cash ledger on this surface"
        statusText="scoped"
        collapsed={
          <div className="space-y-2 text-xs text-gray-300">
            <p>Adult payout history stays in the 18+ ecosystem. K–12 shows progress and recognition only.</p>
            <p className="text-[11px] text-cyan-200/80">Results are checked before they count.</p>
          </div>
        }
        expanded={
          <p className="text-xs text-gray-400">
            Structured event rewards for school programs can be linked later without exposing adult economics here.
          </p>
        }
        k12={k12}
      />
    );
  }

  const collapsed = (
    <div className="space-y-2 text-xs text-gray-300">
      {trust.platform_entity_name ? (
        <p className="text-[11px] text-gray-500">
          <span className="text-gray-400">{trust.platform_entity_name}</span>
          {trust.payout_descriptor ? (
            <>
              {" "}
              · <span className="text-gray-500">{trust.payout_descriptor}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <p>
        Recent payouts (30d): <span className="text-white">{trust.recent_count}</span> · Total:{" "}
        <span className="text-white">${trust.total_recent_amount_usd}</span>
      </p>
      <p className="text-gray-400">
        Last recorded: {trust.last_payout_at ? fmtUtc(trust.last_payout_at) : "—"}
      </p>
      <p className="text-[11px] text-gray-500">
        Verified payouts · secure payment handling · confirmed results only · outcomes verified before reward distribution
      </p>
      <p className="text-[10px] text-gray-500 mt-1 border-t border-[#2a3442] pt-2">
        Money is separate from gameplay: entry and payouts are ledger-backed, webhook-confirmed, and auditable. No
        pay-to-win modifiers — payouts follow verified results only.
      </p>
    </div>
  );

  const expanded = (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">
        Payouts shown are confirmed recorded results in Nexus. This is not a bank statement and does not imply withdrawal
        timing or method. Tournament outcomes are verified before rewards appear here. Financial rows are append-only in
        the payment ledger — adjustments appear as explicit refund or payout lines.
      </p>
      <div className="space-y-2 max-h-64 overflow-auto pr-1">
        {trust.ledger.length === 0 ? (
          <p className="text-sm text-gray-400">No recent ledger rows in this window.</p>
        ) : (
          trust.ledger.map((row) => (
            <div key={row.id} className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">{row.label}</p>
                  <p className="text-xs text-gray-400">{row.category}</p>
                </div>
                <span
                  className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-300/90 border border-emerald-700/40 rounded px-1.5 py-0.5"
                  title="Recorded result"
                >
                  Verified
                </span>
              </div>
              <p className="text-xs text-red-200 mt-1">${row.amount_usd} · {fmtUtc(row.utc)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <ExpandablePanel
      title="Payout trust"
      subtitle="Compliance-aware — transparent, not flashy"
      statusText={`${trust.recent_count} in 30d`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}
