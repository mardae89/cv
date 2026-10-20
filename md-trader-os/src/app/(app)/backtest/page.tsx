"use client";

import { useState } from "react";
import { postJson, useApi } from "@/lib/hooks";
import type { BacktestResult } from "@/lib/engine/backtest";
import { Paywall } from "@/components/paywall";
import { Eyebrow, GoldButton, Panel, SectionHeading, Skeleton, ErrorState } from "@/components/primitives";
import { fmtPct, fmtPrice } from "@/lib/utils/format";

export default function BacktestPage() {
  const access = useApi<{ saved: unknown[] }>("/api/backtest");
  const [form, setForm] = useState({
    symbol: "XAU/USD", timeframe: "1D", direction: "bullish", minScore: 75, holdingBars: 10,
  });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (access.upgrade) return <Paywall requiredTier={access.upgrade.requiredTier} featureName="The backtesting engine" />;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ result: BacktestResult }>("/api/backtest", form);
      setResult(res.result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading
        title="Backtesting"
        subtitle="What happened historically when the price-derived score reached a given level?"
      />

      <div className="border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">
        Historical results describe what happened in the past under these conditions. They are not evidence of future performance and must not be
        treated as a strategy return.
      </div>

      <Panel className="p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Eyebrow className="mb-1">Market</Eyebrow>
            <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} className="w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <Eyebrow className="mb-1">Timeframe</Eyebrow>
            <select value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })} className="w-full px-3 py-2 text-sm">
              {["1H", "4H", "1D", "1W"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Eyebrow className="mb-1">Direction</Eyebrow>
            <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className="w-full px-3 py-2 text-sm">
              <option value="bullish">Bullish</option>
              <option value="bearish">Bearish</option>
            </select>
          </div>
          <div>
            <Eyebrow className="mb-1">Minimum score</Eyebrow>
            <select value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })} className="w-full px-3 py-2 text-sm">
              {[50, 60, 70, 75, 80, 85, 90].map((s) => <option key={s} value={s}>{s}+</option>)}
            </select>
          </div>
          <div>
            <Eyebrow className="mb-1">Holding period (bars)</Eyebrow>
            <input type="number" min={1} max={120} value={form.holdingBars} onChange={(e) => setForm({ ...form, holdingBars: Number(e.target.value) })} className="w-full px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4">
          <GoldButton onClick={run} disabled={busy}>{busy ? "Running…" : "Run backtest"}</GoldButton>
        </div>
      </Panel>

      {error ? <ErrorState message={error} /> : null}
      {busy ? <Skeleton className="h-64" /> : null}

      {result && !busy ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Signals" value={String(result.signals)} />
            <Stat label="Win rate" value={`${result.winRate.toFixed(1)}%`} tone={result.winRate >= 50 ? "good" : "bad"} />
            <Stat label="Average return" value={fmtPct(result.avgReturnPct)} tone={result.avgReturnPct >= 0 ? "good" : "bad"} />
            <Stat label="Median return" value={fmtPct(result.medianReturnPct)} />
            <Stat label="Best" value={fmtPct(result.bestPct)} tone="good" />
            <Stat label="Worst" value={fmtPct(result.worstPct)} tone="bad" />
            <Stat label="Avg max favourable" value={fmtPct(result.avgMfePct)} />
            <Stat label="Avg max adverse" value={fmtPct(result.avgMaePct)} />
            <Stat label="Max drawdown (sum of returns)" value={`${result.maxDrawdownPct.toFixed(2)}%`} />
            <Stat label="Profit factor" value={result.profitFactor != null ? result.profitFactor.toFixed(2) : "Not enough data"} />
            <Stat label="Bars tested" value={String(result.barsTested)} />
          </div>

          <Panel className="p-4">
            <Eyebrow className="mb-2">Method</Eyebrow>
            <p className="text-sm text-mute">{result.note}</p>
          </Panel>

          {result.trades.length ? (
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    {["Date", "Score", "Entry", "Exit", "Return", "Max favourable", "Max adverse"].map((h) => (
                      <th key={h} className="px-3 py-2 text-[10px] uppercase tracking-widest text-faint">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(-40).reverse().map((t, i) => (
                    <tr key={i} className="border-b border-hairline-soft last:border-b-0">
                      <td className="px-3 py-2 text-xs text-mute">{new Date(t.t).toISOString().slice(0, 10)}</td>
                      <td className="ticker px-3 py-2 text-xs">{t.score}</td>
                      <td className="ticker px-3 py-2 text-xs">{fmtPrice(t.entry, 2)}</td>
                      <td className="ticker px-3 py-2 text-xs">{fmtPrice(t.exit, 2)}</td>
                      <td className={`ticker px-3 py-2 text-xs ${t.returnPct >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(t.returnPct)}</td>
                      <td className="ticker px-3 py-2 text-xs text-bull">{fmtPct(t.mfePct)}</td>
                      <td className="ticker px-3 py-2 text-xs text-bear">{fmtPct(t.maePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : (
            <Panel className="p-5 text-sm text-mute">
              No signals met these conditions in the available history. Lower the minimum score or try another market.
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Panel className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className={`ticker display mt-1 text-xl font-bold ${tone === "good" ? "text-bull" : tone === "bad" ? "text-bear" : ""}`}>
        {value}
      </div>
    </Panel>
  );
}
