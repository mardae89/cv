"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/* ── layout constants, in real pixels ───────────────────────────────────── */
const PRICE_GUTTER = 64; // right-hand price scale
const TIME_STRIP = 26; // bottom date/time scale
const VOL_H = 46;
const PAD_T = 10;
const GAP = 8;
const MIN_BARS = 12;

interface View {
  start: number; // index of leftmost visible bar
  count: number; // bars on screen
  priceAuto: boolean; // price axis follows the data until the user takes control
  center: number;
  span: number;
}

type Zone = "plot" | "price" | "time";

/**
 * Candlestick chart with independent, directly manipulable axes — the way a
 * charting terminal behaves:
 *
 *   • plot area   — one finger pans, two fingers pinch (horizontal pinch scales
 *                   time, vertical pinch scales price), wheel zooms time
 *   • price scale — drag or pinch vertically to stretch or compress price
 *   • time scale  — drag or pinch horizontally to stretch or compress time
 *
 * The viewBox is set to the element's real pixel size, so one SVG unit is one
 * CSS pixel. That keeps text unstretched and makes every gesture a direct
 * pixel-to-value mapping rather than a guess through an aspect-ratio transform.
 */
export function PriceChart({
  symbol,
  initialTimeframe = "1D",
  height = 420,
}: {
  symbol: string;
  initialTimeframe?: Timeframe;
  height?: number;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [data, setData] = useState<ChartPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMa, setShowMa] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>({ start: 0, count: 160, priceAuto: true, center: 0, span: 1 });
  const [, bump] = useState(0);
  const repaint = useCallback(() => bump((n) => n + 1), []);

  /* Real pixel width, so the viewBox can be 1:1 with CSS pixels. */
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&bars=600`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Chart data unavailable.");
        return r.json();
      })
      .then((json: ChartPayload) => {
        if (cancelled) return;
        setData(json);
        const count = Math.min(json.candles.length, timeframe === "1W" ? 110 : 160);
        viewRef.current = {
          start: Math.max(0, json.candles.length - count),
          count,
          priceAuto: true,
          center: 0,
          span: 1,
        };
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  const H = height;
  const plotW = Math.max(60, width - PRICE_GUTTER);
  const priceH = Math.max(80, H - PAD_T - TIME_STRIP - VOL_H - GAP);

  /* ── derive the visible window ─────────────────────────────────────────── */
  const candles = data?.candles ?? [];
  const total = candles.length;
  const v = viewRef.current;
  if (total) {
    v.count = clamp(v.count, MIN_BARS, total);
    v.start = clamp(v.start, 0, total - v.count);
  }
  const s0 = Math.round(v.start);
  const n = Math.round(v.count);
  const slice = candles.slice(s0, s0 + n);
  const ma50 = (data?.ma50 ?? []).slice(s0, s0 + n);
  const ma200 = (data?.ma200 ?? []).slice(s0, s0 + n);

  /* Price axis: follows the data until the user takes hold of it. */
  let top = 1;
  let bot = 0;
  if (slice.length) {
    if (v.priceAuto) {
      const overlay = showMa ? [...ma50, ...ma200].filter((x): x is number => x != null) : [];
      const hi = Math.max(...slice.map((c) => c.h), ...overlay);
      const lo = Math.min(...slice.map((c) => c.l), ...overlay);
      const pad = (hi - lo) * 0.08 || hi * 0.01;
      top = hi + pad;
      bot = lo - pad;
      v.center = (top + bot) / 2;
      v.span = top - bot;
    } else {
      top = v.center + v.span / 2;
      bot = v.center - v.span / 2;
    }
  }

  const step = plotW / Math.max(1, slice.length);
  const bodyW = Math.max(1, Math.min(step * 0.62, 30));
  const X = (i: number) => i * step + step / 2;
  const Y = (p: number) => PAD_T + ((top - p) / (top - bot || 1)) * priceH;
  const maxVol = Math.max(1, ...slice.map((c) => c.v));
  const volTop = PAD_T + priceH + GAP;
  const VY = (vol: number) => volTop + VOL_H - (vol / maxVol) * VOL_H;

  /* ── gestures ──────────────────────────────────────────────────────────── */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    zone: Zone;
    startX: number;
    startY: number;
    view: View;
    spanX: number;
    spanY: number;
    anchorFrac: number;
  } | null>(null);

  const zoneAt = useCallback(
    (clientX: number, clientY: number): Zone => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return "plot";
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x > plotW) return "price";
      if (y > H - TIME_STRIP) return "time";
      return "plot";
    },
    [plotW, H],
  );

  const goManualPrice = () => {
    if (v.priceAuto) {
      v.priceAuto = false;
      v.center = (top + bot) / 2;
      v.span = top - bot;
    }
  };

  const zoomTime = (factor: number, anchorFrac: number, base: View) => {
    const next = clamp(base.count * factor, MIN_BARS, total);
    const anchor = base.start + base.count * anchorFrac;
    v.start = anchor - (anchor - base.start) * (next / base.count);
    v.count = next;
  };

  const zoomPrice = (factor: number, base: View) => {
    goManualPrice();
    // A sane floor and ceiling: never collapse to a line, never flatten to nothing.
    v.span = clamp(base.span * factor, Math.abs(v.center) * 1e-5 || 1e-6, Math.abs(v.center) * 20 || 1e9);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    const rect = svgRef.current!.getBoundingClientRect();
    gesture.current = {
      zone: zoneAt(e.clientX, e.clientY),
      startX: e.clientX,
      startY: e.clientY,
      view: { ...v },
      spanX: pts.length > 1 ? Math.max(1, Math.abs(pts[0].x - pts[1].x)) : 0,
      spanY: pts.length > 1 ? Math.max(1, Math.abs(pts[0].y - pts[1].y)) : 0,
      anchorFrac:
        pts.length > 1
          ? clamp(((pts[0].x + pts[1].x) / 2 - rect.left) / plotW, 0, 1)
          : clamp((e.clientX - rect.left) / plotW, 0, 1),
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (!gesture.current) {
      // Hover crosshair only.
      const rect = svgRef.current!.getBoundingClientRect();
      const i = Math.round((e.clientX - rect.left - step / 2) / step);
      setHover(i >= 0 && i < slice.length ? i : null);
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const pts = Array.from(pointers.current.values());

    if (pts.length >= 2) {
      const dx = Math.max(1, Math.abs(pts[0].x - pts[1].x));
      const dy = Math.max(1, Math.abs(pts[0].y - pts[1].y));
      // Horizontal separation drives time, vertical drives price, so a diagonal
      // pinch scales both at once. An axis is only touched when the fingers are
      // meaningfully separated along it — otherwise a flat horizontal pinch
      // would seize the price axis and stop it auto-fitting for no reason.
      const AXIS_MIN = 24;
      if (g.spanX > AXIS_MIN && dx > AXIS_MIN && g.zone !== "price") zoomTime(g.spanX / dx, g.anchorFrac, g.view);
      if (g.spanY > AXIS_MIN && dy > AXIS_MIN && g.zone !== "time") zoomPrice(g.spanY / dy, g.view);
      repaint();
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.zone === "price") {
      // Drag down compresses (zooms out), drag up expands — matches the terminals.
      zoomPrice(Math.exp(dy / 160), g.view);
    } else if (g.zone === "time") {
      zoomTime(Math.exp(-dx / 160), 1, g.view);
    } else {
      const barsPerPx = g.view.count / plotW;
      v.start = g.view.start - dx * barsPerPx;
      if (!g.view.priceAuto) {
        v.priceAuto = false;
        v.center = g.view.center + (dy / priceH) * g.view.span;
        v.span = g.view.span;
      }
    }
    repaint();
  };

  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else {
      // Lift one finger mid-pinch: re-seat the gesture on what is left.
      const rest = Array.from(pointers.current.values())[0];
      gesture.current = gesture.current
        ? { ...gesture.current, startX: rest.x, startY: rest.y, view: { ...v }, spanX: 0, spanY: 0 }
        : null;
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const zone = zoneAt(e.clientX, e.clientY);
    const base = { ...v };
    if (zone === "price") zoomPrice(e.deltaY > 0 ? 1.12 : 1 / 1.12, base);
    else zoomTime(e.deltaY > 0 ? 1.14 : 1 / 1.14, clamp((e.clientX - rect.left) / plotW, 0, 1), base);
    repaint();
  };

  const resetAll = () => {
    const count = Math.min(total, timeframe === "1W" ? 110 : 160);
    viewRef.current = { start: Math.max(0, total - count), count, priceAuto: true, center: 0, span: 1 };
    repaint();
  };
  const resetPrice = () => {
    v.priceAuto = true;
    repaint();
  };

  /* ── ticks ─────────────────────────────────────────────────────────────── */
  const priceTicks = buildPriceTicks(bot, top, 6);
  const timeTicks = buildTimeTicks(slice, timeframe, plotW, step);

  const hovered = hover != null ? slice[hover] : null;

  return (
    <div className="panel" ref={hostRef}>
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
          <Toggle label="MA" on={showMa} onChange={setShowMa} swatch="bg-gold" />
          <Toggle label="Structure" on={showStructure} onChange={setShowStructure} swatch="bg-bone" />
          <Toggle label="Events" on={showEvents} onChange={setShowEvents} swatch="bg-bear" />
          {!v.priceAuto ? (
            <button onClick={resetPrice} className="border border-gold/50 px-2 py-0.5 text-gold">
              Auto price
            </button>
          ) : null}
          <button onClick={resetAll} className="border border-hairline px-2 py-0.5 text-mute hover:border-gold hover:text-gold">
            Reset
          </button>
        </div>
      </div>

      {loading && !data ? (
        <Skeleton style={{ height }} className="m-4" />
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error} />
        </div>
      ) : !data || !slice.length ? (
        <div className="p-4 text-sm text-mute">Chart data unavailable.</div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            width={width}
            height={H}
            viewBox={`0 0 ${width} ${H}`}
            style={{ display: "block", touchAction: "none", userSelect: "none", cursor: "crosshair" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={() => setHover(null)}
            onWheel={onWheel}
            onDoubleClick={resetAll}
            role="img"
            aria-label={`${data.symbol} price chart. Pinch or drag to zoom; drag the price scale or the time scale to stretch either axis.`}
          >
            {/* price grid + right-hand scale */}
            {priceTicks.map((p) => (
              <g key={p}>
                <line x1={0} x2={plotW} y1={Y(p)} y2={Y(p)} stroke="var(--color-hairline-soft)" strokeWidth={1} />
                <text
                  x={plotW + 8}
                  y={Y(p) + 3.5}
                  fill="var(--color-faint)"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                >
                  {fmtPrice(p, data.precision)}
                </text>
              </g>
            ))}

            {/* time grid + bottom scale */}
            {timeTicks.map((t) => (
              <g key={t.i}>
                <line x1={X(t.i)} x2={X(t.i)} y1={PAD_T} y2={PAD_T + priceH} stroke="var(--color-hairline-soft)" strokeWidth={1} />
                <text x={X(t.i)} y={H - 9} fill="var(--color-faint)" fontSize={10} textAnchor="middle" fontFamily="ui-monospace, monospace">
                  {t.label}
                </text>
              </g>
            ))}

            {/* volume */}
            {slice.map((c, i) => (
              <rect
                key={`v${i}`}
                x={X(i) - bodyW / 2}
                y={VY(c.v)}
                width={bodyW}
                height={Math.max(0.5, volTop + VOL_H - VY(c.v))}
                fill={c.c >= c.o ? "var(--color-bull)" : "var(--color-bear)"}
                opacity={0.22}
              />
            ))}

            {/* candles */}
            {slice.map((c, i) => {
              const up = c.c >= c.o;
              const color = up ? "var(--color-bull)" : "var(--color-bear)";
              const yo = Y(c.o);
              const yc = Y(c.c);
              return (
                <g key={i}>
                  <line x1={X(i)} x2={X(i)} y1={Y(c.h)} y2={Y(c.l)} stroke={color} strokeWidth={1} />
                  <rect
                    x={X(i) - bodyW / 2}
                    y={Math.min(yo, yc)}
                    width={bodyW}
                    height={Math.max(1, Math.abs(yc - yo))}
                    fill={color}
                    opacity={0.92}
                  />
                </g>
              );
            })}

            {showMa ? (
              <>
                <path d={linePath(ma50, X, Y)} fill="none" stroke="var(--color-gold)" strokeWidth={1.6} />
                <path d={linePath(ma200, X, Y)} fill="none" stroke="var(--color-mute)" strokeWidth={1.4} strokeDasharray="4 3" />
              </>
            ) : null}

            {showStructure
              ? data.swings.map((sw, k) => {
                  const i = nearestIndex(slice, sw.t);
                  if (i < 0) return null;
                  const y = Y(sw.price);
                  return (
                    <g key={`s${k}`}>
                      <circle cx={X(i)} cy={y} r={2.6} fill="var(--color-bone)" opacity={0.8} />
                      <text x={X(i)} y={sw.kind === "high" ? y - 7 : y + 13} fill="var(--color-faint)" fontSize={9} textAnchor="middle">
                        {sw.kind === "high" ? "H" : "L"}
                      </text>
                    </g>
                  );
                })
              : null}

            {showEvents
              ? data.events.map((ev, k) => {
                  const i = nearestIndex(slice, ev.t);
                  if (i < 0) return null;
                  return (
                    <g key={`e${k}`}>
                      <line x1={X(i)} x2={X(i)} y1={PAD_T} y2={PAD_T + priceH} stroke="var(--color-bear)" strokeWidth={1} strokeDasharray="2 4" opacity={0.45} />
                      <rect x={X(i) - 3} y={PAD_T} width={6} height={6} fill="var(--color-bear)" opacity={0.9} />
                    </g>
                  );
                })
              : null}

            {/* last price marker on the scale */}
            {slice.length ? (
              <g>
                <line
                  x1={0}
                  x2={plotW}
                  y1={Y(slice[slice.length - 1].c)}
                  y2={Y(slice[slice.length - 1].c)}
                  stroke="var(--color-gold)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <rect x={plotW + 2} y={Y(slice[slice.length - 1].c) - 8} width={PRICE_GUTTER - 4} height={16} fill="var(--color-gold)" />
                <text
                  x={plotW + 6}
                  y={Y(slice[slice.length - 1].c) + 4}
                  fill="var(--color-void)"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={700}
                >
                  {fmtPrice(slice[slice.length - 1].c, data.precision)}
                </text>
              </g>
            ) : null}

            {hover != null && hovered ? (
              <line x1={X(hover)} x2={X(hover)} y1={PAD_T} y2={volTop + VOL_H} stroke="var(--color-gold)" strokeWidth={1} opacity={0.55} />
            ) : null}

            {/* scale hit-zones, drawn last so they sit above the plot */}
            <rect x={plotW} y={0} width={PRICE_GUTTER} height={H - TIME_STRIP} fill="transparent" style={{ cursor: "ns-resize" }} />
            <rect x={0} y={H - TIME_STRIP} width={width} height={TIME_STRIP} fill="transparent" style={{ cursor: "ew-resize" }} />
            <line x1={plotW} x2={plotW} y1={0} y2={H - TIME_STRIP} stroke="var(--color-hairline)" strokeWidth={1} />
            <line x1={0} x2={width} y1={H - TIME_STRIP} y2={H - TIME_STRIP} stroke="var(--color-hairline)" strokeWidth={1} />
          </svg>

          {hovered ? (
            <div className="pointer-events-none absolute left-3 top-2 border border-hairline bg-ink/95 px-3 py-2 text-[11px]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tnum">
                <span className="text-faint">O</span><span>{fmtPrice(hovered.o, data.precision)}</span>
                <span className="text-faint">H</span><span>{fmtPrice(hovered.h, data.precision)}</span>
                <span className="text-faint">L</span><span>{fmtPrice(hovered.l, data.precision)}</span>
                <span className="text-faint">C</span>
                <span className={hovered.c >= hovered.o ? "text-bull" : "text-bear"}>{fmtPrice(hovered.c, data.precision)}</span>
              </div>
              <div className="mt-1 text-faint">{new Date(hovered.t).toUTCString().slice(5, 22)} UTC</div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline-soft px-4 py-2 text-[10px] uppercase tracking-widest text-faint">
            <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-gold" /> 50 MA</span>
            <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-mute" /> 200 MA</span>
            <span className="tnum">{n} bars</span>
            <span>{v.priceAuto ? "Price: auto" : "Price: manual"}</span>
            <span className="ml-auto normal-case tracking-normal">
              Pinch to zoom · drag the price scale or the date scale to stretch either axis
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function linePath(series: (number | null)[], X: (i: number) => number, Y: (p: number) => number) {
  let d = "";
  let on = false;
  series.forEach((val, i) => {
    if (val == null) {
      on = false;
      return;
    }
    d += `${on ? "L" : "M"}${X(i).toFixed(1)},${Y(val).toFixed(1)} `;
    on = true;
  });
  return d.trim();
}

function nearestIndex(slice: Candle[], t: number) {
  if (!slice.length) return -1;
  if (t < slice[0].t || t > slice[slice.length - 1].t + 1) return -1;
  let best = -1;
  let bestDiff = Infinity;
  slice.forEach((c, i) => {
    const diff = Math.abs(c.t - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

/** Ticks on a "nice" step, so the labels land on round numbers at any zoom. */
function buildPriceTicks(bot: number, top: number, target: number): number[] {
  const range = top - bot;
  if (!(range > 0)) return [];
  const rough = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  const stepSize = nice * mag;
  const first = Math.ceil(bot / stepSize) * stepSize;
  const out: number[] = [];
  for (let p = first; p <= top && out.length < 12; p += stepSize) out.push(p);
  return out;
}

/** Date labels whose granularity follows the timeframe and the zoom level. */
function buildTimeTicks(slice: Candle[], tf: Timeframe, plotW: number, step: number) {
  if (!slice.length) return [];
  const maxLabels = Math.max(2, Math.floor(plotW / 78));
  const every = Math.max(1, Math.ceil(slice.length / maxLabels));
  const intraday = tf === "5M" || tf === "15M" || tf === "1H" || tf === "4H";
  const out: { i: number; label: string }[] = [];
  let lastDay = "";
  slice.forEach((c, i) => {
    if (i % every !== 0) return;
    const d = new Date(c.t);
    const day = d.toISOString().slice(0, 10);
    let label: string;
    if (intraday) {
      // Show the date when the day rolls over, the clock otherwise.
      label =
        day !== lastDay
          ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
          : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    } else {
      label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
    }
    lastDay = day;
    if (step * i < plotW - 20) out.push({ i, label });
  });
  return out;
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
    <button onClick={() => onChange(!on)} className={`flex items-center gap-1.5 transition ${on ? "text-bone" : "text-faint"}`}>
      <span className={`h-2 w-2 ${on ? swatch : "bg-hairline"}`} />
      {label}
    </button>
  );
}
