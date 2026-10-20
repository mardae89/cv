"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Timeframe } from "@/lib/types";
import { getAsset, pipSize, pipUnit, TRADABLE_ASSETS } from "@/lib/data/universe";
import {
  EMOTIONS, MISTAKES, RED_FLAG_EMOTIONS, dayKey, uid, useCheckIns, usePlan, useReset, useTrades,
  type Emotion, type Mistake, type SetupGrade, type Trade,
} from "@/lib/os/store";
import { settle, tilt as tiltOf } from "@/lib/os/analytics";
import { fmtPrice } from "@/lib/utils/format";
import { useTradingMode, useTrendScope } from "@/lib/useTrendScope";
import { Eyebrow, GhostButton, GoldButton } from "./primitives";
import {
  Chips, Field, Modal, RatingPicker, Segmented, SelectInput, TextArea, TextInput, fmtMoney, fmtR, num, toneOf,
} from "./os";

const TIMEFRAMES: Timeframe[] = ["5M", "15M", "30M", "1H", "4H", "1D", "1W"];
const GRADES: SetupGrade[] = ["A+", "A", "B", "C"];

/** The session a trade opened in, from the UTC hour. Overlap wins when both are open. */
export function sessionAt(t = Date.now()): string {
  const h = new Date(t).getUTCHours();
  if (h >= 12 && h < 16) return "London / NY overlap";
  if (h >= 7 && h < 12) return "London";
  if (h >= 16 && h < 21) return "New York";
  return "Asia";
}

export interface TradeDraft {
  symbol?: string;
  direction?: "long" | "short";
  entry?: number;
  stop?: number;
  target?: number;
  strategy?: string;
  timeframe?: Timeframe;
  mdScore?: number | null;
  reasons?: string;
}

/* ================================ LOG A TRADE ================================ */

export function LogTradeModal({ initial, onClose, onSaved }: { initial?: TradeDraft; onClose: () => void; onSaved?: (t: Trade) => void }) {
  const [plan, , planReady] = usePlan();
  const [trades, saveTrades] = useTrades();
  const [checkIns] = useCheckIns();
  const [reset] = useReset();
  const [mode] = useTradingMode();
  const [scope] = useTrendScope();

  const [symbol, setSymbol] = useState(initial?.symbol ?? plan.markets[0] ?? "EUR/USD");
  const [direction, setDirection] = useState<"long" | "short">(initial?.direction ?? "long");
  const [strategy, setStrategy] = useState(initial?.strategy ?? "");
  const [grade, setGrade] = useState<SetupGrade | "">("");
  const [timeframe, setTimeframe] = useState<Timeframe>(initial?.timeframe ?? "1H");
  const [session, setSession] = useState(sessionAt());
  const [entry, setEntry] = useState(initial?.entry != null ? String(initial.entry) : "");
  const [stop, setStop] = useState(initial?.stop != null ? String(initial.stop) : "");
  const [target, setTarget] = useState(initial?.target != null ? String(initial.target) : "");
  const [riskAmount, setRiskAmount] = useState("");
  const [lots, setLots] = useState("");
  const [score, setScore] = useState(initial?.mdScore != null ? String(initial.mdScore) : "");
  const [checked, setChecked] = useState<string[]>([]);
  const [emotion, setEmotion] = useState<Emotion | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [reasons, setReasons] = useState(initial?.reasons ?? "");
  const [shot, setShot] = useState("");
  const [fetching, setFetching] = useState(false);
  const [confirmAnyway, setConfirmAnyway] = useState(false);

  // The plan loads after the first render; adopt its defaults once it does.
  useEffect(() => {
    if (!planReady) return;
    if (!strategy) setStrategy(plan.strategies[0] ?? "");
    if (!riskAmount && plan.accountSize) setRiskAmount(String(Math.round((plan.accountSize * plan.riskPerTradePct) / 100 * 100) / 100));
    if (!initial?.symbol && plan.markets[0]) setSymbol(plan.markets[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planReady]);

  const asset = getAsset(symbol);
  const precision = asset?.precision ?? 5;
  const pip = pipSize(symbol);
  const unit = pipUnit(symbol);
  const e = num(entry);
  const s = num(stop);
  const t = num(target);
  const stopPips = e != null && s != null ? Math.abs(e - s) / pip : null;
  const targetPips = e != null && t != null ? Math.abs(t - e) / pip : null;
  const rr = stopPips && targetPips ? targetPips / stopPips : null;
  const stopWrongSide = e != null && s != null && (direction === "long" ? s >= e : s <= e);
  const targetWrongSide = e != null && t != null && (direction === "long" ? t <= e : t >= e);

  const todayCheck = checkIns[dayKey()] ?? null;
  const tilt = tiltOf(trades, plan, todayCheck);
  const tradesToday = trades.filter((x) => dayKey(x.openedAt) === dayKey()).length;
  const coolingDown = reset.cooldownUntil != null && reset.cooldownUntil > Date.now();

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (coolingDown) w.push(`You are in a cool-down until ${new Date(reset.cooldownUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
    if (tilt.state !== "clear") w.push(`Tilt meter at ${tilt.level}/100 — ${tilt.label.toLowerCase()}.`);
    if (plan.maxTradesPerDay > 0 && tradesToday >= plan.maxTradesPerDay) w.push(`This would be trade ${tradesToday + 1} today; your limit is ${plan.maxTradesPerDay}.`);
    if (plan.checklist.length && checked.length < plan.checklist.length) w.push(`Checklist ${checked.length}/${plan.checklist.length} — not every box is ticked.`);
    if (rr != null && rr < plan.minRR) w.push(`Planned R:R is ${rr.toFixed(2)}, below your minimum of ${plan.minRR}.`);
    if (s == null) w.push("No stop loss entered.");
    if (emotion && RED_FLAG_EMOTIONS.includes(emotion)) w.push(`"${emotion}" is a red-flag feeling. It is a reason not to take the trade.`);
    if (plan.markets.length && !plan.markets.includes(symbol)) w.push(`${symbol} is not one of the markets in your plan.`);
    return w;
  }, [coolingDown, reset.cooldownUntil, tilt, plan, tradesToday, checked.length, rr, s, emotion, symbol]);

  async function fetchScore() {
    setFetching(true);
    try {
      const res = await fetch(`/api/market-analysis?symbol=${encodeURIComponent(symbol)}&mode=${mode}&scope=${scope}`);
      const json = await res.json();
      if (json?.analysis) {
        setScore(String(json.analysis.score.score));
        if (!entry) setEntry(String(json.analysis.quote.price));
      }
    } catch {
      /* the score is optional */
    } finally {
      setFetching(false);
    }
  }

  const canSave = e != null && !stopWrongSide && !targetWrongSide;

  function save() {
    if (!canSave) return;
    if (warnings.length && !confirmAnyway) {
      setConfirmAnyway(true);
      return;
    }
    const trade: Trade = {
      id: uid("trd"),
      symbol: asset?.symbol ?? symbol,
      direction,
      strategy,
      setupGrade: grade || null,
      timeframe,
      session,
      entry: e!,
      stop: s,
      target: t,
      riskAmount: num(riskAmount),
      lots: num(lots),
      mdScoreAtEntry: num(score),
      checklist: checked,
      checklistTotal: plan.checklist.length,
      emotionBefore: emotion,
      confidence,
      reasons,
      screenshotUrl: shot.trim() || null,
      openedAt: Date.now(),
      closedAt: null, exit: null, pnl: null, pips: null, resultR: null, outcome: "open",
      emotionAfter: null, followedPlan: null, mistakes: [], lesson: "", executionRating: null,
    };
    saveTrades((prev) => [trade, ...prev]);
    onSaved?.(trade);
    onClose();
  }

  const groups = Array.from(new Set(TRADABLE_ASSETS.map((a) => a.group)));

  return (
    <Modal title="Log a trade" onClose={onClose} wide>
      <div className="space-y-6">
        {/* ------------------------------- the trade ------------------------------ */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Market">
            <select value={asset?.symbol ?? symbol} onChange={(ev) => setSymbol(ev.target.value)} className="w-full px-3 py-2 text-sm">
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {TRADABLE_ASSETS.filter((a) => a.group === g).map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Direction">
            <Segmented value={direction} onChange={setDirection} options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
          </Field>
          <Field label="Strategy">
            <SelectInput value={strategy} onChange={setStrategy} options={plan.strategies.includes(strategy) || !strategy ? plan.strategies : [strategy, ...plan.strategies]} />
          </Field>
          <Field label="Setup grade">
            <Segmented value={grade || ("" as SetupGrade)} onChange={(v) => setGrade(v)} options={GRADES.map((g) => ({ value: g, label: g }))} />
          </Field>
          <Field label="Entry timeframe">
            <SelectInput value={timeframe} onChange={setTimeframe} options={TIMEFRAMES} />
          </Field>
          <Field label="Session">
            <SelectInput value={session} onChange={setSession} options={["Asia", "London", "New York", "London / NY overlap"]} />
          </Field>
          <Field label="MD Score at entry" hint="Optional.">
            <div className="flex gap-1">
              <TextInput value={score} onChange={setScore} inputMode="numeric" placeholder="0–100" />
              <button onClick={fetchScore} disabled={fetching} className="border border-hairline px-2 text-[10px] uppercase tracking-widest text-mute hover:border-gold hover:text-gold disabled:opacity-50">
                {fetching ? "…" : "Fetch"}
              </button>
            </div>
          </Field>
          <Field label={`Lots / contracts`} hint="Optional.">
            <TextInput value={lots} onChange={setLots} inputMode="decimal" placeholder="e.g. 0.50" />
          </Field>
        </section>

        {/* -------------------------------- levels -------------------------------- */}
        <section>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Entry"><TextInput value={entry} onChange={setEntry} inputMode="decimal" placeholder={fmtPrice(asset?.demoPrice, precision)} /></Field>
            <Field label="Stop loss"><TextInput value={stop} onChange={setStop} inputMode="decimal" /></Field>
            <Field label="Take profit"><TextInput value={target} onChange={setTarget} inputMode="decimal" /></Field>
            <Field label={`Risk (${plan.accountCurrency})`} hint="What this trade loses at the stop. Makes R exact from P/L.">
              <TextInput value={riskAmount} onChange={setRiskAmount} inputMode="decimal" />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-faint">Stop <span className={`ticker ${stopWrongSide ? "text-bear" : "text-bone"}`}>{stopPips != null ? `${stopPips.toFixed(1)} ${unit}` : "—"}</span></span>
            <span className="text-faint">Target <span className={`ticker ${targetWrongSide ? "text-bear" : "text-bone"}`}>{targetPips != null ? `${targetPips.toFixed(1)} ${unit}` : "—"}</span></span>
            <span className="text-faint">Planned R:R <span className={`ticker ${rr != null && rr < plan.minRR ? "text-bear" : "text-gold"}`}>{rr != null ? `1 : ${rr.toFixed(2)}` : "—"}</span></span>
            {stopWrongSide ? <span className="text-bear">Stop is on the wrong side of entry for a {direction}.</span> : null}
            {targetWrongSide ? <span className="text-bear">Target is on the wrong side of entry for a {direction}.</span> : null}
            <Link href={`/calculator?symbol=${encodeURIComponent(symbol)}${stopPips ? `&stop=${stopPips.toFixed(1)}` : ""}`} className="text-gold hover:underline">
              Size it in the calculator →
            </Link>
          </div>
        </section>

        {/* ------------------------------- checklist ------------------------------ */}
        {plan.checklist.length ? (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <Eyebrow>Pre-trade checklist</Eyebrow>
              <span className={`ticker text-xs ${checked.length === plan.checklist.length ? "text-bull" : "text-gold"}`}>
                {checked.length}/{plan.checklist.length}
              </span>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {plan.checklist.map((c) => {
                const on = checked.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setChecked(on ? checked.filter((x) => x !== c.id) : [...checked, c.id])}
                      className={`flex w-full items-start gap-2 border px-3 py-2 text-left text-xs transition ${on ? "border-bull/40 bg-bull/5 text-bone" : "border-hairline-soft text-mute hover:border-hairline"}`}
                    >
                      <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border text-[9px] ${on ? "border-bull bg-bull text-void" : "border-hairline"}`}>{on ? "✓" : ""}</span>
                      {c.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* -------------------------------- mindset ------------------------------- */}
        <section className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <div>
            <Eyebrow className="mb-2">How do you feel right now?</Eyebrow>
            <Chips options={EMOTIONS} selected={emotion ? [emotion] : []} onToggle={(v) => setEmotion(emotion === v ? null : v)} />
          </div>
          <div>
            <Eyebrow className="mb-2">Confidence in this setup</Eyebrow>
            <RatingPicker value={confidence} onChange={setConfidence} low="Unsure" high="Certain" />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Why am I taking this trade?">
            <TextArea value={reasons} onChange={setReasons} placeholder="Weekly bullish, previous week closed strong, price swept yesterday's low into the 4H 50 EMA…" />
          </Field>
          <Field label="Screenshot link" hint="TradingView snapshot or any image link.">
            <TextInput value={shot} onChange={setShot} placeholder="https://…" />
          </Field>
        </section>

        {/* -------------------------------- guard -------------------------------- */}
        {warnings.length ? (
          <div className="border border-gold/40 bg-gold/5 p-4">
            <div className="display text-xs font-bold uppercase tracking-widest text-gold">Before you take it</div>
            <ul className="mt-2 space-y-1">
              {warnings.map((w) => <li key={w} className="text-xs text-mute">• {w}</li>)}
            </ul>
            {tilt.state !== "clear" || coolingDown ? (
              <Link href="/reset" className="mt-3 inline-block text-xs uppercase tracking-widest text-gold hover:underline">Go to the Reset Room instead →</Link>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <GoldButton onClick={save} disabled={!canSave}>
            {warnings.length && confirmAnyway ? "Log it anyway" : "Log trade"}
          </GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          {confirmAnyway && warnings.length ? (
            <span className="text-xs text-gold">Read the list above once more. Press again to log it.</span>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/* =============================== CLOSE A TRADE =============================== */

export function CloseTradeModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const [plan] = usePlan();
  const [, saveTrades] = useTrades();
  const [exit, setExit] = useState(trade.exit != null ? String(trade.exit) : "");
  const [pnl, setPnl] = useState(trade.pnl != null ? String(trade.pnl) : "");
  const [emotionAfter, setEmotionAfter] = useState<Emotion | null>(trade.emotionAfter);
  const [followed, setFollowed] = useState<boolean | null>(trade.followedPlan);
  const [mistakes, setMistakes] = useState<Mistake[]>(trade.mistakes);
  const [rating, setRating] = useState<number | null>(trade.executionRating);
  const [lesson, setLesson] = useState(trade.lesson);

  const result = settle(trade, { exit: num(exit), pnl: num(pnl) });
  const unit = pipUnit(trade.symbol);
  const canSave = num(exit) != null || num(pnl) != null;

  function save() {
    if (!canSave) return;
    saveTrades((prev) =>
      prev.map((x) =>
        x.id === trade.id
          ? {
              ...x,
              ...result,
              closedAt: x.closedAt ?? Date.now(),
              emotionAfter,
              followedPlan: followed,
              mistakes,
              executionRating: rating,
              lesson,
            }
          : x,
      ),
    );
    onClose();
  }

  return (
    <Modal title={`${trade.outcome === "open" ? "Close" : "Edit"} ${trade.symbol} ${trade.direction}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Exit price" hint={`Entry ${trade.entry}${trade.stop != null ? ` · stop ${trade.stop}` : ""}${trade.target != null ? ` · target ${trade.target}` : ""}`}>
            <TextInput value={exit} onChange={setExit} inputMode="decimal" />
          </Field>
          <Field label={`P/L (${plan.accountCurrency})`} hint="Optional. What your broker shows, after costs.">
            <TextInput value={pnl} onChange={setPnl} inputMode="decimal" placeholder="e.g. -100 or 240" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 border-y border-hairline-soft py-3 text-sm">
          <span className="text-faint">Result <span className={`ticker font-semibold ${toneOf(result.resultR)}`}>{fmtR(result.resultR)}</span></span>
          <span className="text-faint">{unit} <span className={`ticker ${toneOf(result.pips)}`}>{result.pips != null ? `${result.pips >= 0 ? "+" : ""}${result.pips.toFixed(1)}` : "—"}</span></span>
          {result.pnl != null ? <span className="text-faint">P/L <span className={`ticker ${toneOf(result.pnl)}`}>{fmtMoney(result.pnl, plan.accountCurrency)}</span></span> : null}
          <span className="text-faint">Outcome <span className="uppercase text-bone">{canSave ? result.outcome : "—"}</span></span>
          {result.resultR == null && canSave ? <span className="text-xs text-faint">No stop or risk amount was logged, so R cannot be worked out.</span> : null}
        </div>

        <div>
          <Eyebrow className="mb-2">Did you follow your plan?</Eyebrow>
          <Segmented
            value={(followed == null ? "" : followed ? "yes" : "no") as "yes" | "no"}
            onChange={(v) => setFollowed(v === "yes")}
            options={[{ value: "yes", label: "Yes — every rule" }, { value: "no", label: "No — I broke something" }]}
          />
        </div>

        <div>
          <Eyebrow className="mb-2">Mistakes — be honest, nobody else sees this</Eyebrow>
          <Chips tone="bear" options={MISTAKES} selected={mistakes} onToggle={(m) => setMistakes(mistakes.includes(m) ? mistakes.filter((x) => x !== m) : [...mistakes, m])} />
        </div>

        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <div>
            <Eyebrow className="mb-2">How do you feel now?</Eyebrow>
            <Chips options={EMOTIONS} selected={emotionAfter ? [emotionAfter] : []} onToggle={(v) => setEmotionAfter(emotionAfter === v ? null : v)} />
          </div>
          <div>
            <Eyebrow className="mb-2">Execution — not the result</Eyebrow>
            <RatingPicker value={rating} onChange={setRating} low="Sloppy" high="Textbook" />
          </div>
        </div>

        <Field label="One lesson from this trade">
          <TextArea value={lesson} onChange={setLesson} placeholder="What would you tell yourself before the next one?" />
        </Field>

        {result.outcome === "loss" && canSave ? (
          <p className="border-l-2 border-gold bg-ink px-4 py-3 text-sm text-mute">
            A loss taken at the stop is the system working. If you feel the urge to jump straight back in, that is your cue for the{" "}
            <Link href="/reset" className="text-gold hover:underline">Reset Room</Link>.
          </p>
        ) : null}

        <div className="flex gap-3">
          <GoldButton onClick={save} disabled={!canSave}>{trade.outcome === "open" ? "Close trade" : "Save changes"}</GoldButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </div>
    </Modal>
  );
}
