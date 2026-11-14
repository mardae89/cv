"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Compact direction dial and push arrow, matching MD Trader OS.
 *
 * One scale everywhere: -100 is full bearish alignment, +100 full bullish.
 * The MD Score (0..100) maps onto it as (score - 50) * 2, so 50 sits straight
 * up, and green/red always mean bullish/bearish.
 */

const BULL = "var(--color-bull)";
const BEAR = "var(--color-bear)";
const GOLD = "var(--color-gold)";
const BONE = "var(--color-bone)";

export const scoreToDial = (score: number) => (score - 50) * 2;
const toneOf = (v: number) => (v >= 20 ? BULL : v <= -20 ? BEAR : GOLD);

/** A lightly under-damped spring toward `target`; jumps straight there under reduced motion. */
function useSpring(target: number, from = 0): number {
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

const CX = 200;
const CY = 206;
const R = 158;
const W = 30;

function point(v: number, r = R) {
  const a = Math.PI * (1 - (Math.max(-100, Math.min(100, v)) + 100) / 200);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const;
}
function arc(v1: number, v2: number, r = R) {
  const [x1, y1] = point(Math.min(v1, v2), r);
  const [x2, y2] = point(Math.max(v1, v2), r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** The small dial used in list rows. `value` is on the -100..+100 scale. */
export function MiniGauge({ value }: { value: number }) {
  const id = useId().replace(/:/g, "");
  const v = useSpring(value);
  const tone = toneOf(v);
  return (
    <div className="w-[68px] shrink-0">
      <svg viewBox="0 0 400 224" className="w-full" role="img" aria-label={`Direction ${Math.round(v)} of 100`}>
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
        <path d={`${arc(-100, 100, R - W / 2)} Z`} fill={`url(#face-${id})`} />
        <path d={arc(-100, 100)} fill="none" stroke={`url(#track-${id})`} strokeWidth={W} />
        {Math.abs(v) > 0.5 ? (
          <path d={arc(0, v)} fill="none" stroke={tone} strokeWidth={W} filter={`url(#glow-${id})`} opacity={0.95} />
        ) : null}
        <line x1={CX} y1={CY - R - W / 2 - 4} x2={CX} y2={CY - R + W / 2 + 4} stroke={GOLD} strokeWidth={2} />
        <g transform={`rotate(${(Math.max(-100, Math.min(100, v)) / 100) * 90} ${CX} ${CY})`}>
          <path d={`M ${CX} ${CY - 10} L ${CX} ${CY - R + 22}`} stroke={tone} strokeWidth={10} opacity={0.35} filter={`url(#glow-${id})`} />
          <path d={`M ${CX - 9} ${CY} L ${CX - 1.5} ${CY - R + 20} L ${CX + 1.5} ${CY - R + 20} L ${CX + 9} ${CY} Z`} fill={BONE} />
        </g>
        <circle cx={CX} cy={CY} r={24} fill="var(--color-panel)" stroke={GOLD} strokeWidth={4} />
        <circle cx={CX} cy={CY} r={9} fill={GOLD} />
      </svg>
    </div>
  );
}

/** Up and green, down and red, sideways and gold. `value` is on the -100..+100 scale. */
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
