"use client";

import type { CategoryResult, Direction, MdScore } from "@/lib/types";
import { DirectionBadge, QualityTag } from "./primitives";
import { fmtSigned } from "@/lib/utils/format";

function arcColor(direction: Direction | string) {
  if (direction === "bullish") return "var(--color-bull)";
  if (direction === "bearish") return "var(--color-bear)";
  if (direction === "mixed") return "var(--color-flat)";
  return "var(--color-gold)";
}

/**
 * The MD Direction Score dial. The arc fills from the neutral midpoint outwards,
 * so a score of 50 reads as visibly empty — which is exactly what "no directional
 * evidence" should look like.
 */
export function ScoreDial({
  score,
  direction,
  size = 200,
  label,
}: {
  score: number;
  direction: Direction | string;
  size?: number;
  label?: string;
}) {
  const stroke = Math.max(6, size * 0.045);
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135;
  const sweep = 270;
  const circumference = 2 * Math.PI * r;
  const arcLength = (sweep / 360) * circumference;
  const progress = Math.min(1, Math.max(0, score / 100));

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`MD Direction Score ${score}`}>
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(${startAngle} ${cx} ${cy})`}
          strokeLinecap="butt"
        />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={arcColor(direction)} strokeWidth={stroke}
          strokeDasharray={`${arcLength * progress} ${circumference}`}
          transform={`rotate(${startAngle} ${cx} ${cy})`}
          strokeLinecap="butt"
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
        {/* Neutral marker at 50 — the line between "no evidence" and "alignment". */}
        <line
          x1={cx} y1={cy - r - stroke / 2 - 3} x2={cx} y2={cy - r + stroke / 2 + 3}
          stroke="var(--color-gold)" strokeWidth={1.5} opacity={0.85}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="ticker display font-bold leading-none" style={{ fontSize: size * 0.34 }}>
          {score}
        </div>
        <div className="eyebrow mt-1" style={{ fontSize: Math.max(9, size * 0.05) }}>
          MD Score
        </div>
      </div>
      {label ? <div className="mt-3 text-center text-xs uppercase tracking-widest text-mute">{label}</div> : null}
    </div>
  );
}

/** Compact horizontal score meter for lists and cards. */
export function ScoreMeter({ score, direction }: { score: number; direction: Direction | string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-full bg-hairline">
        <div
          className="absolute left-1/2 top-0 h-full w-px bg-gold/70"
          style={{ transform: "translateX(-0.5px)" }}
        />
        <div
          className="absolute top-0 h-full"
          style={{
            background: arcColor(direction),
            left: score >= 50 ? "50%" : `${score}%`,
            width: `${Math.abs(score - 50)}%`,
          }}
        />
      </div>
      <span className="ticker w-8 shrink-0 text-right font-display text-sm font-bold">{score}</span>
    </div>
  );
}

function barColor(points: number) {
  if (points > 0.5) return "bg-bull";
  if (points < -0.5) return "bg-bear";
  return "bg-flat";
}

/**
 * EVIDENCE BREAKDOWN — every score must be explainable. Each category shows its
 * signed contribution out of its weight, and the observations behind it.
 */
export function EvidenceBreakdown({ score, expandable = true }: { score: MdScore; expandable?: boolean }) {
  return (
    <div className="space-y-3">
      {score.categories.map((c) => (
        <CategoryRow key={c.key} category={c} expandable={expandable} />
      ))}
      <div className="rule my-3" />
      <div className="flex items-center justify-between">
        <span className="eyebrow">Total</span>
        <span className="ticker display text-2xl font-bold">
          {score.score} <span className="text-base text-faint">/ 100</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <DirectionBadge direction={score.direction} small />
        <QualityTag quality={score.evidenceQuality} />
        <span className="text-xs text-faint">{score.evidenceQualityReasons.join(" · ")}</span>
      </div>
    </div>
  );
}

function CategoryRow({ category, expandable }: { category: CategoryResult; expandable: boolean }) {
  const fill = Math.max(0, Math.min(1, category.fill));
  const content = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xs font-semibold uppercase tracking-widest text-bone">
          {category.label}
        </span>
        <span className="ticker shrink-0 text-xs text-mute">
          {category.available ? (
            <>
              <span className={category.points >= 0 ? "text-bull" : "text-bear"}>{fmtSigned(category.points)}</span>
              <span className="text-faint"> / {category.weight}</span>
            </>
          ) : (
            <span className="text-faint">Data unavailable</span>
          )}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 w-full items-center bg-hairline-soft">
        {category.available ? (
          <>
            <div className="h-full" style={{ width: `${Math.min(fill, 0.5) * 100}%` }} />
            <div
              className={`h-full ${barColor(category.points)}`}
              style={{
                width: `${Math.abs(fill - 0.5) * 100}%`,
                marginLeft: fill >= 0.5 ? "0" : undefined,
              }}
            />
          </>
        ) : (
          <div className="h-full w-full bg-hairline-soft" />
        )}
      </div>
      <p className="mt-1.5 text-xs capitalize text-mute">{category.summary}</p>
    </>
  );

  if (!expandable || !category.evidence.length) {
    return <div>{content}</div>;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none">
        {content}
        <span className="mt-1 inline-block text-[10px] uppercase tracking-widest text-faint group-open:hidden">
          Show evidence ▾
        </span>
        <span className="mt-1 hidden text-[10px] uppercase tracking-widest text-faint group-open:inline-block">
          Hide evidence ▴
        </span>
      </summary>
      <ul className="mt-2 space-y-2 border-l border-hairline pl-3">
        {category.evidence.map((e, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-bone">{e.label}</span>
              <span className={`ticker shrink-0 ${e.impact >= 0 ? "text-bull" : "text-bear"}`}>
                {fmtSigned(e.impact * 10, 1)}
              </span>
            </div>
            <p className="mt-0.5 text-faint">{e.detail}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
