import { useMemo, useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, EmptyState, SectionLabel, Segmented, Stat } from "../components/ui";
import { hourly as fmtHourly, minutes as fmtMinutes, money, num, perMile, relativeDay, timeOfDay } from "../lib/format";
import { ordersInRange, summarize, type RangeKey } from "../lib/stats";
import type { OrderRecord } from "../lib/types";
import { useStore } from "../state/store";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

export function History({ onAddEarnings, onAnalyze }: { onAddEarnings: () => void; onAnalyze: () => void }) {
  const { orders, deleteOrder } = useStore();
  const [range, setRange] = useState<RangeKey>("today");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => ordersInRange(orders, range), [orders, range]);
  const summary = useMemo(() => summarize(rows), [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, OrderRecord[]>();
    for (const order of rows) {
      const key = relativeDay(order.completedAt);
      const list = map.get(key);
      if (list) list.push(order);
      else map.set(key, [order]);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="anim-rise pb-6">
      <Header title="ORDER HISTORY" subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} logged`} />

      <Segmented value={range} onChange={setRange} options={RANGES} size="sm" />

      <Card className="mt-4">
        <div className="grid grid-cols-2 gap-y-4">
          <Stat label="Earned" value={money(summary.earnings)} tone="gold" />
          <Stat label="Orders" value={summary.count} />
          <Stat label="Per mile" value={perMile(summary.perMile)} />
          <Stat label="Per hour" value={fmtHourly(summary.hourly)} />
        </div>
      </Card>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing in this range">
            Log an order after you finish it, and it shows up here with its $/mile and hourly rate.
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" onClick={onAnalyze}>
                Analyze an offer
              </Button>
              <Button size="sm" variant="secondary" onClick={onAddEarnings}>
                Add earnings
              </Button>
            </div>
          </EmptyState>
        </div>
      ) : null}

      {groups.map(([day, list]) => (
        <div key={day} className="mt-5">
          <SectionLabel
            right={<span className="tnum text-xs font-bold text-gold">{money(list.reduce((a, o) => a + o.payout, 0))}</span>}
          >
            {day}
          </SectionLabel>
          <div className="space-y-2">
            {list.map((order) => {
              const perMileValue = order.miles && order.miles > 0 ? order.payout / order.miles : null;
              const hourlyValue = order.minutes && order.minutes > 0 ? order.payout / (order.minutes / 60) : null;
              const open = openId === order.id;
              return (
                <Card key={order.id} onClick={() => setOpenId(open ? null : order.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="tnum text-xl font-bold">{money(order.payout)}</span>
                        {order.decision ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              order.decision === "TAKE"
                                ? "bg-take/15 text-take"
                                : order.decision === "CONSIDER"
                                  ? "bg-consider/15 text-consider"
                                  : "bg-skip/15 text-skip"
                            }`}
                          >
                            {order.decision}
                            {order.score !== null ? ` ${order.score}` : ""}
                          </span>
                        ) : null}
                        {order.sample ? (
                          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-bold text-mute">SAMPLE</span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-mute">
                        {timeOfDay(order.completedAt)} · {order.storeLabel ?? order.store} · {order.type}
                      </div>
                    </div>
                    <div className="tnum shrink-0 text-right text-xs text-mute">
                      <div>{num(order.miles)} mi</div>
                      <div>{fmtMinutes(order.minutes)}</div>
                    </div>
                  </div>

                  {open ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <div className="grid grid-cols-2 gap-y-3">
                        <Stat label="Per mile" value={perMile(perMileValue)} />
                        <Stat label="Per hour" value={fmtHourly(hourlyValue)} />
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        full
                        className="mt-3"
                        onClick={() => {
                          deleteOrder(order.id);
                          setOpenId(null);
                        }}
                      >
                        Delete this order
                      </Button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
