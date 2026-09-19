"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postJson, useApi } from "@/lib/hooks";
import type { UserPreferences } from "@/lib/db/schema";
import type { ProviderHealth } from "@/lib/providers/types";
import { MODE_TIMEFRAMES, TREND_SCOPES } from "@/lib/config/scoring";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import type { TradingMode, TrendScope } from "@/lib/types";
import { Eyebrow, GoldButton, Panel, SectionHeading, Skeleton, StatusDot } from "@/components/primitives";
import { TierChip } from "@/components/shell";
import { timeAgo } from "@/lib/utils/format";
import type { Tier } from "@/lib/config/tiers";

const MARKET_GROUPS = [
  "Forex Majors", "Forex Crosses", "Metals", "US Indices",
  "International Indices", "Crypto", "Stocks", "ETFs", "Commodities", "Bonds & Rates",
];

export default function SettingsPage() {
  const me = useApi<{ user: { name: string; email: string; preferences: UserPreferences }; tier: Tier }>("/api/user");
  const status = useApi<{
    demoMode: boolean; demoSources: string[]; providers: ProviderHealth[];
    ai: { configured: boolean }; storage: string; stripe: { configured: boolean }; cache: Record<string, number>;
    auth: { accountsAvailable: boolean; publicMode: boolean };
  }>("/api/status");

  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [scope, setScope] = useTrendScope();
  const [mode, setMode] = useTradingMode();
  // With no account there is no server profile; the browser holds these instead.
  const accountless = Boolean(me.data && !me.data.user);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data?.user) {
      setPrefs(me.data.user.preferences);
      setName(me.data.user.name);
    }
  }, [me.data]);

  async function save() {
    if (!prefs) return;
    await postJson("/api/user", { name, preferences: prefs }, "PATCH");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!me.data || (!prefs && !accountless)) return <Skeleton className="h-96" />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionHeading title="Settings" />

      {status.data && !status.data.auth.accountsAvailable ? (
        <Panel className="border-gold/30 bg-gold/5 p-5">
          <Eyebrow className="mb-2 text-gold">Accounts unavailable on this deployment</Eyebrow>
          <p className="text-sm text-mute">
            Signing in needs storage that survives between requests, and this host gives each request a read-only,
            non-shared filesystem. Rather than accept a signup that silently disappears, the app runs open: all market
            analysis works without an account, and your watchlist and alerts are saved in this browser.
          </p>
          <p className="mt-2 text-xs text-faint">
            To enable real accounts, connect a database (the repository ships a Prisma PostgreSQL schema) and set
            DATABASE_URL.
          </p>
        </Panel>
      ) : null}

      {me.data.user ? (
      <Panel className="p-5">
        <Eyebrow className="mb-3">Profile</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="eyebrow mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="eyebrow mb-1 block">Email</label>
            <input value={me.data.user.email} disabled className="w-full px-3 py-2 text-sm opacity-60" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <TierChip tier={me.data.tier} />
          <Link href="/subscription" className="text-xs uppercase tracking-widest text-gold hover:underline">Manage subscription →</Link>
        </div>
      </Panel>
      ) : null}

      <Panel className="p-5">
        <Eyebrow className="mb-3">Trading style</Eyebrow>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(MODE_TIMEFRAMES) as TradingMode[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                setMode(key);
                if (prefs) setPrefs({ ...prefs, mode: key });
              }}
              className={`border px-4 py-3 text-left transition ${
                mode === key ? "border-gold bg-gold/10" : "border-hairline hover:border-gold/50"
              }`}
            >
              <div className="display text-sm font-bold uppercase tracking-widest">{MODE_TIMEFRAMES[key].label}</div>
              <div className="mt-1 text-xs text-mute">{MODE_TIMEFRAMES[key].blurb}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          The trading style changes how much each timeframe contributes to the MD Direction Score. It does not change the evidence itself.
        </p>
      </Panel>

      <Panel className="p-5">
        <Eyebrow className="mb-3">Trend timeframes</Eyebrow>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(TREND_SCOPES) as TrendScope[]).map((key) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={`border px-4 py-3 text-left transition ${
                scope === key ? "border-gold bg-gold/10" : "border-hairline hover:border-gold/50"
              }`}
            >
              <div className="display text-sm font-bold uppercase tracking-widest">{TREND_SCOPES[key].label}</div>
              <div className="mt-1 text-xs text-mute">{TREND_SCOPES[key].blurb}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Applies to the MD Direction Score, the momentum score and conflict detection everywhere in the app.
          Timeframes outside the scope are still charted and still listed in the timeframe table — they just do not vote.
        </p>
      </Panel>

      {prefs ? (
        <>
      <Panel className="p-5">
        <Eyebrow className="mb-3">Preferred markets</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {MARKET_GROUPS.map((g) => {
            const on = prefs.markets.includes(g);
            return (
              <button
                key={g}
                onClick={() =>
                  setPrefs({ ...prefs, markets: on ? prefs.markets.filter((m) => m !== g) : [...prefs.markets, g] })
                }
                className={`border px-3 py-1.5 text-xs uppercase tracking-widest transition ${
                  on ? "border-gold bg-gold/10 text-gold" : "border-hairline text-mute hover:border-gold/50"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-5">
        <Eyebrow className="mb-3">Notifications</Eyebrow>
        <label className="flex items-center justify-between border-b border-hairline-soft py-3">
          <span className="text-sm">Browser notifications for triggered alerts</span>
          <input type="checkbox" checked={prefs.browserAlerts} onChange={(e) => setPrefs({ ...prefs, browserAlerts: e.target.checked })} className="h-4 w-4" />
        </label>
        <label className="flex items-center justify-between py-3">
          <span className="text-sm">Email notifications</span>
          <input type="checkbox" checked={prefs.emailAlerts} onChange={(e) => setPrefs({ ...prefs, emailAlerts: e.target.checked })} className="h-4 w-4" />
        </label>
        <p className="text-xs text-faint">
          Push and SMS delivery can be added through the same notification abstraction without changing alert logic.
        </p>
      </Panel>
        </>
      ) : null}

      <Panel className="p-5">
        <Eyebrow className="mb-3">Data sources</Eyebrow>
        {status.loading ? (
          <Skeleton className="h-32" />
        ) : status.data ? (
          <>
            {status.data.demoMode ? (
              <div className="mb-3 border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-gold">
                Demo mode is active for: {status.data.demoSources.join(", ")}. Add provider credentials to enable live analysis.
              </div>
            ) : null}
            <div className="space-y-2">
              {status.data.providers.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 border-b border-hairline-soft pb-2 last:border-b-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusDot state={p.ok ? (p.live ? "good" : "warn") : "bad"} />
                      <span className="text-sm">{p.label}</span>
                      <span className="text-[10px] uppercase tracking-widest text-faint">{p.kind}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-mute">{p.message}</p>
                  </div>
                  <div className="shrink-0 text-right text-[10px] uppercase tracking-widest text-faint">
                    <div>{p.live ? "Live" : "Demo"}</div>
                    <div>{p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "—"}</div>
                  </div>
                </div>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-hairline-soft pt-3 text-xs">
              <dt className="text-faint">AI provider</dt>
              <dd className="text-right">{status.data.ai.configured ? "Configured" : "Not configured — built-in explanations"}</dd>
              <dt className="text-faint">Payments</dt>
              <dd className="text-right">{status.data.stripe.configured ? "Stripe configured" : "Demo checkout"}</dd>
              <dt className="text-faint">Storage</dt>
              <dd className="text-right">{status.data.storage}</dd>
            </dl>
          </>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <Eyebrow className="mb-2">Disclaimer</Eyebrow>
        <p className="text-sm leading-relaxed text-mute">
          MD Market Direction provides market analysis and educational information. Directional scores are algorithmic assessments of available
          market data and are not guarantees of future performance or investment advice. Markets can move unexpectedly, and users are responsible
          for their own trading and investment decisions.
        </p>
        <p className="mt-2 text-xs text-faint">
          {prefs?.disclaimerAcceptedAt ? `Accepted ${timeAgo(prefs.disclaimerAcceptedAt)}.` : "Not yet acknowledged."}
        </p>
      </Panel>

      <div className="flex items-center gap-3 pb-4">
        {prefs ? <GoldButton onClick={save}>Save settings</GoldButton> : null}
        {prefs ? null : (
          <span className="text-xs text-faint">
            Trading style and trend timeframes are saved in this browser as you change them.
          </span>
        )}
        {saved ? <span className="text-xs text-bull">Saved.</span> : null}
      </div>
    </div>
  );
}
