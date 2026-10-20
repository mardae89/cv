"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { postJson, useApi } from "@/lib/hooks";
import type { Tier, TierDefinition } from "@/lib/config/tiers";
import { Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Suspense } from "react";

function SubscriptionInner() {
  const params = useSearchParams();
  const { data, loading, refresh } = useApi<{
    tier: Tier;
    subscription: { status: string; provider: string; currentPeriodEnd: number | null };
    tiers: TierDefinition[];
    stripeConfigured: boolean;
  }>("/api/subscription");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    params.get("checkout") === "success" ? "Checkout complete. Your plan will update once payment is confirmed." : null,
  );

  async function choose(tier: Tier) {
    setBusy(tier);
    setMessage(null);
    try {
      const res = await postJson<{ mode: string; url: string | null; message: string }>("/api/subscription", { tier });
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setMessage(res.message);
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    const res = await postJson<{ message: string }>("/api/subscription", { action: "cancel" });
    setMessage(res.message);
    refresh();
    setBusy(null);
  }

  if (loading && !data) return <Skeleton className="h-96" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading title="Subscription" subtitle="Choose the level of market intelligence you need." />

      {!data?.stripeConfigured ? (
        <div className="border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">
          Stripe is not configured on this instance, so plan changes are applied in demo mode. Set{" "}
          <code className="text-bone">STRIPE_SECRET_KEY</code>, <code className="text-bone">STRIPE_PRICE_PRO</code> and{" "}
          <code className="text-bone">STRIPE_PRICE_ELITE</code> to enable real checkout. Entitlements are always written server-side.
        </div>
      ) : null}

      {message ? <div className="border border-hairline bg-panel px-4 py-3 text-sm text-mute">{message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {data?.tiers.map((t) => {
          const current = data.tier === t.id;
          return (
            <Panel key={t.id} className={`flex flex-col p-6 ${t.id === "pro" ? "border-gold/40" : ""}`}>
              {t.id === "pro" ? <div className="gold-line -mx-6 -mt-6 mb-5" /> : null}
              <Eyebrow>{t.name}</Eyebrow>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="display text-3xl font-extrabold">${t.priceMonthly}</span>
                <span className="text-xs text-faint">/month</span>
              </div>
              <p className="mt-2 text-sm text-mute">{t.tagline}</p>
              <ul className="mt-5 flex-1 space-y-2">
                {t.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 text-gold">✓</span>
                    <span className="text-bone">{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {current ? (
                  <div className="border border-hairline px-4 py-2.5 text-center font-display text-xs uppercase tracking-widest text-mute">
                    Current plan
                  </div>
                ) : t.id === "free" ? (
                  <GhostButton className="w-full" onClick={cancel} disabled={busy !== null}>
                    Downgrade to Free
                  </GhostButton>
                ) : (
                  <GoldButton className="w-full" onClick={() => choose(t.id)} disabled={busy !== null}>
                    {busy === t.id ? "Starting…" : `Start ${t.name}`}
                  </GoldButton>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {data ? (
        <Panel className="p-5">
          <Eyebrow className="mb-2">Current subscription</Eyebrow>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-faint">Plan</dt><dd className="text-right uppercase">{data.tier}</dd>
            <dt className="text-faint">Status</dt><dd className="text-right">{data.subscription.status}</dd>
            <dt className="text-faint">Billing provider</dt><dd className="text-right">{data.subscription.provider}</dd>
            <dt className="text-faint">Renews</dt>
            <dd className="text-right">
              {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toDateString() : "—"}
            </dd>
          </dl>
        </Panel>
      ) : null}
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SubscriptionInner />
    </Suspense>
  );
}
