"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Candle } from "@/lib/types";
import type { Gate, MeterTimeframe, MomentumMeter, PushSource, TimeframePush, Verdict } from "@/lib/engine/momentumMeter";
import { fmtPrice } from "@/lib/utils/format";

/**
 * THE MOMENTUM METER — visuals.
 *
 * One scale everywhere: −100 is a full push down, +100 a full push up, and
 * green/red always mean up/down. The needle rides a spring so a new reading
 * swings it rather than snapping it — it only moves when the data does.
 */

const BULL = "var(--color-bull)";
const BEAR = "var(--color-bear)";
const GOLD = "var(--color-gold)";
const FAINT = "var(--color-faint)";
const HAIR = "var(--color-hairline)";
const BONE = "var(--color-bone)";

const toneOf = (v: number) => (v >= 20 ? BULL : v <= -20 ? BEAR : GOLD);
const textTone = (v: number) => (v >= 20 ? "text-bull" : v <= -20 ? "text-bear" : "text-gold");

/* --------------------------------- spring ---------------------------------- */

/** A lightly under-damped spring toward `target`; jumps straight there under reduced motion. */
export function useSpring(target: number, from = 0): number {
  const [value, setValue] = useState(from);
  const s = useRef({ x: from, v: 0, raf: 0, last: 0 });
  useEffect(() => {
    const st = s.current;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      st.x = target;
      st.v = 0;
      setValue(target);
      return;
    }
    cancelAnimationFrame(st.raf);
    st.last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.032, (t - st.last) / 1000);
      st.last = t;
      const force = -70 * (st.x - target) - 10 * st.v;
      st.v += force * dt;
      st.x += st.v * dt;
      if (Math.abs(st.x - target) < 0.05 && Math.abs(st.v) < 0.05) {
        st.x = target;
        st.v = 0;
        setValue(target);
        return;
      }
      setValue(st.x);
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(st.raf);
  }, [target]);
  return value;
}

/* ---------------------------------- gauge ---------------------------------- */

const CX = 200;
const CY = 206;
const R = 158;

/** −100 sits at the left end of the arc, 0 at the top, +100 at the right end. */
function angle(v: number) {
  return Math.PI * (1 - (Math.max(-100, Math.min(100, v)) + 100) / 200);
}
function point(v: number, r = R) {
  const a = angle(v);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const;
}
function arc(v1: number, v2: number, r = R) {
  const [x1, y1] = point(Math.min(v1, v2), r);
  const [x2, y2] = point(Math.max(v1, v2), r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * A dashboard dial: the needle sweeps a clean face, and the reading sits under
 * it like a speedometer's, so the needle never crosses the number.
 */
export function MomentumGauge({
  value, label, caption, compact = false, size = "lg",
}: {
  value: number;
  /** Readout size under the dial; "md" for cards. */
  size?: "lg" | "md";
  /** Under the number, e.g. "Pushing down". */
  label?: string;
  /** Small line under the label, e.g. the timeframe. */
  caption?: string;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const v = useSpring(value);
  const tone = toneOf(v);
  const shown = Math.round(v);
  const width = compact ? 30 : 22;

  const dial = (
    <svg viewBox="0 0 400 224" className="w-full" role="img" aria-label={`Momentum ${shown} of 100. ${label ?? ""}`}>
      <defs>
        <linearGradient id={`track-${id}`} x1={CX - R} y1="0" x2={CX + R} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BEAR} stopOpacity="0.6" />
          <stop offset="0.4" stopColor={BEAR} stopOpacity="0.08" />
          <stop offset="0.5" stopColor={GOLD} stopOpacity="0.14" />
          <stop offset="0.6" stopColor={BULL} stopOpacity="0.08" />
          <stop offset="1" stopColor={BULL} stopOpacity="0.6" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id={`face-${id}`} cx="0.5" cy="1" r="0.9">
          <stop offset="0" stopColor={tone} stopOpacity="0.2" />
          <stop offset="0.7" stopColor={tone} stopOpacity="0.03" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={`${arc(-100, 100, R - width / 2)} Z`} fill={`url(#face-${id})`} />

      {!compact
        ? Array.from({ length: 41 }, (_, i) => -100 + i * 5).map((t) => {
            const major = t % 50 === 0;
            const mid = t % 10 === 0;
            const [x1, y1] = point(t, R + 15);
            const [x2, y2] = point(t, R + (major ? 28 : mid ? 22 : 19));
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? FAINT : HAIR} strokeWidth={major ? 2 : mid ? 1.4 : 1} />;
          })
        : null}
      {!compact
        ? [-50, 0, 50].map((t) => {
            // Outside the arc, so the needle never sweeps across them.
            const [x, y] = point(t, R + 40);
            return (
              <text key={t} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill={FAINT} fontFamily="var(--font-display)" fontWeight={600}>
                {t > 0 ? `+${t}` : t}
              </text>
            );
          })
        : null}

      <path d={arc(-100, 100)} fill="none" stroke={`url(#track-${id})`} strokeWidth={width} />
      {Math.abs(v) > 0.5 ? <path d={arc(0, v)} fill="none" stroke={tone} strokeWidth={width} filter={`url(#glow-${id})`} opacity={0.95} /> : null}
      <line x1={CX} y1={CY - R - width / 2 - 4} x2={CX} y2={CY - R + width / 2 + 4} stroke={GOLD} strokeWidth={2} />

      <g transform={`rotate(${(Math.max(-100, Math.min(100, v)) / 100) * 90} ${CX} ${CY})`}>
        <path d={`M ${CX} ${CY - 10} L ${CX} ${CY - R + 22}`} stroke={tone} strokeWidth={compact ? 10 : 7} opacity={0.35} filter={`url(#glow-${id})`} />
        <path d={`M ${CX - (compact ? 9 : 6)} ${CY} L ${CX - 1.5} ${CY - R + 20} L ${CX + 1.5} ${CY - R + 20} L ${CX + (compact ? 9 : 6)} ${CY} Z`} fill={BONE} />
      </g>
      <circle cx={CX} cy={CY} r={compact ? 24 : 15} fill="var(--color-panel)" stroke={GOLD} strokeWidth={compact ? 4 : 2} />
      <circle cx={CX} cy={CY} r={compact ? 9 : 5} fill={GOLD} />
    </svg>
  );

  if (compact) return dial;

  return (
    <div>
      {dial}
      <div className="-mt-1 flex items-center justify-between px-[4%] font-display text-[10px] font-bold uppercase tracking-widest">
        <span className="text-bear">◀ Down</span>
        <span className="text-bull">Up ▶</span>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3">
        <PushArrow value={v} className={size === "lg" ? "h-9 w-9 sm:h-11 sm:w-11" : "h-6 w-6"} />
        <span className={`ticker display font-extrabold leading-none tracking-tight ${size === "lg" ? "text-6xl sm:text-7xl" : "text-4xl"} ${textTone(v)}`}>
          {shown > 0 ? `+${shown}` : shown}
        </span>
      </div>
      {label ? <div className={`mt-2 text-center font-display font-bold uppercase ${size === "lg" ? "text-sm tracking-[0.2em]" : "text-[10px] tracking-[0.15em]"}`}>{label}</div> : null}
      {caption ? <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">{caption}</div> : null}
    </div>
  );
}

/** A big arrow that leans with the push: up and green, down and red, flat between. */
export function PushArrow({ value, className = "" }: { value: number; className?: string }) {
  if (value >= 20) {
    return (
      <svg viewBox="0 0 24 24" className={`push-up text-bull ${className}`} aria-hidden fill="currentColor">
        <path d="M12 3l8 9h-5v9H9v-9H4z" />
      </svg>
    );
  }
  if (value <= -20) {
    return (
      <svg viewBox="0 0 24 24" className={`push-down text-bear ${className}`} aria-hidden fill="currentColor">
        <path d="M12 21l-8-9h5V3h6v9h5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={`text-gold ${className}`} aria-hidden fill="currentColor">
      <path d="M3 10h14V6l6 6-6 6v-4H3z" />
    </svg>
  );
}

/* --------------------------- timeframe momentum ---------------------------- */

const TF_NAME: Record<MeterTimeframe, string> = { "1W": "Weekly", "1D": "Daily", "4H": "4H", "1H": "1H", "15M": "15M", "5M": "5M" };

export function TimeframeStack({
  timeframes, selected, onSelect,
}: {
  timeframes: TimeframePush[];
  selected: MeterTimeframe | "MD";
  onSelect: (tf: MeterTimeframe) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {timeframes.map((t) => {
        const on = selected === t.timeframe;
        const h = Math.min(50, (Math.abs(t.push) / 100) * 50);
        return (
          <button
            key={t.timeframe}
            onClick={() => onSelect(t.timeframe)}
            className={`flex flex-col items-center border px-1 py-2 transition ${on ? "border-gold bg-gold/10" : "border-hairline-soft hover:border-hairline"}`}
            aria-pressed={on}
          >
            <span className={`ticker display text-sm font-bold ${textTone(t.push)}`}>{t.push > 0 ? `+${t.push}` : t.push}</span>
            <span className="relative my-2 block h-36 w-5 bg-ink">
              <span className="absolute inset-x-0 top-1/2 h-px bg-faint/60" />
              <span
                className="absolute inset-x-0 transition-all duration-700"
                style={{
                  height: `${h}%`,
                  [t.push >= 0 ? "bottom" : "top"]: "50%",
                  background: t.push >= 20 ? BULL : t.push <= -20 ? BEAR : GOLD,
                  boxShadow: `0 0 10px ${t.push >= 20 ? BULL : t.push <= -20 ? BEAR : GOLD}`,
                }}
              />
            </span>
            <span className="display text-[11px] font-bold">{t.timeframe}</span>
            <span className={`text-[9px] uppercase tracking-widest ${t.pace === "building" ? textTone(t.push) : "text-faint"}`}>
              {t.pace === "building" ? "building" : t.pace === "fading" ? "fading" : "steady"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The last readings behind a needle: green above zero, red below. */
export function PushTrail({ values }: { values: number[] }) {
  const id = useId().replace(/:/g, "");
  if (values.length < 3) return null;
  const W = 400;
  const H = 70;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H / 2 - (v / 100) * (H / 2 - 3);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H / 2} L0,${H / 2} Z`;
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <clipPath id={`up-${id}`}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
        <clipPath id={`dn-${id}`}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
      </defs>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke={HAIR} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={area} fill={BULL} opacity="0.22" clipPath={`url(#up-${id})`} />
      <path d={area} fill={BEAR} opacity="0.22" clipPath={`url(#dn-${id})`} />
      <path d={line} fill="none" stroke={BULL} strokeWidth="2" clipPath={`url(#up-${id})`} vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" stroke={BEAR} strokeWidth="2" clipPath={`url(#dn-${id})`} vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3.5" fill={toneOf(last)} />
    </svg>
  );
}

/* ---------------------------- where it comes from --------------------------- */

export function SourceBars({ sources }: { sources: PushSource[] }) {
  const cap = Math.max(...sources.map((s) => s.weight));
  return (
    <ul className="space-y-2.5">
      {sources.map((s) => {
        const w = (Math.abs(s.points) / cap) * 50;
        const ghost = (s.weight / cap) * 50;
        const tone = s.points >= 0 ? BULL : BEAR;
        return (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">{s.label}</span>
              <span className={`ticker display text-sm font-bold ${s.points >= 0.5 ? "text-bull" : s.points <= -0.5 ? "text-bear" : "text-mute"}`}>
                {s.points > 0 ? "+" : ""}{s.points.toFixed(1)}
                <span className="ml-1 text-[10px] font-semibold text-faint">/ {s.weight}</span>
              </span>
            </div>
            <div className="relative mt-1 h-2.5 bg-ink">
              <span className="absolute top-0 h-full border border-hairline-soft" style={{ left: `${50 - ghost}%`, width: `${ghost * 2}%` }} />
              <span className="absolute top-0 h-full w-px bg-faint/70" style={{ left: "50%" }} />
              <span
                className="absolute top-0 h-full transition-all duration-700"
                style={{ background: tone, boxShadow: `0 0 8px ${tone}`, width: `${w}%`, left: s.points >= 0 ? "50%" : `${50 - w}%` }}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-faint">{s.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------- verdict --------------------------------- */

const VERDICT_STYLE: Record<Verdict, { ring: string; text: string; tag: string }> = {
  "in-play": { ring: "border-bull/50 bg-bull/10", text: "text-bull", tag: "In play" },
  pullback: { ring: "border-gold/50 bg-gold/10", text: "text-gold", tag: "Pullback" },
  waiting: { ring: "border-hairline bg-panel-2", text: "text-bone", tag: "Waiting" },
  "not-this-week": { ring: "border-hairline-soft bg-ink", text: "text-mute", tag: "Not this week" },
  "no-data": { ring: "border-hairline-soft bg-ink", text: "text-mute", tag: "No data" },
};

export function VerdictTag({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest ${s.ring} ${s.text}`}>
      {verdict === "in-play" ? <span className="live-dot h-1.5 w-1.5 bg-bull" /> : null}
      {s.tag}
    </span>
  );
}

function GateRow({ gate }: { gate: Gate }) {
  const icon =
    gate.pass === true ? <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-bull text-[11px] font-bold text-void">✓</span>
      : gate.pass === false ? <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-bear/60 text-[11px] font-bold text-bear">✕</span>
        : <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-hairline text-[11px] text-faint">–</span>;
  return (
    <li className="flex gap-3">
      {icon}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-xs font-bold uppercase tracking-widest">{gate.label}</span>
          <span className={`text-xs ${gate.pass ? "text-bull" : gate.pass === false ? "text-bear" : "text-faint"}`}>{gate.value}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{gate.detail}</p>
      </div>
    </li>
  );
}

export function VerdictCard({ meter }: { meter: MomentumMeter }) {
  const s = VERDICT_STYLE[meter.verdict];
  const passed = meter.gates.filter((g) => g.pass).length;
  return (
    <div className={`border p-5 ${s.ring}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">The MD setup this week</span>
        <span className="ticker text-[11px] text-faint">{passed} / {meter.gates.length} rules</span>
      </div>
      <h3 className={`display mt-2 text-xl font-extrabold leading-tight tracking-tight ${s.text}`}>{meter.verdictTitle}</h3>
      <p className="mt-1 text-sm text-mute">{meter.verdictDetail}</p>
      <ul className="mt-4 space-y-3 border-t border-hairline-soft pt-4">
        {meter.gates.map((g) => <GateRow key={g.key} gate={g} />)}
      </ul>
    </div>
  );
}

/* -------------------------------- drawings --------------------------------- */

function scaleY(values: number[], top: number, bottom: number) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || hi * 0.001;
  return (v: number) => top + ((hi + pad - v) / (hi - lo + pad * 2)) * (bottom - top);
}

function CandleMark({ c, x, w, y, emphasis }: { c: Candle; x: number; w: number; y: (v: number) => number; emphasis?: boolean }) {
  const up = c.c >= c.o;
  const color = up ? BULL : BEAR;
  const top = y(Math.max(c.o, c.c));
  const bot = y(Math.min(c.o, c.c));
  return (
    <g opacity={emphasis === false ? 0.5 : 1}>
      <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1.4} />
      <rect x={x - w / 2} y={top} width={w} height={Math.max(1.5, bot - top)} fill={color} />
    </g>
  );
}

/** The last weeks with the weekly 50 EMA, last week's candle called out, and this week forming. */
export function WeeklyStory({ meter }: { meter: MomentumMeter }) {
  const bars = meter.weekly.bars;
  if (bars.length < 3 || !meter.prevWeek) return null;
  const W = 380;
  const H = 210;
  const plotW = 318;
  const step = plotW / bars.length;
  const emaVals = meter.weekly.ema.filter((v): v is number => v != null);
  // When price is far from its 50 EMA the line would squash the candles into a
  // corner; it is then drawn as a labelled marker at the edge instead.
  const lo = Math.min(...bars.map((b) => b.l));
  const hi = Math.max(...bars.map((b) => b.h));
  const span = hi - lo || hi * 0.01;
  const emaNow = meter.weekly.ema[meter.weekly.ema.length - 1];
  const emaFar = emaVals.some((v) => v > hi + span * 0.6 || v < lo - span * 0.6);
  const y = scaleY([...bars.flatMap((b) => [b.h, b.l]), ...(emaFar ? [] : emaVals)], 26, H - 26);
  const cx = (i: number) => step * i + step / 2;
  const prevI = bars.length - 2;
  const curI = bars.length - 1;
  const pw = meter.prevWeek;
  const range = pw.h - pw.l;
  const bear = meter.side === "bearish" || (meter.side === "neutral" && pw.direction === "bearish");
  const z1 = bear ? pw.l + range * 0.382 : pw.h - range * 0.382;
  const z2 = bear ? pw.l + range * 0.618 : pw.h - range * 0.618;
  const emaPath = meter.weekly.ema
    .map((v, i) => (v == null ? null : `${cx(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(" L");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly candles with the 50 EMA, last week's candle and this week's pullback zone">
      <rect x={cx(prevI) - step / 2} y={Math.min(y(z1), y(z2))} width={step * 2} height={Math.abs(y(z1) - y(z2))} fill={GOLD} opacity={0.12} />
      <line x1={cx(prevI) - step / 2} x2={plotW} y1={y(z1)} y2={y(z1)} stroke={GOLD} strokeDasharray="3 3" opacity={0.6} />
      <line x1={cx(prevI) - step / 2} x2={plotW} y1={y(z2)} y2={y(z2)} stroke={GOLD} strokeDasharray="3 3" opacity={0.6} />
      <text x={plotW + 4} y={(y(z1) + y(z2)) / 2 + 3} fontSize="9" fill={GOLD} fontFamily="var(--font-display)" fontWeight={700}>WICK ZONE</text>
      {emaPath && !emaFar ? <path d={`M${emaPath}`} fill="none" stroke={GOLD} strokeWidth={1.6} opacity={0.9} /> : null}
      {emaFar && emaNow != null ? (
        <text x={plotW / 2} y={emaNow > hi ? 30 : H - 30} textAnchor="middle" fontSize="10" fontWeight={700} fill={GOLD} fontFamily="var(--font-display)">
          {emaNow > hi ? "▲" : "▼"} 50 EMA {fmtPrice(emaNow, meter.precision)} — {emaNow > hi ? "far above" : "far below"}
        </text>
      ) : null}
      {bars.map((b, i) => (
        <CandleMark key={b.t} c={b} x={cx(i)} w={step * 0.56} y={y} emphasis={i >= prevI ? undefined : false} />
      ))}
      <rect x={cx(prevI) - step * 0.42} y={y(pw.h) - 4} width={step * 0.84} height={y(pw.l) - y(pw.h) + 8} fill="none" stroke={BONE} strokeDasharray="2 3" opacity={0.7} />
      <text x={cx(prevI) + step * 0.3} y={14} textAnchor="end" fontSize="9" fontWeight={700} letterSpacing="1" fill={BONE} fontFamily="var(--font-display)">LAST WEEK</text>
      <text x={cx(curI) - step * 0.3} y={14} textAnchor="start" fontSize="9" fontWeight={700} letterSpacing="1" fill={GOLD} fontFamily="var(--font-display)">NOW</text>
      <text x={4} y={H - 8} fontSize="9" fill={FAINT} fontFamily="var(--font-display)" fontWeight={600}>WEEKLY · 50 EMA</text>
      <text x={plotW} y={H - 8} textAnchor="end" fontSize="9" fill={BONE} fontFamily="var(--font-display)" fontWeight={700}>
        {pw.size.toUpperCase()} · {pw.bodyAtr.toFixed(2)}× ATR
      </text>
    </svg>
  );
}

/** This week's daily candles against last week's range and its 38–62% zone. */
export function DailyPullback({ meter }: { meter: MomentumMeter }) {
  const bars = meter.daily.bars;
  if (bars.length < 3 || !meter.daily.levels.length) return null;
  const W = 380;
  const H = 210;
  const plotW = 300;
  const step = plotW / bars.length;
  const levelPrices = meter.daily.levels.map((l) => l.price);
  const y = scaleY([...bars.flatMap((b) => [b.h, b.l]), ...levelPrices, meter.price], 14, H - 24);
  const cx = (i: number) => step * i + step / 2;
  const startI = meter.daily.weekStart != null ? bars.findIndex((b) => b.t >= meter.daily.weekStart!) : -1;
  const f38 = meter.daily.levels.find((l) => l.label === "38.2%")!.price;
  const f62 = meter.daily.levels.find((l) => l.label === "61.8%")!.price;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily candles with last week's high, low and retracement levels">
      <rect x={0} y={Math.min(y(f38), y(f62))} width={plotW} height={Math.abs(y(f38) - y(f62))} fill={GOLD} opacity={0.1} />
      {meter.daily.levels.map((l) => (
        <g key={l.label}>
          <line x1={0} x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.kind === "fib" ? GOLD : FAINT} strokeDasharray={l.kind === "fib" ? "3 3" : undefined} opacity={l.kind === "fib" ? 0.7 : 0.6} />
          <text x={plotW + 5} y={y(l.price) + 3} fontSize="9" fill={l.kind === "fib" ? GOLD : FAINT} fontFamily="var(--font-display)" fontWeight={600}>
            {l.kind === "fib" ? l.label : l.label.replace("Last week ", "LW ").toUpperCase()}
          </text>
        </g>
      ))}
      {startI > 0 ? (
        <>
          <line x1={cx(startI) - step / 2} x2={cx(startI) - step / 2} y1={6} y2={H - 20} stroke={HAIR} strokeDasharray="2 4" />
          <text x={cx(startI) - step / 2 + 4} y={H - 8} fontSize="9" fill={GOLD} fontFamily="var(--font-display)" fontWeight={700}>THIS WEEK</text>
        </>
      ) : null}
      {bars.map((b, i) => <CandleMark key={b.t} c={b} x={cx(i)} w={step * 0.6} y={y} emphasis={startI >= 0 && i < startI ? false : undefined} />)}
      <line x1={0} x2={plotW} y1={y(meter.price)} y2={y(meter.price)} stroke={BONE} strokeWidth={1} strokeDasharray="1 3" />
      <text x={4} y={H - 8} fontSize="9" fill={FAINT} fontFamily="var(--font-display)" fontWeight={600}>DAILY</text>
    </svg>
  );
}

/** How much of the average range is already spent — room left for the push. */
export function RoomBar({ label, used }: { label: string; used: number | null }) {
  const pctUsed = used == null ? null : Math.round(used * 100);
  const fill = used == null ? 0 : Math.min(1, used / 1.5);
  const tone = used == null ? FAINT : used < 0.7 ? BULL : used < 1 ? GOLD : BEAR;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-mute">{label}</span>
        <span className="ticker font-semibold">{pctUsed != null ? `${pctUsed}%` : "—"}</span>
      </div>
      <div className="relative mt-1.5 h-2 bg-ink">
        <span className="absolute left-0 top-0 h-full transition-all duration-700" style={{ width: `${fill * 100}%`, background: tone }} />
        <span className="absolute top-[-3px] h-[14px] w-px bg-bone/70" style={{ left: `${(1 / 1.5) * 100}%` }} title="Average range" />
      </div>
      <div className="mt-1 text-[10px] text-faint">
        {used == null ? "" : used < 0.7 ? "Room left to run" : used < 1 ? "Most of the average range used" : "Beyond the average range — stretched"}
      </div>
    </div>
  );
}

/* ------------------------------ compact panel ------------------------------ */

/** The meter in a card, for the market and Wick Catcher pages. */
export function MeterCard({ meter }: { meter: MomentumMeter }) {
  return (
    <Link href={`/momentum?symbol=${encodeURIComponent(meter.symbol)}`} className="panel block overflow-hidden transition hover:border-gold/40">
      <div className="grid items-center gap-4 p-4 sm:grid-cols-[220px_1fr]">
        <div className="mx-auto w-full max-w-[220px]">
          <MomentumGauge value={meter.push} label={meter.pushLabel} size="md" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Momentum Meter</span>
            <VerdictTag verdict={meter.verdict} />
          </div>
          <div className={`display mt-1.5 text-lg font-extrabold leading-tight ${VERDICT_STYLE[meter.verdict].text}`}>{meter.verdictTitle}</div>
          <p className="mt-1 text-xs text-mute">{meter.verdictDetail}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {meter.gates.map((g) => (
              <span
                key={g.key}
                className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${g.pass ? "border-bull/40 text-bull" : g.pass === false ? "border-bear/40 text-bear" : "border-hairline text-faint"}`}
              >
                {g.pass ? "✓" : g.pass === false ? "✕" : "–"} {g.key === "side" ? "Weekly side" : g.key === "prevWeek" ? "Last week" : g.key === "pullback" ? "Pullback" : "Turn"}
              </span>
            ))}
          </div>
          <span className="mt-3 inline-block text-[10px] uppercase tracking-widest text-gold">Open the Momentum Meter →</span>
        </div>
      </div>
    </Link>
  );
}

/** A tiny gauge for ranked lists. */
export function MiniGauge({ value }: { value: number }) {
  return (
    <div className="w-[68px] shrink-0">
      <MomentumGauge value={value} compact />
    </div>
  );
}

export { TF_NAME, fmtPrice };
