"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Timeframe, TimeframeStructure } from "@/lib/types";
import { ALL_TIMEFRAMES } from "@/lib/config/scoring";
import { fmtPrice } from "@/lib/utils/format";
import { Skeleton, ErrorState } from "./primitives";

interface ChartPayload {
  symbol: string;
  name: string;
  precision: number;
  timeframe: Timeframe;
  demo: boolean;
  candles: Candle[];
  ma50: (number | null)[];
  ma200: (number | null)[];
  swings: { t: number; price: number; kind: "high" | "low" }[];
  structure: TimeframeStructure;
  events: { t: number; name: string; importance: string }[];
  news: { t: number; headline: string }[];
}

/**
 * Candlestick chart drawn as inline SVG — 50/200 MA overlays, volume, structure
 * swing markers and economic-event markers. No charting dependency, so it stays
 * fast on mobile and matches the product's visual language exactly.
 */
export function PriceChart({
  symbol,
  initialTimeframe = "1D",
  height = 380,
}: {
  symbol: string;
  initialTimeframe?: Timeframe;
  height?: number;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [data, setData] = useState<ChartPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [showMa, setShowMa] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&bars=200`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Chart data unavailable.");
        return r.json();
      })
      .then((json: ChartPayload) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  const geometry = useMemo(() => {
    if (!data?.candles.length) return null;
    const candles = data.candles;
    const W = 1000;
    const H = height;
    const padL = 8;
    const padR = 64;
    const padT = 14;
    const volH = Math.round(H * 0.16);
    const padB = 24;
    const priceH = H - padT - padB - volH - 8;

    const maValues = showMa ? [...data.ma50, ...data.ma200].filter((v): v is number => v != null) : [];
    const high = Math.max(...candles.map((c) => c.h), ...maValues);
    const low = Math.min(...candles.map((c) => c.l), ...maValues);
    const pad = (high - low) * 0.06 || high * 0.01;
    const top = high + pad;
    const bottom = low - pad;

    const plotW = W - padL - padR;
    const step = plotW / candles.length;
    const bodyW = Math.max(1.2, step * 0.58);

    const x = (i: number) => padL + i * step + step / 2;
    const y = (p: number) => padT + ((top - p) / (top - bottom || 1)) * priceH;

    const maxVol = Math.max(...candles.map((c) => c.v), 1);
    const vy = (v: number) => padT + priceH + 8 + volH - (v / maxVol) * volH;

    const line = (series: (number | null)[]) => {
      let d = "";
      let started = false;
      series.forEach((v, i) => {
        if (v == null) {
          started = false;
          return;
        }
        d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        started = true;
      });
      return d.trim();
    };

    const tIndex = (t: number) => {
      let best = -1;
      let bestDiff = Infinity;
      candles.forEach((c, i) => {
        const diff = Math.abs(c.t - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      });
      return best;
    };

    return { W, H, padL, padR, padT, padB, priceH, volH, step, bodyW, x, y, vy, top, bottom, line, tIndex, candles };
  }, [data, height, showMa]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!geometry || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * geometry.W;
    const i = Math.round((rel - geometry.padL - geometry.step / 2) / geometry.step);
    setHover(Math.max(0, Math.min(geometry.candles.length - 1, i)));
  }

  const hovered = hover != null && geometry ? geometry.candles[hover] : null;

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {ALL_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
                tf === timeframe ? "bg-gold text-void" : "text-mute hover:text-gold"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
          <Toggle label="MA 50/200" on={showMa} onChange={setShowMa} swatch="bg-gold" />
          <Toggle label="Structure" on={showStructure} onChange={setShowStructure} swatch="bg-bone" />
          <Toggle label="Events" on={showEvents} onChange={setShowEvents} swatch="bg-bear" />
        </div>
      </div>

      {loading ? (
        <Skeleton className="m-4" style={{ height: height - 32 }} />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} />
        </div>
      ) : !data || !geometry ? (
        <div className="p-4 text-sm text-mute">Chart data unavailable.</div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${geometry.W} ${geometry.H}`}
            className="w-full"
            style={{ height }}
            preserveAspectRatio="none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* price grid */}
            {Array.from({ length: 5 }).map((_, i) => {
              const p = geometry.bottom + ((geometry.top - geometry.bottom) * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1={geometry.padL} x2={geometry.W - geometry.padR}
                    y1={geometry.y(p)} y2={geometry.y(p)}
                    stroke="var(--color-hairline-soft)" strokeWidth={1}
                  />
                  <text
                    x={geometry.W - geometry.padR + 6} y={geometry.y(p) + 3}
                    fill="var(--color-faint)" fontSize={10} fontFamily="var(--font-mono)"
                  >
                    {fmtPrice(p, data.precision)}
                  </text>
                </g>
              );
            })}

            {/* volume */}
            {geometry.candles.map((c, i) => (
              <rect
                key={`v${i}`}
                x={geometry.x(i) - geometry.bodyW / 2}
                y={geometry.vy(c.v)}
                width={geometry.bodyW}
                height={Math.max(0.5, geometry.padT + geometry.priceH + 8 + geometry.volH - geometry.vy(c.v))}
                fill={c.c >= c.o ? "var(--color-bull)" : "var(--color-bear)"}
                opacity={0.22}
              />
            ))}

            {/* candles */}
            {geometry.candles.map((c, i) => {
              const up = c.c >= c.o;
              const color = up ? "var(--color-bull)" : "var(--color-bear)";
              const yo = geometry.y(c.o);
              const yc = geometry.y(c.c);
              return (
                <g key={i}>
                  <line
                    x1={geometry.x(i)} x2={geometry.x(i)} y1={geometry.y(c.h)} y2={geometry.y(c.l)}
                    stroke={color} strokeWidth={1}
                  />
                  <rect
                    x={geometry.x(i) - geometry.bodyW / 2}
                    y={Math.min(yo, yc)}
                    width={geometry.bodyW}
                    height={Math.max(1, Math.abs(yc - yo))}
                    fill={up ? color : color}
                    opacity={up ? 0.9 : 0.85}
                  />
                </g>
              );
            })}

            {/* moving averages */}
            {showMa ? (
              <>
                <path d={geometry.line(data.ma50)} fill="none" stroke="var(--color-gold)" strokeWidth={1.6} />
                <path d={geometry.line(data.ma200)} fill="none" stroke="var(--color-mute)" strokeWidth={1.4} strokeDasharray="4 3" />
              </>
            ) : null}

            {/* structure swing markers */}
            {showStructure
              ? data.swings.map((s, i) => {
                  const idx = geometry.tIndex(s.t);
                  if (idx < 0) return null;
                  const yy = geometry.y(s.price);
                  return (
                    <g key={`s${i}`}>
                      <circle cx={geometry.x(idx)} cy={yy} r={2.4} fill="var(--color-bone)" opacity={0.75} />
                      <text
                        x={geometry.x(idx)} y={s.kind === "high" ? yy - 7 : yy + 12}
                        fill="var(--color-faint)" fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)"
                      >
                        {s.kind === "high" ? "H" : "L"}
                      </text>
                    </g>
                  );
                })
              : null}

            {/* economic event markers */}
            {showEvents
              ? data.events.map((e, i) => {
                  const idx = geometry.tIndex(e.t);
                  if (idx < 0) return null;
                  return (
                    <g key={`e${i}`}>
                      <line
                        x1={geometry.x(idx)} x2={geometry.x(idx)}
                        y1={geometry.padT} y2={geometry.padT + geometry.priceH}
                        stroke="var(--color-bear)" strokeWidth={1} strokeDasharray="2 4" opacity={0.5}
                      />
                      <rect x={geometry.x(idx) - 3} y={geometry.padT} width={6} height={6} fill="var(--color-bear)" opacity={0.85} />
                    </g>
                  );
                })
              : null}

            {/* crosshair */}
            {hover != null ? (
              <line
                x1={geometry.x(hover)} x2={geometry.x(hover)}
                y1={geometry.padT} y2={geometry.padT + geometry.priceH + 8 + geometry.volH}
                stroke="var(--color-gold)" strokeWidth={1} opacity={0.6}
              />
            ) : null}
          </svg>

          {hovered ? (
            <div className="pointer-events-none absolute left-3 top-3 border border-hairline bg-ink/95 px-3 py-2 text-[11px]">
              <div className="ticker grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span className="text-faint">O</span><span>{fmtPrice(hovered.o, data.precision)}</span>
                <span className="text-faint">H</span><span>{fmtPrice(hovered.h, data.precision)}</span>
                <span className="text-faint">L</span><span>{fmtPrice(hovered.l, data.precision)}</span>
                <span className="text-faint">C</span>
                <span className={hovered.c >= hovered.o ? "text-bull" : "text-bear"}>
                  {fmtPrice(hovered.c, data.precision)}
                </span>
              </div>
              <div className="mt-1 text-faint">{new Date(hovered.t).toUTCString().slice(5, 22)} UTC</div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 border-t border-hairline-soft px-4 py-2 text-[10px] uppercase tracking-widest text-faint">
            <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-gold" /> 50 MA</span>
            <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-mute" /> 200 MA</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-bone" /> Swing high / low</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 bg-bear" /> High-impact event</span>
            {data.demo ? <span className="ml-auto text-gold">Demo data</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
  swatch,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  swatch: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex items-center gap-1.5 transition ${on ? "text-bone" : "text-faint"}`}
    >
      <span className={`h-2 w-2 ${on ? swatch : "bg-hairline"}`} />
      {label}
    </button>
  );
}
