"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, GhostButton } from "./primitives";
import { Bar, QuoteCard, fmtR, toneOf } from "./os";
import { dayKey, useCheckIns, usePlan, useReset, useTrades } from "@/lib/os/store";
import { tilt as tiltOf, today as todayOf } from "@/lib/os/analytics";
import { quoteOfTheDay, randomQuote, type Quote } from "@/lib/os/content";

/**
 * The Becoming half, on the Market Direction dashboard: the market read is only
 * half the decision, and the trader's own state is the other half.
 */
export function BecomingStrip() {
  const [plan] = usePlan();
  const [trades, , ready] = useTrades();
  const [checkIns] = useCheckIns();
  const [reset] = useReset();
  const [now, setNow] = useState<number | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    setNow(Date.now());
    setQuote(quoteOfTheDay());
  }, []);

  if (!ready || now == null) return null;

  const check = checkIns[dayKey(now)] ?? null;
  const t = todayOf(trades, plan, now);
  const tilt = tiltOf(trades, plan, check, now);
  const cooling = reset.cooldownUntil != null && reset.cooldownUntil > now;
  const checkedIn = Boolean(check && (check.mood != null || check.intention.trim()));
  const tone = tilt.state === "tilted" ? "text-bear" : tilt.state === "caution" ? "text-flat" : "text-bull";

  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="panel grid gap-5 p-5 sm:grid-cols-3">
        <div>
          <Eyebrow className="mb-1">You, today</Eyebrow>
          <div className={`display text-lg font-bold uppercase tracking-tight ${tone}`}>
            {cooling ? "Cooling down" : tilt.state === "clear" ? "Clear head" : tilt.state === "caution" ? "Caution" : "Step away"}
          </div>
          <div className="mt-2"><Bar value={tilt.level / 100} tone={tilt.state === "tilted" ? "bear" : tilt.state === "caution" ? "flat" : "bull"} /></div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-faint">Tilt {tilt.level}/100</div>
        </div>
        <div>
          <Eyebrow className="mb-1">Trades today</Eyebrow>
          <div className="ticker display text-lg font-bold">{t.tradesToday} <span className="text-sm text-faint">/ {plan.maxTradesPerDay}</span></div>
          <div className={`ticker mt-1 text-xs ${toneOf(t.rToday)}`}>{fmtR(t.rToday, 1)} today</div>
          {t.lossUsed != null && t.lossUsed > 0 ? <div className="mt-1 text-[10px] uppercase tracking-widest text-faint">{Math.round(t.lossUsed * 100)}% of loss limit</div> : null}
        </div>
        <div className="flex flex-col gap-2">
          {checkedIn ? (
            <Link href="/today"><GhostButton className="w-full">Today</GhostButton></Link>
          ) : (
            <Link href="/today"><GhostButton className="w-full border-gold/60 text-gold">Do my check-in</GhostButton></Link>
          )}
          <Link href="/journal"><GhostButton className="w-full">Journal</GhostButton></Link>
          {tilt.state !== "clear" || cooling ? <Link href="/reset"><GhostButton className="w-full">Reset Room</GhostButton></Link> : null}
        </div>
      </div>
      {quote ? <QuoteCard quote={quote} onNext={() => setQuote(randomQuote(["fomo", "revenge", "patience", "discipline", "process", "risk"], quote.text))} /> : null}
    </section>
  );
}
