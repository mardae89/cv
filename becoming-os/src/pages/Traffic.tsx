import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chart, ChartCard, GOLD } from "@/components/charts";
import { useSubmit } from "@/components/forms/body";
import { RecordList } from "@/components/RecordList";
import { Button, Card, Field, IconButton, Input, Meter, NumberInput, PageHeader, Segmented, Select, Stat, Table } from "@/components/ui";
import { useStore } from "@/data/store";
import { settingsOf } from "@/lib/calc/power";
import {
  CHANNELS, channelName, METRICS, reachedOn, trafficWeek, trafficWeeks, type TrafficMetric,
} from "@/lib/calc/traffic";
import { addDays, fmtDate, fmtShort, weekStart } from "@/lib/dates";
import { num, round } from "@/lib/format";
import type { ISODate, TrafficChannel, TrafficEntry } from "@/lib/types";

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pctText = (v: number | null) => (v === null ? "—" : `${round(v, 1)}%`);
const weekLabel = (from: ISODate) => `${fmtShort(from)} – ${fmtShort(addDays(from, 6))}`;

export default function Traffic() {
  const { data, today, remove } = useStore();
  const settings = settingsOf(data);
  const [week, setWeek] = useState(weekStart(today));
  const [metric, setMetric] = useState<TrafficMetric>("reached");
  const [editing, setEditing] = useState<{ date: ISODate; channel: TrafficChannel } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const cur = trafficWeek(data.traffic, week);
  const prev = trafficWeek(data.traffic, addDays(week, -7));
  const isThisWeek = week === weekStart(today);
  const daysSoFar = isThisWeek ? Math.min(7, Math.round((Date.parse(today) - Date.parse(week)) / 864e5) + 1) : 7;
  const reachTarget = settings.reach_per_day * daysSoFar;
  const reachedToday = reachedOn(data.traffic, today);
  const history = trafficWeeks(data.traffic, today).slice(-12);
  const recent = [...data.traffic].sort((a, b) => (a.log_date < b.log_date ? 1 : a.log_date > b.log_date ? -1 : 0));

  const edit = (e: TrafficEntry) => {
    setEditing({ date: e.log_date, channel: e.channel });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Traffic Engine" title="The four numbers"
        sub="Track these every week: people reached, conversations, invitations and members. Find ten new people every day." />

      <Card>
        <Meter value={reachedToday} max={Math.max(1, settings.reach_per_day)} label={`Today · ${fmtDate(today)}`}
          right={`${n(reachedToday)} / ${settings.reach_per_day} new people`}
          sub={reachedToday >= settings.reach_per_day ? "Daily ten reached." : `${settings.reach_per_day - reachedToday} more to reach today's ten.`} />
      </Card>

      <section aria-label="Weekly numbers" className="space-y-4">
        <div className="flex items-center gap-2">
          <IconButton label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft className="h-4 w-4" /></IconButton>
          <h2 className="min-w-0 flex-1 text-center text-[22px] leading-none">{isThisWeek ? "This week" : weekLabel(week)}</h2>
          <IconButton label="Next week" disabled={isThisWeek} onClick={() => setWeek(addDays(week, 7))}><ChevronRight className="h-4 w-4" /></IconButton>
        </div>
        <p className="text-center text-[12px] text-mute">{weekLabel(week)}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {METRICS.map((m) => {
            const diff = cur.totals[m.key] - prev.totals[m.key];
            return (
              <Card key={m.key}>
                <Stat label={m.label} value={n(cur.totals[m.key])} accent={m.key === "members"}
                  sub={prev.totals[m.key] || cur.totals[m.key] ? `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${n(Math.abs(diff))} vs previous week` : "No entries yet"} />
              </Card>
            );
          })}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-[20px] leading-none">Conversion</h3>
            <div className="space-y-4">
              {cur.conversions.map((c) => (
                <Meter key={c.label} value={c.pct ?? 0} label={c.label} right={pctText(c.pct)}
                  sub={`${n(cur.totals[c.to])} of ${n(cur.totals[c.from])}`} />
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-[20px] leading-none">Reach target</h3>
            <Meter value={cur.totals.reached} max={Math.max(1, reachTarget)} label={`${settings.reach_per_day} a day · ${daysSoFar} day${daysSoFar === 1 ? "" : "s"}`}
              right={`${n(cur.totals.reached)} / ${n(reachTarget)}`}
              sub={cur.totals.reached >= reachTarget ? "On target for the week." : `${n(reachTarget - cur.totals.reached)} behind the daily-ten pace.`} />
            <h3 className="mb-2 mt-6 text-[20px] leading-none">By channel</h3>
            <Table minWidth={420} empty="Nothing logged for this week."
              head={["Channel", "Reached", "Conv.", "Invites", "Members"]}
              rows={cur.byChannel.map((c) => [c.channel.name, n(c.totals.reached), n(c.totals.conversations), n(c.totals.invitations), n(c.totals.members)])} />
          </Card>
        </div>
      </section>

      <div ref={formRef} className="grid scroll-mt-24 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <h3 className="mb-4 text-[22px] leading-none">Log numbers</h3>
          <TrafficForm key={editing ? `${editing.date}|${editing.channel}` : "new"} start={editing} onSaved={() => setEditing(null)} />
        </Card>
        <WhereToFind />
      </div>

      <ChartCard title="Week by week" sub="The last 12 weeks"
        action={<Segmented size="sm" value={metric} onChange={setMetric} label="Metric" options={METRICS.map((m) => ({ value: m.key, label: m.short }))} />}
        empty={history.some((w) => w.totals[metric] > 0) ? false : "Log your numbers to see the weekly trend."}>
        <Chart data={history.map((w) => ({ date: w.from, value: w.totals[metric] }))} x="date" height={240} fmt={n}
          series={[{ key: "value", label: METRICS.find((m) => m.key === metric)!.label, color: GOLD, type: "bar" }]} />
      </ChartCard>

      <Card>
        <h3 className="mb-2 text-[22px] leading-none">Recent entries</h3>
        <RecordList limit={10} empty="No numbers logged yet." items={recent.map((e) => ({
          id: e.id,
          primary: `${channelName(e.channel)} · ${fmtDate(e.log_date)}`,
          secondary: `${n(num(e.reached))} reached · ${n(num(e.conversations))} conversations · ${n(num(e.invitations))} invitations · ${n(num(e.members))} members${e.note ? ` · ${e.note}` : ""}`,
          onEdit: () => edit(e),
          onDelete: () => remove("traffic", e.id),
          deleteLabel: "this entry",
        }))} />
      </Card>
    </div>
  );
}

function TrafficForm({ start, onSaved }: { start: { date: ISODate; channel: TrafficChannel } | null; onSaved: () => void }) {
  const { data, today, upsert } = useStore();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(start?.date ?? today);
  const [channel, setChannel] = useState<TrafficChannel>(start?.channel ?? "social_outbound");
  const existing = data.traffic.find((e) => e.log_date === date && e.channel === channel);
  const fill = (e?: TrafficEntry) => Object.fromEntries(METRICS.map((m) => [m.key, e ? String(num(e[m.key])) : ""])) as Record<TrafficMetric, string>;
  const [vals, setVals] = useState(() => fill(existing));
  const [note, setNote] = useState(existing?.note ?? "");
  // Switching day or channel loads what's already recorded there, so saving updates it.
  const loaded = useRef(`${date}|${channel}`);
  useEffect(() => {
    const k = `${date}|${channel}`;
    if (loaded.current === k) return;
    loaded.current = k;
    setVals(fill(existing));
    setNote(existing?.note ?? "");
  }, [date, channel, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (date > today) throw new Error("You can't log numbers for a future date.");
      const row: Record<string, unknown> = { log_date: date, channel, note: note.trim() || null };
      for (const m of METRICS) {
        const v = vals[m.key].trim() === "" ? 0 : num(vals[m.key]);
        if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) throw new Error(`${m.label} must be a whole number of 0 or more.`);
        row[m.key] = v;
      }
      if (METRICS.every((m) => row[m.key] === 0) && !existing) throw new Error("Enter at least one number.");
      await upsert("traffic", row, "log_date,channel");
      onSaved();
      return existing ? `Updated ${channelName(channel)} for ${fmtDate(date)}.` : `Saved ${channelName(channel)} for ${fmtDate(date)}.`;
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Traffic numbers form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as TrafficChannel)}>
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </Select>
        </Field>
        {METRICS.map((m) => (
          <Field key={m.key} label={m.label}>
            <NumberInput value={vals[m.key]} onChange={(v) => setVals((s) => ({ ...s, [m.key]: v }))} step="1" min="0" inputMode="numeric" placeholder="0" />
          </Field>
        ))}
        <Field label="Note" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="optional" /></Field>
      </div>
      {existing && <p className="text-[12px] text-faint">Editing what's already logged for {channelName(channel)} on {fmtDate(date)}.</p>}
      <Button type="submit" busy={busy} className="w-full">{existing ? "Update numbers" : "Save numbers"}</Button>
    </form>
  );
}

function WhereToFind() {
  const [channel, setChannel] = useState<TrafficChannel>("social_outbound");
  const info = CHANNELS.find((c) => c.key === channel)!;
  const withSources = CHANNELS.filter((c) => c.sources.length);
  return (
    <Card>
      <h3 className="mb-1 text-[22px] leading-none">Where to find them</h3>
      <p className="mb-4 text-[13px] text-mute">Where your ten new people a day come from.</p>
      <Segmented size="sm" value={channel} onChange={setChannel} label="Channel" options={withSources.map((c) => ({ value: c.key, label: c.name }))} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {info.sources.map((s) => (
          <div key={s.place}>
            <div className="eyebrow mb-2 text-gold">{s.place}</div>
            <ul className="space-y-1.5 text-[13.5px] text-bone/90">
              {s.items.map((i) => <li key={i} className="flex gap-2"><span className="text-gold">·</span>{i}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-faint">All eight channels: {CHANNELS.map((c) => c.name).join(" · ")}.</p>
    </Card>
  );
}
