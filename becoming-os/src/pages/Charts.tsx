import { fmtCount, PLATFORMS, platformSeries } from "@/lib/calc/audience";
import { useMemo, useState } from "react";
import { Chart, ChartCard, GOLD, monthTick, NEUTRAL, type SeriesDef } from "@/components/charts";
import { Card, Field, Input, PageHeader, Pill, Segmented, Select, Stat, Toggle } from "@/components/ui";
import { useStore } from "@/data/store";
import { isRun, isSession, longestRunProgression } from "@/lib/calc/athletic";
import { monthFinance, type Ledger } from "@/lib/calc/business";
import { indexHabits, periodScore } from "@/lib/calc/habits";
import { trendSeries, weighIns } from "@/lib/calc/weight";
import { addDays, addMonths, dateRange, diffDays, fmtDate, fmtShort, monthStart, MISSION_START, weekStart } from "@/lib/dates";
import { money, num, round } from "@/lib/format";
import type { ISODate } from "@/lib/types";

type Grain = "day" | "week" | "month";
interface MetricDef {
  key: string;
  label: string;
  group: string;
  grain: Grain;
  fmt: (v: number) => string;
  /** How the period summary is computed from the points. */
  summary: "last-first" | "sum" | "avg" | "max" | "last";
  points: (from: ISODate, to: ISODate) => { date: ISODate; value: number | null }[];
  business?: boolean;
}

const isRealDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= "2000-01-01" && d <= "2100-12-31";

function buckets(grain: Grain, from: ISODate, to: ISODate): ISODate[] {
  if (grain === "day") return dateRange(from, to);
  const out: ISODate[] = [];
  if (grain === "week") for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w);
  else for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export default function Charts() {
  const { data, today, ev } = useStore();
  const [metricKey, setMetricKey] = useState("trend");
  const [preset, setPreset] = useState<"30" | "90" | "mission" | "custom">("mission");
  const [customFrom, setCustomFrom] = useState(MISSION_START);
  const [customTo, setCustomTo] = useState(today);
  const [compare, setCompare] = useState(false);

  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const series = useMemo(() => trendSeries(weighIns(data.weights)), [data.weights]);
  const idx = useMemo(() => indexHabits(data.completions, data.restDays), [data.completions, data.restDays]);
  const start = data.goals?.start_weight ?? null;

  const all: MetricDef[] = [
    { key: "weight", label: "Weight (weigh-ins)", group: "Body", grain: "day", fmt: (v) => `${round(v, 1)} lb`, summary: "last-first",
      points: (f, t) => series.filter((p) => p.date >= f && p.date <= t).map((p) => ({ date: p.date, value: p.weight })) },
    { key: "trend", label: "7-day average weight", group: "Body", grain: "day", fmt: (v) => `${round(v, 1)} lb`, summary: "last-first",
      points: (f, t) => series.filter((p) => p.date >= f && p.date <= t).map((p) => ({ date: p.date, value: p.trend })) },
    { key: "lost", label: "Pounds lost", group: "Body", grain: "day", fmt: (v) => `${round(v, 1)} lb`, summary: "last",
      points: (f, t) => start === null ? [] : series.filter((p) => p.date >= f && p.date <= t).map((p) => ({ date: p.date, value: round(num(start) - p.trend, 1) })) },
    { key: "sleep", label: "Sleep (hours)", group: "Body", grain: "day", fmt: (v) => `${round(v, 1)} h`, summary: "avg",
      points: (f, t) => data.checkins.filter((c) => c.checkin_date >= f && c.checkin_date <= t && c.sleep_hours !== null).map((c) => ({ date: c.checkin_date, value: num(c.sleep_hours) })) },
    { key: "revenue", label: "Monthly revenue earned", group: "Business", grain: "month", fmt: money, summary: "sum", business: true,
      points: (f, t) => buckets("month", f, t).map((m) => ({ date: m, value: monthFinance(l, m).revenue })) },
    { key: "cash", label: "Monthly cash collected", group: "Business", grain: "month", fmt: money, summary: "sum", business: true,
      points: (f, t) => buckets("month", f, t).map((m) => ({ date: m, value: monthFinance(l, m).cashIn })) },
    { key: "profit", label: "Monthly net profit", group: "Business", grain: "month", fmt: money, summary: "sum", business: true,
      points: (f, t) => buckets("month", f, t).map((m) => ({ date: m, value: monthFinance(l, m).profit })) },
    { key: "recurring", label: "Recurring revenue", group: "Business", grain: "month", fmt: money, summary: "sum", business: true,
      points: (f, t) => buckets("month", f, t).map((m) => ({ date: m, value: monthFinance(l, m).recurring })) },
    { key: "expenses", label: "Expenses", group: "Business", grain: "month", fmt: money, summary: "sum", business: true,
      points: (f, t) => buckets("month", f, t).map((m) => ({ date: m, value: monthFinance(l, m).expenses })) },
    { key: "workouts", label: "Workouts per week", group: "Training", grain: "week", fmt: (v) => String(Math.round(v)), summary: "sum",
      points: (f, t) => buckets("week", f, t).map((w) => ({ date: w, value: data.workouts.filter((x) => isSession(x) && x.workout_date >= w && x.workout_date <= addDays(w, 6)).length })) },
    { key: "runmiles", label: "Running distance per week", group: "Training", grain: "week", fmt: (v) => `${round(v, 1)} mi`, summary: "sum",
      points: (f, t) => buckets("week", f, t).map((w) => ({ date: w, value: round(data.workouts.filter((x) => isRun(x) && x.workout_date >= w && x.workout_date <= addDays(w, 6)).reduce((s, x) => s + num(x.distance_mi), 0), 2) })) },
    { key: "longest", label: "Longest run (records)", group: "Training", grain: "day", fmt: (v) => `${round(v, 2)} mi`, summary: "max",
      points: (f, t) => longestRunProgression(data.workouts).filter((p) => p.date >= f && p.date <= t).map((p) => ({ date: p.date, value: p.distance })) },
    { key: "habits", label: "Habit completion per week", group: "Habits", grain: "week", fmt: (v) => `${Math.round(v)}%`, summary: "avg",
      points: (f, t) => buckets("week", f, t).map((w) => ({ date: w, value: periodScore(data.habits, idx, w < f ? f : w, addDays(w, 6) > t ? t : addDays(w, 6)).pct })) },
    ...PLATFORMS.map((p): MetricDef => ({
      key: `audience.${p.key}`, label: `${p.name} ${p.unit}`, group: "Audience", grain: "day", fmt: fmtCount, summary: "last-first",
      points: (f, t) => platformSeries(data.audience, p.key).filter((r) => r.date >= f && r.date <= t).map((r) => ({ date: r.date, value: r.count })),
    })),
    { key: "milestones", label: "Milestones (cumulative)", group: "Milestones", grain: "day", fmt: (v) => String(Math.round(v)), summary: "last",
      points: (f, t) => {
        const ds = ev.unlocked.filter((m) => m.category !== "level").map((m) => m.achievedOn!).sort();
        return ds.filter((d) => d >= f && d <= t).map((d) => ({ date: d, value: ds.filter((x) => x <= d).length }));
      } },
  ];
  const metrics = all.filter((m) => !m.business || data.profile.business_enabled);

  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  // Date boxes pass through partial years while typing ("0002-…") and can be cleared; only real dates move the chart.
  const fromOk = isRealDate(customFrom), toOk = isRealDate(customTo);
  const fromError = !fromOk ? "Enter a start date." : toOk && customFrom > customTo ? "Pick a start date on or before the end date." : null;
  const to = preset === "custom" && toOk ? customTo : today;
  // The mission view also shows records logged before the mission began (a baseline weigh-in or audience count).
  const earliest = [series[0]?.date, ...data.workouts.map((w) => w.workout_date), ...data.transactions.map((t) => t.txn_date),
    ...data.audience.map((a) => a.recorded_on), ...data.checkins.map((c) => c.checkin_date)].filter(Boolean).sort()[0];
  const missionFrom = earliest && earliest < MISSION_START ? earliest : MISSION_START < today ? MISSION_START : today;
  const from = preset === "30" ? addDays(today, -29) : preset === "90" ? addDays(today, -89) : preset === "mission" || !fromOk ? missionFrom : customFrom;
  const span = Math.max(0, diffDays(from, to)) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = metric.grain === "month" ? addMonths(monthStart(from), -Math.max(1, buckets("month", from, to).length)) : addDays(from, -span);

  const cur = metric.points(from, to);
  const prev = compare ? metric.points(prevFrom, prevTo) : [];
  // Align the previous period onto the current one's x positions.
  const shift = (d: ISODate) => (metric.grain === "month" ? addMonths(d, buckets("month", from, to).length) : addDays(d, span));
  const merged = new Map<ISODate, Record<string, unknown>>();
  for (const p of cur) merged.set(p.date, { ...(merged.get(p.date) ?? { date: p.date }), value: p.value });
  for (const p of prev) { const d = shift(p.date); merged.set(d, { ...(merged.get(d) ?? { date: d }), previous: p.value }); }
  const rows = [...merged.values()].sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));

  const summarize = (pts: { value: number | null }[]) => {
    const v = pts.map((p) => p.value).filter((x): x is number => x !== null);
    if (!v.length) return null;
    switch (metric.summary) {
      case "sum": return v.reduce((a, b) => a + b, 0);
      case "avg": return v.reduce((a, b) => a + b, 0) / v.length;
      case "max": return Math.max(...v);
      case "last": return v[v.length - 1];
      default: return v[v.length - 1] - v[0];
    }
  };
  const sumLabel = { sum: "Total", avg: "Average", max: "Best", last: "Latest", "last-first": "Change" }[metric.summary];
  const a = summarize(cur);
  const b = compare ? summarize(prev) : null;
  const type: SeriesDef["type"] = metric.grain === "day" && metric.key !== "weight" ? "line" : metric.key === "weight" ? "dots" : "bar";
  const s: SeriesDef[] = [{ key: "value", label: "This period", color: GOLD, type }];
  if (compare) s.push({ key: "previous", label: "Previous period", color: NEUTRAL, type: type === "bar" ? "bar" : "line", dashed: type !== "bar" });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="History" title="Charts" sub="Every chart reads your saved records and updates the moment one is added, edited or deleted." />
      <Card>
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <Field label="Metric">
            <Select value={metric.key} onChange={(e) => setMetricKey(e.target.value)}>
              {[...new Set(metrics.map((m) => m.group))].map((g) => (
                <optgroup key={g} label={g}>{metrics.filter((m) => m.group === g).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
              ))}
            </Select>
          </Field>
          <Field group label="Range">
            <Segmented label="Date range" value={preset} onChange={setPreset} className="w-full" size="sm" options={[{ value: "30", label: "30D" }, { value: "90", label: "90D" }, { value: "mission", label: "Mission" }, { value: "custom", label: "Custom" }]} />
          </Field>
        </div>
        {preset === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
            <Field label="From" error={fromError}>
              <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            </Field>
            <Field label="To" error={toOk ? null : "Enter an end date."}>
              <Input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="mt-2"><Toggle checked={compare} onChange={setCompare} label="Compare with the previous period" sub={compare ? `${fmtDate(prevFrom)} – ${fmtDate(prevTo)}` : undefined} /></div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label={`${sumLabel} · this period`} value={a === null ? "—" : metric.fmt(a)} sub={`${fmtShort(from)} – ${fmtShort(to)}`} accent /></Card>
        {compare && <Card><Stat label={`${sumLabel} · previous`} value={b === null ? "—" : metric.fmt(b)} sub={`${fmtShort(prevFrom)} – ${fmtShort(prevTo)}`} /></Card>}
        {compare && <Card><Stat label="Difference" value={a === null || b === null ? "—" : `${a - b >= 0 ? "+" : "−"}${metric.fmt(Math.abs(a - b))}`} /></Card>}
      </div>

      <ChartCard title={metric.label} sub={compare ? "Previous period shifted onto the same dates" : undefined} empty={cur.some((p) => p.value !== null) ? false : "No saved records for this metric in this range."}>
        <Chart data={rows} x="date" height={320} fmt={metric.fmt} yWidth={metric.fmt === money ? 64 : 52} series={s} xFmt={metric.grain === "month" ? monthTick : fmtShort} />
      </ChartCard>

      {metric.key === "milestones" && (
        <Card>
          <h2 className="mb-3 text-[22px] leading-none">Combined milestone timeline</h2>
          <ul className="space-y-2">
            {ev.unlocked.filter((m) => m.achievedOn! >= from && m.achievedOn! <= to).map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="flex items-center gap-2"><Pill tone={m.tier === "major" ? "gold" : "neutral"}>{m.category}</Pill><span className="text-bone">{m.title}</span></span>
                <span className="num text-[12px] text-faint">{fmtShort(m.achievedOn)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
