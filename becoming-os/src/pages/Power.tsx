import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListChecks, Pencil, Plus } from "lucide-react";
import { forwardRef, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@/components/AppLink";
import { ChartCard, monthTick } from "@/components/charts";
import { useFeedback } from "@/components/feedback";
import { useSubmit } from "@/components/forms/body";
import {
  DayDot, dayStatusLine, PcrBadge, PcrTrendChart, PowerCalendar, PowerItemRow, pctText, RatingScale, StreakFlame, useDayCelebration,
  usePowerIndex, usePrefersReducedMotion, WhyBanner,
} from "@/components/power";
import {
  Button, Card, cx, DayPicker, EmptyState, Eyebrow, Field, IconButton, Input, Meter, NumberInput, PageHeader, Segmented, Select, Sheet, Stat,
} from "@/components/ui";
import { useStore } from "@/data/store";
import {
  analyse, contentTally, dayResult, dayStatus, firstStart, GREEN_AT, greenStreak, monthOf, periodResult, periods, rating, settingsOf,
  standardPowerList, weekOf, type PeriodResult, type PowerIndex,
} from "@/lib/calc/power";
import { addDays, DAY_LETTERS, dateRange, diffDays, fmtLongDate, fmtMonth, fmtShort, maxDate, minDate, monthStart } from "@/lib/dates";
import { errorMessage, plural } from "@/lib/format";
import type { ISODate, PowerAuto, PowerItem, UserData } from "@/lib/types";

type Grain = "week" | "month";

const periodLabel = (p: Pick<PeriodResult, "from" | "to">, grain: Grain) =>
  grain === "week" ? `${fmtShort(p.from)} – ${fmtShort(p.to)}` : fmtMonth(p.from);

/** Content completed in a period, against targets for the days the list was running. */
function tallyFor(data: UserData, p: PeriodResult, today: ISODate) {
  const start = firstStart(data.powerItems);
  const from = start ? maxDate(p.from, start) : p.from;
  const to = minDate(p.to, today);
  return contentTally(data.contentIdeas, p.from, p.to, settingsOf(data), dateRange(from, to));
}

export default function Power() {
  const { data, today, insert } = useStore();
  const { toast } = useFeedback();
  const idx = usePowerIndex();
  const reduced = usePrefersReducedMotion();
  const [day, setDay] = useState<ISODate>(today);
  const [grain, setGrain] = useState<Grain>("week");
  const [month, setMonth] = useState<ISODate>(monthStart(today));
  const [editing, setEditing] = useState<"list" | "new" | null>(null);
  const [adding, setAdding] = useState(false);
  const dayRef = useRef<HTMLElement>(null);
  const items = data.powerItems;
  const shownDay = day > today ? today : day;

  const selectDay = (d: ISODate) => {
    setDay(d > today ? today : d);
    dayRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const addStandard = async () => {
    setAdding(true);
    try {
      await insert("powerItems", standardPowerList(today) as unknown as Record<string, unknown>[]);
      toast("Standard Power List added. It counts from today.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setAdding(false);
    }
  };

  const header = (
    <PageHeader eyebrow="Daily standard" title="Power List"
      sub={`The non-negotiables, every day. A day is green at ${GREEN_AT}% or more of what was due.`}
      action={items.length ? <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing("list")}>Edit list</Button> : undefined} />
  );

  if (!items.length) {
    return (
      <div className="space-y-6">
        {header}
        <WhyBanner />
        <EmptyState icon={<ListChecks className="h-7 w-7" />} title="Set your Power List"
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button busy={adding} onClick={addStandard}>Use my standard list</Button>
              <Button variant="secondary" onClick={() => setEditing("new")}>Build my own</Button>
            </div>
          )}>
          The short list of things you complete every day, no matter what. Your Power List Completion Rate (PCR) is the share you complete: {GREEN_AT}% is good, 80% great, 90% exceptional.
        </EmptyState>
        <ManageSheet open={!!editing} start={editing === "new" ? "new" : "list"} onClose={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <WhyBanner />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <DayPanel ref={dayRef} day={shownDay} setDay={setDay} idx={idx} />
        <ScorePanel grain={grain} setGrain={setGrain} idx={idx} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <h2 className="mb-1 text-[24px] leading-none">Calendar</h2>
          <p className="mb-4 text-[12.5px] text-mute">Tap a day to open it above.</p>
          <PowerCalendar month={month} onMonthChange={setMonth} selected={shownDay} onSelect={selectDay} />
        </Card>
        <TrendCard grain={grain} idx={idx} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <History grain={grain} idx={idx} />
        <Evidence idx={idx} />
      </div>

      <ManageSheet open={!!editing} start={editing === "new" ? "new" : "list"} onClose={() => setEditing(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── day ──
const DayPanel = forwardRef<HTMLElement, { day: ISODate; setDay: (d: ISODate) => void; idx: PowerIndex }>(function DayPanel({ day, setDay, idx }, ref) {
  const { data, today } = useStore();
  const r = useMemo(() => dayResult(data.powerItems, day, idx), [data.powerItems, day, idx]);
  const moment = useDayCelebration(r);
  const status = dayStatus(r, today);
  const isToday = day === today;
  const xp = r.done * 5 + ((r.pct ?? 0) >= GREEN_AT ? 25 : 0) + (r.pct === 100 ? 50 : 0);
  return (
    <section ref={ref} className="card scroll-mt-24 p-5 sm:p-6" aria-label="Day checklist">
      {moment}
      <div className="flex items-center gap-1.5">
        <IconButton label="Previous day" className="shrink-0" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="h-5 w-5" /></IconButton>
        <Input type="date" value={day} max={today} aria-label="Day" className="h-10 min-w-0 flex-1 py-0 text-[14px] sm:max-w-[180px] sm:flex-none"
          onChange={(e) => { const v = e.target.value; if (v) setDay(v > today ? today : v); }} />
        <IconButton label="Next day" disabled={isToday} onClick={() => setDay(addDays(day, 1))}
          className="shrink-0 disabled:pointer-events-none disabled:opacity-30"><ChevronRight className="h-5 w-5" /></IconButton>
        <Button size="sm" variant="secondary" className="ml-auto h-10 shrink-0" disabled={isToday} onClick={() => setDay(today)}>Today</Button>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div className="relative">
          <span className="sr-only">{r.due ? `${r.done} of ${r.due} complete, ${pctText(r.pct)}` : "Nothing due"}</span>
          <div aria-hidden>
            <RingBig done={r.done} due={r.due} pct={r.pct} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1">{isToday ? "Today" : fmtShort(day)}</Eyebrow>
          <h2 className="text-[26px] leading-[1.05] sm:text-[30px]">{fmtLongDate(day).replace(/, \d{4}$/, "")}</h2>
          <p className={cx("mt-1.5 text-[13px]", status === "best" ? "text-best" : status === "green" ? "text-good" : status === "orange" ? "text-warn" : status === "red" ? "text-alert" : "text-mute")} aria-live="polite">
            {dayStatusLine(r, today)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.pct !== null && <PcrBadge pct={r.pct} size="sm" />}
            {r.due > 0 && <span className="num text-[11.5px] text-gold">+{xp} XP</span>}
          </div>
        </div>
      </div>

      {r.due ? (
        <ul className="mt-4 divide-y divide-hair border-t border-hair">
          {r.items.map((s) => <PowerItemRow key={s.item.id} s={s} date={day} />)}
        </ul>
      ) : (
        <p className="mt-5 border-t border-hair pt-4 text-[13px] text-faint">
          {firstStart(data.powerItems)! > day ? `Your Power List starts ${fmtShort(firstStart(data.powerItems)!)}. Nothing counts before then.` : "Nothing on the list is due on this day."}
        </p>
      )}
    </section>
  );
});

function RingBig({ done, due, pct }: { done: number; due: number; pct: number | null }) {
  const size = 112, stroke = 8;
  const rr = (size - stroke) / 2;
  const c = 2 * Math.PI * rr;
  const p = due ? Math.min(1, done / due) : 0;
  const green = (pct ?? 0) >= GREEN_AT;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={rr} stroke="var(--raised)" strokeWidth={stroke} fill="none" />
        {/* the green line, at 75% of the way round */}
        <circle cx={size / 2} cy={size / 2} r={rr} stroke="var(--line)" strokeWidth={stroke} fill="none"
          strokeDasharray={`2 ${c - 2}`} strokeDashoffset={-(c * GREEN_AT) / 100 + 1} />
        <circle cx={size / 2} cy={size / 2} r={rr} stroke={green ? "var(--gold)" : "var(--gold-dim)"} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset .8s ease-out, stroke .3s" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[26px] font-semibold leading-none">{due ? pctText(pct) : "—"}</span>
        <span className="num mt-1 text-[11px] text-mute">{done}/{due}</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── score ──
function currentPeriods(grain: Grain, today: ISODate) {
  const cur = grain === "week" ? weekOf(today) : monthOf(today);
  const prev = grain === "week" ? weekOf(addDays(cur.from, -1)) : monthOf(addDays(cur.from, -1));
  return { cur, prev };
}

function PeriodBreakdown({ p, prev, grain }: { p: PeriodResult; prev: PeriodResult | null; grain: Grain }) {
  const { data, today } = useStore();
  const tally = tallyFor(data, p, today);
  const a = analyse(p, prev && prev.due ? prev : null, tally, grain);
  const weakestFirst = [...p.perItem].sort((x, y) => x.pct - y.pct || x.item.sort_order - y.item.sort_order);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[14px] font-medium text-bone">{a.headline}</p>
        {a.points.length > 0 && (
          <ul className="mt-2 space-y-1.5 text-[13px] text-mute">
            {a.points.map((pt) => <li key={pt} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />{pt}</li>)}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t sm:grid-cols-4 border-hair pt-4">
        <Stat label="Green days" value={<span className="text-good">{p.greenDays}</span>} />
        <Stat label="Orange days" value={<span className={p.orangeDays ? "text-warn" : ""}>{p.orangeDays}</span>} />
        <Stat label="Red days" value={<span className={p.redDays ? "text-alert" : ""}>{p.redDays}</span>} />
        <Stat label="Perfect" value={p.perfectDays} accent={p.perfectDays > 0} />
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-hair pt-4">
        <Meter value={tally.shorts} max={Math.max(1, tally.shortTarget)} label="Short-form" right={`${tally.shorts}/${tally.shortTarget}`} />
        <Meter value={tally.longs} max={Math.max(1, tally.longTarget)} label="Long-form" right={`${tally.longs}/${tally.longTarget}`} />
      </div>
      {weakestFirst.length > 0 && (
        <div className="border-t border-hair pt-4">
          <div className="eyebrow mb-3">By item · weakest first</div>
          <ul className="space-y-3">
            {weakestFirst.map((i) => (
              <li key={i.item.id}>
                <Meter thin value={i.pct} markers={[{ at: GREEN_AT }]}
                  label={<span className={cx(i.pct < GREEN_AT ? "text-bone" : "text-bone/80")}>{i.item.name}{i.item.archived_on && i.item.archived_on <= today ? " (archived)" : ""}</span>}
                  right={<span className={cx("text-[11.5px]", i.pct < GREEN_AT ? "text-alert" : "font-normal text-mute")}>{i.done}/{i.due} · {Math.round(i.pct)}%</span>} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScorePanel({ grain, setGrain, idx }: { grain: Grain; setGrain: (g: Grain) => void; idx: PowerIndex }) {
  const { data, today } = useStore();
  const items = data.powerItems;
  const { cur, prev } = currentPeriods(grain, today);
  const p = useMemo(() => periodResult(items, cur.from, cur.to, idx, today), [items, cur.from, cur.to, idx, today]);
  const pp = useMemo(() => periodResult(items, prev.from, prev.to, idx, today), [items, prev.from, prev.to, idx, today]);
  const streak = useMemo(() => greenStreak(items, idx, today), [items, idx, today]);
  const r = p.pct === null ? null : rating(p.pct);
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow className="mb-1">Score</Eyebrow>
          <h2 className="text-[26px] leading-none">This {grain}</h2>
        </div>
        <Segmented label="Score period" value={grain} onChange={setGrain} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="display-num text-[64px] leading-[0.85] text-bone" aria-label={`PCR ${pctText(p.pct)}`}>{pctText(p.pct)}</div>
        <div className="pb-1">
          <PcrBadge pct={p.pct} />
          <div className="num mt-1 text-[11.5px] text-mute">{periodLabel(p, grain)} · {p.done}/{p.due} items</div>
        </div>
      </div>
      {r && <p className="mt-2 text-[13px] text-mute">{r.line}</p>}
      <div className="mt-4"><RatingScale pct={p.pct} /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hair px-3 py-2.5">
        <StreakFlame current={streak.current} best={streak.best} />
      </div>
      <div className="mt-5 border-t border-hair pt-5">
        <PeriodBreakdown p={p} prev={pp} grain={grain} />
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── trend ──
function TrendCard({ grain, idx }: { grain: Grain; idx: PowerIndex }) {
  const { data, today } = useStore();
  const list = useMemo(() => periods(data.powerItems, grain, idx, today), [data.powerItems, grain, idx, today]);
  const points = list.filter((p) => p.pct !== null).map((p) => ({ x: p.from, pct: Math.round(p.pct!), label: periodLabel(p, grain) }));
  return (
    <ChartCard title={`PCR by ${grain}`} sub={`Oldest to newest. ${GREEN_AT}% is the line.`}
      empty={points.length ? false : `Your first ${grain} appears here once something is due.`}>
      <PcrTrendChart points={points} tick={(x) => (grain === "week" ? fmtShort(x) : monthTick(x))} />
    </ChartCard>
  );
}

// ─────────────────────────────────────────────────────────── history ──
function History({ grain, idx }: { grain: Grain; idx: PowerIndex }) {
  const { data, today } = useStore();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<PeriodResult | null>(null);
  const list = useMemo(() => periods(data.powerItems, grain, idx, today), [data.powerItems, grain, idx, today]);
  const past = list.filter((p) => p.complete).reverse();
  const shown = all ? past : past.slice(0, 6);
  const prevOf = (p: PeriodResult) => list[list.indexOf(p) - 1] ?? null;
  return (
    <Card>
      <h2 className="mb-1 text-[24px] leading-none">{grain === "week" ? "Previous weeks" : "Previous months"}</h2>
      <p className="mb-3 text-[12.5px] text-mute">Newest first. Tap one for the full review.</p>
      {past.length ? (
        <ul className="divide-y divide-hair">
          {shown.map((p) => {
            const t = tallyFor(data, p, today);
            return (
              <li key={p.from}>
                <button type="button" onClick={() => setOpen(p)} className="flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left hover:bg-raised/40"
                  aria-label={`${periodLabel(p, grain)}: ${pctText(p.pct)} PCR, ${p.pct === null ? "" : rating(p.pct).label}. Open review`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-bone">{periodLabel(p, grain)}</span>
                    <span className="num mt-0.5 block text-[11.5px] text-mute">
                      {p.greenDays} green · {p.orangeDays} orange · {p.redDays} red · {t.shorts}/{t.shortTarget} short · {t.longs}/{t.longTarget} long
                    </span>
                  </span>
                  <PcrBadge pct={p.pct} size="sm" />
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="py-4 text-[13px] text-faint">Your first full {grain} appears here once it ends.</p>}
      {past.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-2 h-10" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${past.length}`}</Button>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? periodLabel(open, grain) : ""} wide>
        {open && <PeriodSheet p={open} prev={prevOf(open)} grain={grain} />}
      </Sheet>
    </Card>
  );
}

function PeriodSheet({ p, prev, grain }: { p: PeriodResult; prev: PeriodResult | null; grain: Grain }) {
  const { data, today } = useStore();
  const idx = usePowerIndex();
  const days = useMemo(() => dateRange(p.from, p.to).map((d) => dayResult(data.powerItems, d, idx)), [p.from, p.to, data.powerItems, idx]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="display-num text-[48px] leading-none">{pctText(p.pct)}</span>
        <div>
          <PcrBadge pct={p.pct} />
          {p.pct !== null && <div className="mt-1 text-[12px] text-mute">{rating(p.pct).line}</div>}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Days</div>
        <div className="flex flex-wrap gap-1.5">
          {days.map((r) => (
            <div key={r.date} className="flex flex-col items-center gap-0.5">
              <DayDot r={r} today={today} />
              {grain === "week" && <span className="text-[10px] text-faint" aria-hidden>{DAY_LETTERS[new Date(r.date + "T00:00:00Z").getUTCDay()]}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-hair pt-5">
        <PeriodBreakdown p={p} prev={prev} grain={grain} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────── evidence ──
function Evidence({ idx }: { idx: PowerIndex }) {
  const { data, today, ev } = useStore();
  const s = settingsOf(data);
  const items = data.powerItems;
  const start = firstStart(items);
  const life = useMemo(() => (start && start <= today ? periodResult(items, start, today, idx, today) : null), [items, start, today, idx]);
  const streak = useMemo(() => greenStreak(items, idx, today), [items, idx, today]);
  const months = useMemo(() => periods(items, "month", idx, today), [items, idx, today]);
  const videos = data.contentIdeas.filter((c) => c.status === "done");
  const shorts = videos.filter((c) => c.format === "short").length;

  // Running totals for counted items (pages, stories, sessions…), from every day they were due.
  const totals = useMemo(() => {
    const m = new Map<string, { item: PowerItem; total: number }>();
    for (const d of life?.days ?? []) {
      for (const st of d.items) {
        if (st.item.kind !== "count" || st.item.auto === "shorts" || st.item.auto === "longs") continue;
        const e = m.get(st.item.id) ?? { item: st.item, total: 0 };
        e.total += st.value;
        m.set(st.item.id, e);
      }
    }
    return [...m.values()].sort((a, b) => a.item.sort_order - b.item.sort_order);
  }, [life]);

  const first = months[0], last = months[months.length - 1];
  const mom = months.length >= 2 && first.pct !== null && last.pct !== null ? last.pct - first.pct : null;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold/10 blur-3xl" aria-hidden />
      <Eyebrow className="mb-1 text-gold">Evidence</Eyebrow>
      <h2 className="text-[26px] leading-none">Who you're becoming</h2>
      {s.identity?.trim() ? (
        <p className="mt-3 border-l-2 border-gold/60 pl-3 font-display text-[21px] italic leading-snug text-bone">{s.identity}</p>
      ) : (
        <p className="mt-3 text-[13px] text-mute">Write one line about who you're becoming. <Link to="/settings#power" className="link">Write it in Settings</Link></p>
      )}
      <p className="mt-4 text-[12.5px] text-mute">
        {start ? (start <= today ? `The record since ${fmtShort(start)}, ${plural(diffDays(start, today) + 1, "day")} in.` : `Your list starts ${fmtShort(start)}.`) : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <Tile value={<span className="text-good">{life?.greenDays ?? 0}</span>} label="Green days" />
        <Tile value={<span className="text-gold">{life?.perfectDays ?? 0}</span>} label="Perfect days" />
        <Tile value={streak.best} label="Best green streak" sub={`${streak.current} current`} />
        <Tile value={(life?.done ?? 0).toLocaleString("en-US")} label="Items completed" sub={life?.pct != null ? `${pctText(life.pct)} lifetime PCR` : undefined} />
        <Tile value={videos.length} label="Videos completed" sub={`${shorts} short · ${videos.length - shorts} long`} />
        {totals.map((t) => (
          <Tile key={t.item.id} value={Math.round(t.total).toLocaleString("en-US")} unit={t.item.unit ?? undefined} label={t.item.name} />
        ))}
      </div>
      <div className="mt-5 grid gap-3 border-t border-hair pt-4 sm:grid-cols-2">
        <div>
          <div className="eyebrow mb-1">Level</div>
          <div className="text-[14px] text-bone">Level {ev.level.current.level} · {ev.level.current.name}</div>
          <Link to="/achievements" className="num inline-flex h-8 items-center text-[12.5px] text-gold hover:text-gold-hi">{ev.xp.total.toLocaleString("en-US")} XP →</Link>
        </div>
        <div>
          <div className="eyebrow mb-1">Month over month</div>
          {mom !== null ? (
            <div className="text-[13px] text-bone">
              {fmtMonth(first.from)} {pctText(first.pct)} → {fmtMonth(last.from)} {pctText(last.pct)}
              <span className={cx("num ml-2 font-semibold", mom >= 0 ? "text-good" : "text-alert")}>{mom >= 0 ? "+" : "−"}{Math.abs(Math.round(mom))} pts</span>
            </div>
          ) : <div className="text-[13px] text-faint">Compares your first month with the latest once there are two.</div>}
        </div>
      </div>
    </Card>
  );
}

function Tile({ value, unit, label, sub }: { value: ReactNode; unit?: string; label: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="num text-[24px] font-semibold leading-none text-bone">{value}{unit && <span className="ml-1 text-[12px] font-normal text-mute">{unit}</span>}</div>
      <div className="mt-1.5 break-words text-[12px] leading-snug text-mute">{label}</div>
      {sub && <div className="text-[11.5px] text-faint">{sub}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────── manage ──
const AUTO_OPTIONS: { value: PowerAuto | ""; label: string }[] = [
  { value: "", label: "None — I tick it myself" },
  { value: "food", label: "Meal logs" },
  { value: "workouts", label: "Workouts logged" },
  { value: "shorts", label: "Short videos completed" },
  { value: "longs", label: "Long videos completed" },
  { value: "reached", label: "New people reached (Traffic)" },
];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysText(days: number[]): string {
  const d = [...days].sort();
  if (d.length === 7) return "Every day";
  if (d.join() === "1,2,3,4,5") return "Weekdays";
  if (d.join() === "0,6") return "Weekends";
  return [...d.filter((x) => x !== 0), ...d.filter((x) => x === 0)].map((x) => DAY_FULL[x]).join(", ");
}

function ManageSheet({ open, start, onClose }: { open: boolean; start: "list" | "new"; onClose: () => void }) {
  const [view, setView] = useState<"list" | "new" | PowerItem>(start);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setView(start);
  }
  const title = view === "list" ? "Edit Power List" : view === "new" ? "Add item" : "Edit item";
  return (
    <Sheet open={open} onClose={onClose} title={title} wide>
      {view === "list" ? <ManageList onEdit={setView} onAdd={() => setView("new")} />
        : <ItemForm initial={view === "new" ? undefined : view} onDone={() => (start === "new" && view === "new" ? onClose() : setView("list"))}
          onCancel={() => (start === "new" && view === "new" ? onClose() : setView("list"))} />}
    </Sheet>
  );
}

function ManageList({ onEdit, onAdd }: { onEdit: (i: PowerItem) => void; onAdd: () => void }) {
  const { data, today, update, remove } = useStore();
  const { confirm, toast } = useFeedback();
  const active = data.powerItems.filter((i) => !i.archived_on || i.archived_on > today).sort((a, b) => a.sort_order - b.sort_order);
  const archived = data.powerItems.filter((i) => i.archived_on && i.archived_on <= today).sort((a, b) => a.sort_order - b.sort_order);
  const fail = (e: unknown) => toast(errorMessage(e), "error");

  const move = async (i: number, dir: -1 | 1) => {
    const order = [...active];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    try {
      // Renumber so equal or gapped sort orders can't fight.
      for (const [k, it] of order.entries()) if (it.sort_order !== k) await update("powerItems", it.id, { sort_order: k });
    } catch (e) {
      fail(e);
    }
  };
  const archive = async (it: PowerItem) => {
    if (!(await confirm({ title: `Archive “${it.name}”?`, body: "It stops being due from today. Every past day keeps its history, so your PCR and streaks don't change.", confirmLabel: "Archive" }))) return;
    update("powerItems", it.id, { archived_on: it.start_date > today ? it.start_date : today }).then(() => toast("Archived. History kept.")).catch(fail);
  };
  const del = async (it: PowerItem) => {
    const n = data.powerLogs.filter((l) => l.item_id === it.id).length;
    if (!(await confirm({
      title: `Delete “${it.name}”?`, destructive: true, confirmLabel: "Delete",
      body: `This removes the item and ${plural(n, "saved log")}. Past PCR is recalculated without it. Archive instead to keep the history.`,
    }))) return;
    remove("powerItems", it.id).then(() => toast("Item deleted.")).catch(fail);
  };

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-hair">
        {active.map((it, i) => (
          <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <div className="min-w-[min(100%,13rem)] flex-1">
              <div className="text-[14.5px] text-bone">{it.name}</div>
              <div className="text-[11.5px] text-faint">
                {it.kind === "count" ? `${it.target} ${it.unit ?? ""}`.trim() : "Check"} · {daysText(it.days)}
                {it.auto ? ` · auto: ${AUTO_OPTIONS.find((o) => o.value === it.auto)?.label.toLowerCase()}` : ""}
                {it.start_date > today ? ` · starts ${fmtShort(it.start_date)}` : ""}
              </div>
            </div>
            <div className="flex items-center">
              <IconButton label={`Move ${it.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-25"><ArrowUp className="h-4 w-4" /></IconButton>
              <IconButton label={`Move ${it.name} down`} disabled={i === active.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-25"><ArrowDown className="h-4 w-4" /></IconButton>
              <Button size="sm" variant="ghost" className="h-10" aria-label={`Edit ${it.name}`} onClick={() => onEdit(it)}>Edit</Button>
              <Button size="sm" variant="ghost" className="h-10" aria-label={`Archive ${it.name}`} onClick={() => archive(it)}>Archive</Button>
              <Button size="sm" variant="ghost" className="h-10 hover:text-alert" aria-label={`Delete ${it.name}`} onClick={() => del(it)}>Delete</Button>
            </div>
          </li>
        ))}
        {!active.length && <li className="py-4 text-[13px] text-faint">No active items. Add one below.</li>}
      </ul>
      <Button icon={<Plus className="h-4 w-4" />} className="w-full" onClick={onAdd}>Add item</Button>
      {archived.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Archived · history kept</div>
          <ul className="divide-y divide-hair">
            {archived.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-mute">{it.name}</div>
                  <div className="text-[11.5px] text-faint">Archived {fmtShort(it.archived_on)}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-10" aria-label={`Restore ${it.name}`}
                  onClick={() => update("powerItems", it.id, { archived_on: null }).then(() => toast("Restored.")).catch(fail)}>Restore</Button>
                <Button size="sm" variant="ghost" className="h-10 hover:text-alert" aria-label={`Delete ${it.name}`} onClick={() => del(it)}>Delete</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ItemForm({ initial, onDone, onCancel }: { initial?: PowerItem; onDone: () => void; onCancel: () => void }) {
  const { data, today, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<PowerItem["kind"]>(initial?.kind ?? "check");
  const [target, setTarget] = useState(initial?.target != null ? String(initial.target) : "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [days, setDays] = useState<number[]>(initial?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [auto, setAuto] = useState<PowerAuto | "">(initial?.auto ?? "");
  const [start, setStart] = useState(initial?.start_date ?? today);

  const save = () => run(async () => {
    if (!name.trim()) throw new Error("Name the item.");
    if (!days.length) throw new Error("Choose at least one day.");
    if (!start) throw new Error("Choose a start date.");
    const t = Number(target);
    if (kind === "count" && (!target.trim() || !Number.isFinite(t) || t < 1)) throw new Error("Set a target of 1 or more (e.g. 6 stories).");
    const row = {
      name: name.trim(), kind, days: [...days].sort(), auto: auto || null, start_date: start,
      target: kind === "count" ? Math.round(t) : null, unit: kind === "count" ? unit.trim() || null : null,
    };
    if (initial) await update("powerItems", initial.id, row);
    else await insert("powerItems", { ...row, archived_on: null, sort_order: data.powerItems.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1 });
    onDone();
    return initial ? "Item updated." : "Item added.";
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Field label="Item"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Read 5 pages" autoFocus={!initial} /></Field>
      <Field group label="Type">
        <Segmented label="Type" value={kind} onChange={setKind} className="w-full"
          options={[{ value: "check", label: "Check off" }, { value: "count", label: "Count to a target" }]} />
      </Field>
      {kind === "count" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target"><NumberInput value={target} onChange={setTarget} step="1" min={1} placeholder="6" /></Field>
          <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="stories" /></Field>
        </div>
      )}
      <Field group label="Due on">
        <DayPicker value={days} onChange={setDays} />
        <div className="mt-1 flex gap-1 text-[12px]">
          <button type="button" className="link h-9 px-1" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
          <button type="button" className="link h-9 px-1" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
          <button type="button" className="link h-9 px-1" onClick={() => setDays([0, 6])}>Weekends</button>
        </div>
      </Field>
      <Field label="Automatic progress" hint="Counts records you log elsewhere. You can still tick it or add to it by hand.">
        <Select value={auto} onChange={(e) => setAuto(e.target.value as PowerAuto | "")}>
          {AUTO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Counts from" hint="Days before this aren't scored for this item.">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" busy={busy} className="flex-[2]">{initial ? "Save item" : "Add item"}</Button>
      </div>
    </form>
  );
}
