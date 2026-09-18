"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { postJson, useApi } from "@/lib/hooks";
import { guest } from "@/lib/guestStore";
import type { Alert } from "@/lib/db/schema";
import { describeAlert } from "@/lib/alertLabels";
import {
  EmptyState, ErrorState, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton,
} from "@/components/primitives";
import { timeAgo } from "@/lib/utils/format";

interface AlertsResponse {
  alerts: Alert[];
  triggered: { alert: Alert; message: string; at: number }[];
}

const KINDS = [
  { kind: "score-above", label: "MD Score rises above", threshold: 75, elite: false },
  { kind: "score-below", label: "MD Score falls below", threshold: 30, elite: false },
  { kind: "direction-becomes", label: "Direction becomes", threshold: 0, elite: false, direction: true },
  { kind: "direction-change", label: "Direction changes", threshold: 0, elite: false },
  { kind: "price-cross-ma50", label: "Price crosses the daily 50 MA", threshold: 0, elite: false },
  { kind: "structure-change", label: "Daily structure changes", threshold: 0, elite: true },
  { kind: "factors-aligned", label: "N+ factors align", threshold: 5, elite: true },
  { kind: "event-countdown", label: "Hours before next major event", threshold: 1, elite: true },
];

export default function AlertsPage() {
  const status = useApi<{ auth: { accountsAvailable: boolean } }>("/api/status");
  const accounts = status.data?.auth.accountsAvailable;
  const { data, loading, error, refresh } = useApi<AlertsResponse>(
    accounts === true ? "/api/alerts?evaluate=true" : null,
  );
  const [local, setLocal] = useState<AlertsResponse | null>(null);
  const [tick, setTick] = useState(0);

  /* Guest mode: alerts live in this browser and are evaluated here, against the
     same analysis the market pages show. */
  useEffect(() => {
    if (accounts !== false) return;
    let cancelled = false;
    (async () => {
      const alerts = guest.alerts();
      const triggered: AlertsResponse["triggered"] = [];
      for (const alert of alerts) {
        if (!alert.active) continue;
        try {
          const res = await fetch(`/api/market-analysis?symbol=${encodeURIComponent(alert.symbol)}`);
          if (!res.ok) continue;
          const a = (await res.json()).analysis;
          let fired = false;
          let message = "";
          if (alert.kind === "score-above" && a.score.score >= alert.threshold) {
            fired = true;
            message = `${alert.symbol} MD Direction Score is ${a.score.score} — above your ${alert.threshold} threshold (${a.score.label}).`;
          } else if (alert.kind === "score-below" && a.score.score <= alert.threshold) {
            fired = true;
            message = `${alert.symbol} MD Direction Score is ${a.score.score} — below your ${alert.threshold} threshold (${a.score.label}).`;
          } else if (alert.kind === "direction-becomes" && a.score.direction === alert.direction) {
            fired = true;
            message = `${alert.symbol} is now ${a.score.direction} — score ${a.score.score}.`;
          } else if (alert.kind === "price-cross-ma50") {
            const d = a.technical.find((t: { timeframe: string }) => t.timeframe === "1D");
            if (d && alert.lastState && d.priceVsMa50 !== alert.lastState) {
              fired = true;
              message = `${alert.symbol} price is now ${d.priceVsMa50} its daily 50 MA.`;
            }
            if (d) guest.updateAlert(alert.id, { lastState: d.priceVsMa50 });
          }
          if (fired) {
            triggered.push({ alert, message, at: Date.now() });
            guest.updateAlert(alert.id, { lastTriggeredAt: Date.now(), triggerCount: alert.triggerCount + 1 });
          }
        } catch { /* a market that will not load simply does not fire */ }
      }
      if (!cancelled) setLocal({ alerts: guest.alerts(), triggered });
    })();
    return () => { cancelled = true; };
  }, [accounts, tick]);

  const isGuest = accounts === false;
  const view = isGuest ? local : data;
  const busy = isGuest ? local === null : loading && !data;
  const reload = () => (isGuest ? setTick((t) => t + 1) : refresh());
  const [symbol, setSymbol] = useState("XAU/USD");
  const [kind, setKind] = useState("score-above");
  const [threshold, setThreshold] = useState(75);
  const [direction, setDirection] = useState("bullish");
  const [note, setNote] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const selected = KINDS.find((k) => k.kind === kind)!;

  async function create() {
    setStatusMsg(null);
    try {
      const payload = { symbol, kind, threshold, direction: selected.direction ? direction : null, note };
      if (isGuest) guest.createAlert({ ...payload, kind: kind as never, direction: payload.direction as never });
      else await postJson("/api/alerts", payload);
      setStatusMsg("Alert created.");
      setNote("");
      reload();
    } catch (e) {
      setStatusMsg((e as Error).message);
    }
  }

  async function toggle(alert: Alert) {
    if (isGuest) guest.updateAlert(alert.id, { active: !alert.active });
    else await postJson(`/api/alerts/${alert.id}`, { active: !alert.active }, "PATCH");
    reload();
  }

  async function remove(alert: Alert) {
    if (isGuest) guest.deleteAlert(alert.id);
    else await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading
        title="Alerts"
        subtitle="Alerts are evaluated against the same analysis you see on screen, so what fires is what you can verify."
      />

      {view?.triggered.length ? (
        <div className="border border-gold/40 bg-gold/10 p-4">
          <Eyebrow className="mb-2 text-gold">Triggered just now</Eyebrow>
          <ul className="space-y-1.5">
            {view.triggered.map((t, i) => (
              <li key={i} className="text-sm text-bone">{t.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Panel className="p-5">
        <Eyebrow className="mb-3">Create an alert</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="eyebrow mb-1 block">Market</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="eyebrow mb-1 block">Condition</label>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setThreshold(KINDS.find((k) => k.kind === e.target.value)?.threshold ?? 0);
              }}
              className="w-full px-3 py-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>{k.label}{k.elite ? " (Elite)" : ""}</option>
              ))}
            </select>
          </div>
          {selected.direction ? (
            <div>
              <label className="eyebrow mb-1 block">Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-full px-3 py-2 text-sm">
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          ) : selected.threshold ? (
            <div>
              <label className="eyebrow mb-1 block">Value</label>
              <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full px-3 py-2 text-sm" />
            </div>
          ) : <div />}
          <div>
            <label className="eyebrow mb-1 block">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this matters" className="w-full px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <GoldButton onClick={create}>Create alert</GoldButton>
          {statusMsg ? <span className="text-xs text-gold">{statusMsg}</span> : null}
        </div>
      </Panel>

      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {busy ? (
        <Skeleton className="h-64" />
      ) : !view?.alerts.length ? (
        <EmptyState
          title="No alerts yet"
          message="Create an alert above, or add one from any market detail page."
          action={<Link href="/markets"><GhostButton>Browse markets</GhostButton></Link>}
        />
      ) : (
        <Panel>
          {view.alerts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
              <span className={`h-2 w-2 shrink-0 ${a.active ? "bg-bull" : "bg-faint"}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/markets/${encodeURIComponent(a.symbol)}`} className="display text-sm font-semibold hover:text-gold">
                  {a.symbol}
                </Link>
                <div className="text-xs text-mute">{describeAlert(a)}</div>
                {a.note ? <div className="text-[11px] text-faint">{a.note}</div> : null}
              </div>
              <div className="text-right text-[10px] uppercase tracking-widest text-faint">
                <div>{a.triggerCount} triggers</div>
                <div>{a.lastTriggeredAt ? `Last ${timeAgo(a.lastTriggeredAt)}` : "Never fired"}</div>
              </div>
              <button onClick={() => toggle(a)} className="border border-hairline px-2 py-1 text-[10px] uppercase tracking-widest text-mute hover:border-gold hover:text-gold">
                {a.active ? "Pause" : "Resume"}
              </button>
              <button onClick={() => remove(a)} className="text-[10px] uppercase tracking-widest text-faint hover:text-bear">
                Delete
              </button>
            </div>
          ))}
        </Panel>
      )}

      <p className="text-xs text-faint">
        Alerts are evaluated whenever this page loads, against the same analysis the market pages show.
        {isGuest ? " They are stored in this browser — no account needed." : ""}
      </p>
    </div>
  );
}
