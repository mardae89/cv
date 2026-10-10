// Chart building blocks. One y-axis per chart, 2px lines, recessive hairline
// grid, a tooltip on every chart, and a legend whenever there are two or more
// series. Categorical colours were validated for colour-vision deficiency on
// the panel surface (gold, aqua, blue, magenta — in that fixed order).
import type { ReactNode } from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { addDays, addMonths, fmtShort, maxDate, MISSION_END, MISSION_START, monthStart } from "@/lib/dates";
import type { ISODate } from "@/lib/types";
import { cx, Segmented } from "./ui";

export const SERIES = ["#c98500", "#199e70", "#3987e5", "#d55181"] as const;
export const GOLD = "#c9a24c";
export const NEUTRAL = "#8a8990";

const axis = { stroke: "#2a2a2f", tick: { fill: "#8a8990", fontSize: 11 }, tickLine: false, axisLine: false };

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  type?: "line" | "bar" | "dots" | "area";
  dashed?: boolean;
}

function TooltipBox({ active, payload, label, fmt, xFmt }: {
  active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string;
  fmt: (v: number) => string; xFmt: (x: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  return (
    <div className="rounded-xl border border-line bg-raised px-3 py-2 text-[12px] shadow-xl shadow-black/50">
      <div className="mb-1 text-mute">{xFmt(String(label))}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined && !seen.has(p.dataKey) && seen.add(p.dataKey)).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-mute">{p.name}</span>
          <span className="num ml-auto pl-3 font-semibold text-bone">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Chart({ data, x, series, fmt = (v) => String(v), xFmt = fmtShort, height = 240, yDomain, refs, legend, yWidth = 44 }: {
  data: object[]; x: string; series: SeriesDef[]; fmt?: (v: number) => string; xFmt?: (x: string) => string;
  height?: number; yDomain?: [unknown, unknown]; refs?: { y: number; label: string }[]; legend?: boolean; yWidth?: number;
}) {
  const showLegend = legend ?? series.length > 1;
  // Bars and areas encode length, so their axis always includes zero.
  const zeroBased = series.some((s) => s.type === "bar" || s.type === "area");
  const domain = yDomain ?? (zeroBased ? [(min: number) => Math.min(0, min), "auto"] : ["auto", "auto"]);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke="#1d1d21" vertical={false} />
          <XAxis dataKey={x} {...axis} tickFormatter={xFmt} minTickGap={24} />
          <YAxis {...axis} width={yWidth} domain={domain as never} tickFormatter={(v) => fmt(Number(v))} allowDecimals />
          <Tooltip content={<TooltipBox fmt={fmt} xFmt={xFmt} />} cursor={{ stroke: "#3a3a40", strokeWidth: 1, fill: "rgba(255,255,255,0.03)" }} />
          {showLegend && <Legend verticalAlign="top" align="left" height={28} iconType="circle" iconSize={8}
            formatter={(v) => <span className="text-[11.5px] text-mute">{v}</span>} />}
          {refs?.map((r) => (
            <ReferenceLine key={r.label} y={r.y} stroke="#4a4a52" strokeWidth={1}
              label={{ value: r.label, position: "insideTopRight", fill: "#8a8990", fontSize: 10.5 }} />
          ))}
          {series.map((s) => {
            if (s.type === "bar") return <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={24} />;
            if (s.type === "dots") return <Scatter key={s.key} dataKey={s.key} name={s.label} fill={s.color} shape={(p: { cx?: number; cy?: number }) => (
              p.cx === undefined || p.cy === undefined ? <g /> : <circle cx={p.cx} cy={p.cy} r={3} fill={s.color} stroke="#111113" strokeWidth={1.5} />
            )} />;
            if (s.type === "area") return <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.1} type="monotone" connectNulls dot={false} />;
            return <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} type="monotone"
              connectNulls strokeDasharray={s.dashed ? "4 4" : undefined} activeDot={{ r: 4, stroke: "#111113", strokeWidth: 2 }} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type RangeKey = "30d" | "90d" | "mission" | "all";

export function rangeFor(key: RangeKey, today: ISODate, earliest?: ISODate | null): { from: ISODate; to: ISODate } {
  if (key === "30d") return { from: addDays(today, -29), to: today };
  if (key === "90d") return { from: addDays(today, -89), to: today };
  // The mission view also includes any baseline records logged before Oct 10.
  if (key === "mission") {
    const from = earliest && earliest < MISSION_START ? earliest : MISSION_START;
    return { from, to: today < MISSION_END ? maxDate(today, MISSION_START) : MISSION_END };
  }
  return { from: earliest && earliest < MISSION_START ? earliest : MISSION_START, to: today };
}

export function RangePicker({ value, onChange, className }: { value: RangeKey; onChange: (v: RangeKey) => void; className?: string }) {
  return (
    <Segmented size="sm" className={className} value={value} onChange={onChange}
      options={[{ value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "mission", label: "Mission" }, { value: "all", label: "All" }]} />
  );
}

export function ChartCard({ title, sub, action, children, empty, className }: {
  title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; empty?: string | false; className?: string;
}) {
  return (
    <section className={cx("card p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-sans text-[14px] font-semibold tracking-normal text-bone">{title}</h3>
          {sub && <p className="mt-0.5 text-[12px] text-mute">{sub}</p>}
        </div>
        {action}
      </div>
      {empty ? <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-[13px] text-faint">{empty}</div> : children}
    </section>
  );
}

export const monthTick = (d: string) => {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1];
  return `${m} ’${d.slice(2, 4)}`;
};

export function monthsBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}
