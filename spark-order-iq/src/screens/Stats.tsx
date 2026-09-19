import { useMemo, useState } from "react";
import { Header } from "../components/Header";
import { Card, EmptyState, ProgressBar, SectionLabel, Segmented, Stat } from "../components/ui";
import { hourly as fmtHourly, minutes as fmtMinutes, money, num, percent, perMile, shortDay } from "../lib/format";
import {
  dayTotals,
  hourPerformance,
  ordersInRange,
  storePerformance,
  summarize,
  typePerformance,
  weekTotal,
  type RangeKey,
} from "../lib/stats";
import { useStore } from "../state/store";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? "am" : "pm";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
};

export function Stats() {
  const { orders, settings } = useStore();
  const [range, setRange] = useState<RangeKey>("7d");

  const rows = useMemo(() => ordersInRange(orders, range), [orders, range]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const stores = useMemo(() => storePerformance(rows), [rows]);
  const hours = useMemo(() => hourPerformance(rows), [rows]);
  const types = useMemo(() => typePerformance(rows), [rows]);
  const week = useMemo(() => dayTotals(orders, settings, 7), [orders, settings]);
  const weekEarnings = useMemo(() => weekTotal(orders, settings), [orders, settings]);

  const bestDay = Math.max(...week.map((d) => d.earnings), settings.dailyGoal, 1);
  const bestHourly = Math.max(...hours.map((h) => h.hourly ?? 0), 1);

  if (orders.length === 0) {
    return (
      <div className="anim-rise">
        <Header title="PERFORMANCE" subtitle="Your own numbers only" />
        <EmptyState title="No data yet">
          Every stat here is calculated from orders you log. Nothing is estimated from other drivers, and nothing is
          imported from Spark.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="anim-rise pb-6">
      <Header title="PERFORMANCE" subtitle="Calculated from your logged orders" />

      <Segmented value={range} onChange={setRange} options={RANGES} size="sm" />

      <Card className="mt-4">
        <div className="grid grid-cols-2 gap-y-5">
          <Stat label="Total earnings" value={money(summary.earnings)} tone="gold" />
          <Stat label="Orders" value={summary.count} />
          <Stat label="Avg per order" value={money(summary.avgPayout)} />
          <Stat label="Avg per mile" value={perMile(summary.perMile)} />
          <Stat label="Avg hourly" value={fmtHourly(summary.hourly)} />
          <Stat label="Total miles" value={num(summary.miles)} />
          <Stat label="Avg order time" value={fmtMinutes(summary.avgMinutes)} />
          <Stat label="Avg miles/order" value={num(summary.avgMiles)} />
        </div>
      </Card>

      <div className="mt-5">
        <SectionLabel right={<span className="tnum text-xs text-mute">{percent((weekEarnings / Math.max(settings.weeklyGoal, 1)) * 100, 1)}</span>}>
          Last 7 days
        </SectionLabel>
        <Card>
          <div className="flex items-end justify-between">
            <div className="tnum text-3xl font-black text-gold">{money(weekEarnings)}</div>
            <div className="tnum text-right text-xs text-mute">
              weekly goal
              <br />
              {money(settings.weeklyGoal, 0)}
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar percent={(weekEarnings / Math.max(settings.weeklyGoal, 1)) * 100} />
          </div>

          <div className="mt-5 space-y-2.5">
            {week.map((day) => (
              <div key={day.day} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-mute">{shortDay(day.iso)}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <div
                    className={`h-full rounded-full ${day.earnings >= day.goal ? "bg-take" : "bg-gold"}`}
                    style={{ width: `${Math.min((day.earnings / bestDay) * 100, 100)}%` }}
                  />
                </div>
                <span className="tnum w-16 shrink-0 text-right text-xs font-semibold">{money(day.earnings, 0)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">Bars are scaled to your best day in this window.</p>
        </Card>
      </div>

      <div className="mt-5">
        <SectionLabel>Store performance</SectionLabel>
        {stores.length === 0 ? (
          <Card>
            <p className="text-sm text-mute">Name a store when you log an order to see it broken out here.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {stores.map((store) => (
              <Card key={store.key}>
                <div className="flex items-center justify-between">
                  <div className="truncate text-sm font-bold">{store.label}</div>
                  <div className="tnum shrink-0 text-sm font-bold text-gold">{money(store.earnings)}</div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Orders" value={String(store.count)} />
                  <MiniStat label="Avg pay" value={money(store.avgPayout)} />
                  <MiniStat label="$/mi" value={store.perMile === null ? "—" : store.perMile.toFixed(2)} />
                  <MiniStat label="$/hr" value={store.hourly === null ? "—" : store.hourly.toFixed(0)} />
                </div>
              </Card>
            ))}
            <p className="px-1 text-xs text-mute">
              Your own history for these stores in this window — not a claim about how they pay in general.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5">
        <SectionLabel>By hour of day</SectionLabel>
        <Card>
          <div className="space-y-2.5">
            {hours.map((hour) => (
              <div key={hour.hour} className="flex items-center gap-3">
                <span className="tnum w-12 shrink-0 text-xs text-mute">{hourLabel(hour.hour)}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${((hour.hourly ?? 0) / bestHourly) * 100}%` }} />
                </div>
                <span className="tnum w-20 shrink-0 text-right text-xs font-semibold">{fmtHourly(hour.hourly)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">Hourly rate by the hour you logged the order. Thin data early on.</p>
        </Card>
      </div>

      <div className="mt-5">
        <SectionLabel>By order type</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {types.map((type) => (
            <Card key={type.type}>
              <div className="text-sm font-bold">{type.type}</div>
              <div className="mt-2 space-y-1.5 text-xs text-mute">
                <Line label="Orders" value={String(type.count)} />
                <Line label="Avg pay" value={money(type.avgPayout)} />
                <Line label="Avg time" value={fmtMinutes(type.avgMinutes)} />
                <Line label="Per hour" value={fmtHourly(type.hourly)} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tnum text-sm font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-mute">{label}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tnum text-white">{value}</span>
    </div>
  );
}
