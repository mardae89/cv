"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import type { ScannerRow } from "@/lib/types";
import { DirectionBadge, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Bar, Field, LocalNote, QuoteCard, RatingPicker, Segmented, TextArea, TextInput, TiltMeter, fmtMoney, fmtR, toneOf } from "@/components/os";
import { LogTradeModal } from "@/components/trade-forms";
import { ScoreMeter } from "@/components/score";
import {
  ROUTINE, dayKey, emptyCheckIn, useCheckIns, usePlan, useReset, useTrades, type CheckIn, type SetupGrade,
} from "@/lib/os/store";
import { tilt as tiltOf, today as todayOf } from "@/lib/os/analytics";
import { LESSONS, quoteOfTheDay, randomQuote, type Quote } from "@/lib/os/content";

export default function TodayPage() {
  const [plan] = usePlan();
  const [trades, , tradesReady] = useTrades();
  const [checkIns, saveCheckIns, ready] = useCheckIns();
  const [reset] = useReset();
  const [mode] = useTradingMode();
  const [scope] = useTrendScope();
  const [logging, setLogging] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setQuote(quoteOfTheDay());
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const key = dayKey(now ?? 0);
  const check: CheckIn = checkIns[key] ?? emptyCheckIn(key);
  const update = (patch: Partial<CheckIn>) =>
    saveCheckIns((all) => ({ ...all, [key]: { ...(all[key] ?? emptyCheckIn(key)), ...patch, updatedAt: Date.now() } }));

  const t = todayOf(trades, plan, now ?? Date.now());
  const tilt = tiltOf(trades, plan, checkIns[key] ?? null, now ?? Date.now());
  const coolingDown = reset.cooldownUntil != null && now != null && reset.cooldownUntil > now;
  const streak = checkInStreak(checkIns, now ?? Date.now());
  const lesson = LESSONS[Math.floor((now ?? 0) / 86_400_000) % LESSONS.length];

  const focus = useApi<{ rows: ScannerRow[] }>(`/api/scanner?mode=${mode}&scope=${scope}`, [mode, scope]);
  const focusRows = (focus.data?.rows ?? []).filter((r) => plan.markets.includes(r.symbol));

  if (!ready || !tradesReady || now == null) return <Skeleton className="mx-auto h-[32rem] max-w-6xl" />;

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const checkedIn = check.mood != null || check.intention.trim() !== "";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title={greeting}
        subtitle={`${new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · ${streak ? `${streak}-day check-in streak` : "Start your check-in streak today"}`}
        action={<GoldButton onClick={() => setLogging(true)}>Log a trade</GoldButton>}
      />

      {coolingDown ? (
        <Link href="/reset" className="block border border-bear/40 bg-bear/10 px-4 py-3 text-sm text-bear">
          <span className="display text-xs font-bold uppercase tracking-widest">Cool-down active · </span>
          No new trades until {new Date(reset.cooldownUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Open the Reset Room →
        </Link>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ------------------------------ CHECK-IN ------------------------------ */}
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <Eyebrow>Morning check-in</Eyebrow>
            {checkedIn ? <span className="text-[10px] uppercase tracking-widest text-bull">Saved</span> : null}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Mood"><RatingPicker value={check.mood} onChange={(v) => update({ mood: v })} low="Low" high="Great" /></Field>
            <Field label="Sleep"><RatingPicker value={check.sleep} onChange={(v) => update({ sleep: v })} low="Poor" high="Rested" /></Field>
            <Field label="Focus"><RatingPicker value={check.focus} onChange={(v) => update({ focus: v })} low="Scattered" high="Sharp" /></Field>
            <Field label="Stress"><RatingPicker value={check.stress} onChange={(v) => update({ stress: v })} low="Calm" high="Stressed" invert /></Field>
          </div>
          <div className="mt-5 grid gap-4">
            <Field label="Today's intention" hint="One sentence about HOW you will trade, not how much you will make.">
              <TextInput value={check.intention} onChange={(v) => update({ intention: v })} placeholder="I only take A+ setups at my zones, and I stop at two losses." />
            </Field>
            <Field label="Grateful for (optional)">
              <TextInput value={check.gratitude} onChange={(v) => update({ gratitude: v })} />
            </Field>
          </div>
          {(check.sleep != null && check.sleep <= 2) || (check.stress != null && check.stress >= 4) ? (
            <p className="mt-4 border-l-2 border-gold bg-ink px-3 py-2 text-xs text-mute">
              Low sleep or high stress makes impulsive trades more likely. Consider half size today, or only your single best setup.
            </p>
          ) : null}
        </Panel>

        {/* ------------------------------- STATUS ------------------------------- */}
        <div className="space-y-6">
          <Panel className="p-5">
            <TiltMeter tilt={tilt} />
            {tilt.state !== "clear" ? (
              <Link href="/reset" className="mt-3 inline-block text-xs uppercase tracking-widest text-gold hover:underline">Open the Reset Room →</Link>
            ) : null}
          </Panel>

          <Panel className="space-y-4 p-5">
            <Eyebrow>Today&apos;s limits</Eyebrow>
            <Limit
              label="Trades"
              value={`${t.tradesToday} of ${plan.maxTradesPerDay}`}
              fill={t.tradesUsed}
              tone={t.tradesUsed >= 1 ? "bear" : t.tradesUsed >= 0.66 ? "flat" : "gold"}
            />
            <Limit
              label="Daily loss limit used"
              value={t.lossUsed != null ? `${Math.round(t.lossUsed * 100)}%` : "—"}
              fill={t.lossUsed ?? 0}
              tone={(t.lossUsed ?? 0) >= 1 ? "bear" : (t.lossUsed ?? 0) >= 0.5 ? "flat" : "bull"}
            />
            <div className="grid grid-cols-3 gap-3 border-t border-hairline-soft pt-3 text-xs">
              <div><div className="text-faint">Result</div><div className={`ticker mt-0.5 font-semibold ${toneOf(t.rToday)}`}>{fmtR(t.rToday, 1)}</div></div>
              <div><div className="text-faint">P/L</div><div className={`ticker mt-0.5 font-semibold ${toneOf(t.pnlToday)}`}>{t.pnlToday ? fmtMoney(t.pnlToday, plan.accountCurrency) : "—"}</div></div>
              <div><div className="text-faint">Losses in a row</div><div className={`ticker mt-0.5 font-semibold ${t.lossStreak >= plan.maxConsecutiveLosses ? "text-bear" : "text-bone"}`}>{t.lossStreak}</div></div>
            </div>
            {(t.lossUsed ?? 0) >= 1 ? (
              <p className="border border-bear/40 bg-bear/10 px-3 py-2 text-xs text-bear">Daily loss limit reached. Today&apos;s job is done — journal it and close the charts.</p>
            ) : t.lossStreak >= plan.maxConsecutiveLosses ? (
              <p className="border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">{t.lossStreak} losses in a row. Your plan says take a {plan.cooldownMinutes}-minute break now.</p>
            ) : null}
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* ------------------------------ ROUTINE ------------------------------- */}
        <Panel className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>Pre-session routine</Eyebrow>
            <span className={`ticker text-xs ${check.routine.length === ROUTINE.length ? "text-bull" : "text-gold"}`}>{check.routine.length}/{ROUTINE.length}</span>
          </div>
          <ul className="space-y-1">
            {ROUTINE.map((r) => {
              const on = check.routine.includes(r.id);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => update({ routine: on ? check.routine.filter((x) => x !== r.id) : [...check.routine, r.id] })}
                    className={`flex w-full items-start gap-2.5 px-2 py-2 text-left text-sm transition ${on ? "text-bone" : "text-mute hover:bg-panel-2"}`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] ${on ? "border-bull bg-bull text-void" : "border-hairline"}`}>{on ? "✓" : ""}</span>
                    <span className={on ? "line-through decoration-faint" : ""}>{r.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/momentum"><GhostButton>MD Momentum</GhostButton></Link>
            <Link href="/wick-catcher"><GhostButton>Wick zones</GhostButton></Link>
            <Link href="/calendar"><GhostButton>Calendar</GhostButton></Link>
            <Link href="/vision"><GhostButton>Vision board</GhostButton></Link>
          </div>
        </Panel>

        {/* ---------------------------- FOCUS MARKETS --------------------------- */}
        <Panel>
          <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
            <Eyebrow>My markets right now</Eyebrow>
            <Link href="/plan" className="text-[10px] uppercase tracking-widest text-gold hover:underline">Edit list</Link>
          </div>
          {focus.loading && !focus.data ? (
            <Skeleton className="h-48" />
          ) : focusRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-mute">No markets in your plan yet. <Link href="/plan" className="text-gold hover:underline">Pick them in your Trading Plan.</Link></p>
          ) : (
            focusRows.map((r) => (
              <Link key={r.symbol} href={`/wick-catcher?symbol=${encodeURIComponent(r.symbol)}`} className="grid grid-cols-[1fr_110px_auto] items-center gap-3 border-b border-hairline-soft px-4 py-2.5 transition last:border-b-0 hover:bg-panel-2">
                <div className="min-w-0">
                  <div className="display text-sm font-semibold">{r.symbol}</div>
                  <div className="text-[10px] uppercase tracking-widest text-faint">Structure {r.structure} · {r.ma50 ?? "—"} 50 EMA</div>
                </div>
                <ScoreMeter score={r.score} direction={r.direction} />
                <DirectionBadge direction={r.direction} small />
              </Link>
            ))
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {quote ? <QuoteCard quote={quote} onNext={() => setQuote(randomQuote(["fomo", "revenge", "patience", "discipline", "process"], quote.text))} /> : null}
          <Link href={`/mindset?lesson=${lesson.slug}`} className="panel block p-4 transition hover:border-gold/40">
            <Eyebrow className="mb-1">Today&apos;s lesson · {lesson.minutes} min</Eyebrow>
            <div className="display text-base font-bold">{lesson.title}</div>
            <p className="mt-1 text-sm text-mute">{lesson.summary}</p>
          </Link>
          <Panel className="p-4">
            <Eyebrow className="mb-2">My rules</Eyebrow>
            <ol className="space-y-1.5">
              {plan.rules.map((r, i) => (
                <li key={r.id} className="flex gap-2 text-sm"><span className="font-display text-xs font-bold text-gold">{i + 1}.</span><span className="text-mute">{r.text}</span></li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* ------------------------------ END OF DAY ---------------------------- */}
        <Panel className="p-5">
          <Eyebrow className="mb-4">End of day</Eyebrow>
          <div className="space-y-4">
            <Field label="Did I follow my rules today?">
              <Segmented
                value={(check.followedRules == null ? "" : check.followedRules ? "yes" : "no") as "yes" | "no"}
                onChange={(v) => update({ followedRules: v === "yes" })}
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
              />
            </Field>
            <Field label="Grade my day — on discipline, not P/L">
              <Segmented
                value={(check.dayGrade ?? "") as SetupGrade}
                onChange={(v) => update({ dayGrade: v })}
                options={(["A+", "A", "B", "C"] as SetupGrade[]).map((g) => ({ value: g, label: g }))}
              />
            </Field>
            <Field label="Reflection">
              <TextArea value={check.reflection} onChange={(v) => update({ reflection: v })} rows={5} placeholder="What did I do well? Where did emotion show up? What will I do differently tomorrow?" />
            </Field>
          </div>
        </Panel>
      </div>

      <LocalNote />
      {logging ? <LogTradeModal onClose={() => setLogging(false)} /> : null}
    </div>
  );
}

function Limit({ label, value, fill, tone }: { label: string; value: string; fill: number; tone: "gold" | "bull" | "bear" | "flat" }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-mute">{label}</span>
        <span className="ticker font-semibold">{value}</span>
      </div>
      <Bar value={fill} tone={tone} />
    </div>
  );
}

/** Consecutive days, ending today or yesterday, with any check-in saved. */
function checkInStreak(all: Record<string, CheckIn>, now: number): number {
  const has = (d: Date) => {
    const c = all[dayKey(d)];
    return Boolean(c && (c.mood != null || c.intention.trim() || c.routine.length || c.reflection.trim()));
  };
  const d = new Date(now);
  if (!has(d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (has(d) && n < 3650) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
