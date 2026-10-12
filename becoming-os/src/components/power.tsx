// Shared Power List components: the "why" banner, PCR badges, the day
// checklist rows, the green/red calendar, the PCR trend chart and the in-page
// green/perfect day moment. Every number is recomputed from saved records by
// the Power List engine (src/lib/calc/power.ts).
import { ArrowRight, Check, ChevronLeft, ChevronRight, Flame, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/data/store";
import {
  dayResult, dayStatus, firstStart, GREEN_AT, greenStreak, indexPower, periodResult, rating, settingsOf, standardPowerList,
  type DayResult, type DayStatus, type ItemState, type PowerIndex, type RatingKey,
} from "@/lib/calc/power";
import { addMonths, dateRange, diffDays, dow, fmtLongDate, fmtMonth, fmtShort, monthEnd, monthStart } from "@/lib/dates";
import { errorMessage, plural } from "@/lib/format";
import type { ISODate, PowerItem } from "@/lib/types";
import { GOLD } from "./charts";
import { useFeedback } from "./feedback";
import { Button, Card, cx, Eyebrow, IconButton, Ring } from "./ui";

// ─────────────────────────────────────────────────────────────── helpers ──
/** The Power List index, rebuilt only when records change. */
export function usePowerIndex(): PowerIndex {
  const { data } = useStore();
  return useMemo(() => indexPower(data), [data]);
}

export function usePrefersReducedMotion(): boolean {
  const q = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n)}%`);

/** How many more completions turn the day green (0 once it is). */
export function toGreen(r: Pick<DayResult, "due" | "done">): number {
  return Math.max(0, Math.ceil((r.due * GREEN_AT) / 100) - r.done);
}

/** One plain line about where a day stands. */
export function dayStatusLine(r: DayResult, today: ISODate): string {
  if (!r.due) return r.date > today ? "Nothing scheduled yet." : "Nothing was due on this day.";
  if (r.date > today) return `${plural(r.due, "item")} due.`;
  const isToday = r.date === today;
  if (r.done === r.due) return isToday ? "Perfect day. Every item complete." : "Perfect day. Every item was completed.";
  const need = toGreen(r);
  if (!need) return `${isToday ? "Green day locked in." : "Green day."} ${plural(r.due - r.done, "item")} left for a perfect day.`;
  return isToday ? `${need} more to make today green.` : `Red day: ${r.done} of ${r.due}. ${need} more turns it green.`;
}

const RATING_TONE: Record<RatingKey, string> = {
  exceptional: "border-gold bg-gold text-ink",
  great: "border-gold/50 bg-gold-wash text-gold",
  good: "border-[#6fbf8a]/45 bg-[#6fbf8a]/10 text-[#6fbf8a]",
  below: "border-alert/45 bg-alert/10 text-alert",
};

/** "88% · Great", coloured by rating; "—" when nothing was due. */
export function PcrBadge({ pct, size = "md", className }: { pct: number | null; size?: "sm" | "md"; className?: string }) {
  const base = cx("num inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold",
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12.5px]", className);
  if (pct === null || !Number.isFinite(pct)) return <span className={cx(base, "border-line text-faint")}>—</span>;
  const r = rating(pct);
  return <span className={cx(base, RATING_TONE[r.key])}>{pctText(pct)} · {r.key === "below" ? "Below" : r.label}</span>;
}

/** The rating scale, with the current rating highlighted. */
export function RatingScale({ pct }: { pct: number | null }) {
  const current = pct === null ? null : rating(pct).key;
  const steps: { key: RatingKey; label: string; at: string }[] = [
    { key: "below", label: "Below", at: "<75" },
    { key: "good", label: "Good", at: "75" },
    { key: "great", label: "Great", at: "80" },
    { key: "exceptional", label: "Exceptional", at: "90" },
  ];
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Rating scale">
      {steps.map((s) => (
        <li key={s.key} aria-current={current === s.key ? "true" : undefined}
          className={cx("rounded-lg border px-0.5 py-1.5 text-center", current === s.key ? RATING_TONE[s.key] : "border-hair text-faint")}>
          <div className="num text-[12px] font-semibold">{s.at}%</div>
          <div className="truncate text-[10px] sm:text-[10.5px]">{s.label}</div>
        </li>
      ))}
    </ol>
  );
}

export function StreakFlame({ current, best, className }: { current: number; best?: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", current ? "text-gold" : "text-faint", className)}>
      <Flame className="h-4 w-4" aria-hidden />
      <span className="num font-semibold">{current}</span>
      <span className={current ? "text-mute" : ""}>day green streak{best !== undefined ? ` · best ${best}` : ""}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────── why banner ──
const dayNumber = (d: ISODate) => diffDays("2026-01-01", d);

/** A constant reminder of why: rotates through your reasons and identity line. */
export function WhyBanner({ compact }: { compact?: boolean }) {
  const { data, today } = useStore();
  const s = settingsOf(data);
  const lines = useMemo(() => {
    const out = s.reasons.filter((r) => r.trim()).map((r) => ({ eyebrow: "Why you're doing this", text: r.trim() }));
    if (s.identity?.trim()) out.push({ eyebrow: "Who you're becoming", text: s.identity.trim() });
    return out;
  }, [s.reasons, s.identity]);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduced || !visible || paused || lines.length < 2) return;
    const t = setInterval(() => { if (!document.hidden) setOffset((o) => o + 1); }, 8000);
    return () => clearInterval(t);
  }, [reduced, visible, paused, lines.length]);

  if (!lines.length) {
    return (
      <Link to="/settings#power" className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-dashed border-gold/40 px-4 py-3 text-[13px] text-mute hover:border-gold">
        <span>Write down why you're doing this. It will be shown here every day.</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-gold" aria-hidden />
      </Link>
    );
  }
  const i = (((dayNumber(today) + offset) % lines.length) + lines.length) % lines.length;
  const line = lines[i];
  const next = lines.length > 1 && (
    <IconButton label="Next reason" onClick={() => setOffset((o) => o + 1)} className="shrink-0 text-gold/80 hover:text-gold">
      <ChevronRight className="h-4 w-4" />
    </IconButton>
  );

  if (compact) {
    return (
      <div ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        className="flex min-w-0 items-center gap-2 rounded-2xl border border-gold/25 bg-gold-wash py-1 pl-4 pr-1">
        <Link to="/settings#power" className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-[13px]"
          aria-label={`${line.eyebrow}: ${line.text}. Edit your reasons`}>
          <span className="eyebrow shrink-0 text-gold">{line.eyebrow === "Who you're becoming" ? "Becoming" : "Why"}</span>
          <span key={`${i}-${offset}`} className="min-w-0 animate-fade truncate text-bone">{line.text}</span>
        </Link>
        {next}
      </div>
    );
  }
  return (
    <section ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      className="relative overflow-hidden rounded-3xl border border-gold/25 bg-panel px-5 py-5 sm:px-7" aria-label="Why you're doing this">
      <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-gold/10 blur-3xl" aria-hidden />
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1.5 text-gold">{line.eyebrow}</Eyebrow>
          <p key={`${i}-${offset}`} className="animate-fade break-words font-display text-[26px] leading-[1.08] text-bone sm:text-[30px]">{line.text}</p>
        </div>
        {next}
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-3">
        {lines.length > 1 ? (
          <div className="flex gap-1.5" aria-hidden>
            {lines.map((_, j) => <span key={j} className={cx("h-1.5 rounded-full transition-all", j === i ? "w-5 bg-gold" : "w-1.5 bg-line")} />)}
          </div>
        ) : <span />}
        <Link to="/settings#power" className="inline-flex h-10 items-center text-[12.5px] text-mute hover:text-gold">Edit reasons</Link>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────── green / perfect moment ──
const celebrated = new Set<string>();

// Keyframes for the moment, kept with the component that uses them.
const BURST_CSS = `
@keyframes pl-burst {
  0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(.3); opacity: 0; }
}
@keyframes pl-moment {
  0% { opacity: 0; transform: translateY(10px) scale(.96); }
  14% { opacity: 1; transform: none; }
  80% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-6px); }
}`;

function Burst({ kind, title, sub }: { kind: "green" | "perfect"; title: string; sub: string }) {
  const bits = useMemo(() => Array.from({ length: kind === "perfect" ? 42 : 28 }, (_, i) => {
    const a = (i / (kind === "perfect" ? 42 : 28)) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 110 + Math.random() * (kind === "perfect" ? 170 : 120);
    return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, size: 4 + Math.random() * 5, dur: 0.9 + Math.random() * 0.6, delay: Math.random() * 0.15, hue: i % 3 };
  }), [kind]);
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center" aria-hidden>
      <style>{BURST_CSS}</style>
      <div className="relative">
        {bits.map((b, i) => (
          <span key={i} className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              animation: `pl-burst ${b.dur}s cubic-bezier(.15,.7,.3,1) ${b.delay}s both`,
              width: b.size, height: b.size,
              background: b.hue === 0 ? "var(--gold)" : b.hue === 1 ? "var(--gold-hi)" : "var(--gold-dim)",
              ["--dx" as string]: `${b.dx}px`, ["--dy" as string]: `${b.dy}px`,
            }} />
        ))}
        <div style={{ animation: "pl-moment 2.4s ease both" }} className="rounded-3xl border border-gold/40 bg-panel/95 px-8 py-6 text-center shadow-2xl shadow-black/70">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-gold/60 text-gold">
            {kind === "perfect" ? <Flame className="h-5 w-5" /> : <Check className="h-5 w-5" />}
          </div>
          <div className="font-display text-[34px] leading-none text-bone">{title}</div>
          <div className="mt-2 text-[13px] text-gold">{sub}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Marks the moment a day turns green (75%) or perfect (100%) from your own
 * ticks: a toast, plus a gold burst unless reduced motion is on. Render the
 * returned node anywhere. Each date celebrates each level once per session.
 */
export function useDayCelebration(r: DayResult | null): ReactNode {
  const { today } = useStore();
  const { toast } = useFeedback();
  const reduced = usePrefersReducedMotion();
  const prev = useRef<{ date: ISODate; pct: number | null; done: number } | null>(null);
  const [burst, setBurst] = useState<{ kind: "green" | "perfect"; title: string; sub: string; id: number } | null>(null);
  const date = r?.date ?? null, pct = r?.pct ?? null, done = r?.done ?? 0, due = r?.due ?? 0;

  useEffect(() => {
    if (date === null) return;
    const p = prev.current;
    prev.current = { date, pct, done };
    if (!p || p.date !== date || p.pct === null || pct === null || done <= p.done || date > today) return;
    const kind = pct >= 100 && p.pct < 100 ? "perfect" : pct >= GREEN_AT && p.pct < GREEN_AT ? "green" : null;
    if (!kind) return;
    const key = `${date}:${kind}`;
    if (celebrated.has(key)) return;
    celebrated.add(key);
    const isToday = date === today;
    const xp = kind === "perfect" ? "+50 XP" : "+25 XP";
    const title = kind === "perfect" ? "Perfect day" : "Green day";
    const sub = kind === "perfect" ? `Every item complete · ${xp}` : `${done} of ${due} complete · ${xp}`;
    toast(isToday
      ? (kind === "perfect" ? `Perfect day. All ${due} items complete. ${xp}.` : `Green day locked in: ${done} of ${due} complete. ${xp}.`)
      : `${fmtShort(date)} is now a ${kind === "perfect" ? "perfect" : "green"} day. ${xp}.`);
    if (reduced) return;
    const id = Date.now();
    setBurst({ kind, title, sub, id });
    const t = setTimeout(() => setBurst((b) => (b?.id === id ? null : b)), 2500);
    return () => clearTimeout(t);
  }, [date, pct, done, due, today, reduced, toast]);

  return burst ? <Burst key={burst.id} kind={burst.kind} title={burst.title} sub={burst.sub} /> : null;
}

// ──────────────────────────────────────────────────────── checklist rows ──
/** Where an automatic item's progress came from, in words. */
export function autoLine(s: ItemState): string | null {
  const n = s.auto ?? 0;
  switch (s.item.auto) {
    case "workouts": return `${plural(n, "workout")} logged`;
    case "food": return n ? "Meals logged for this day" : "No meals logged yet";
    case "shorts": return `${plural(n, "short-form video")} completed in Content`;
    case "longs": return `${plural(n, "long-form video")} completed in Content`;
    case "reached": return `${plural(n, "new person", "new people")} logged in Traffic`;
    default: return null;
  }
}

function useLogSaver(item: PowerItem, date: ISODate) {
  const { upsert } = useStore();
  const { toast } = useFeedback();
  return (value: number | null, done: boolean) =>
    upsert("powerLogs", { item_id: item.id, log_date: date, value, done }, "item_id,log_date").catch((e) => toast(errorMessage(e), "error"));
}

const unitOf = (s: ItemState) => s.item.unit?.trim() || "";

/**
 * One item on a day's Power List. Check items toggle; counted items take a
 * stepper, a typed amount, or "Done" (sets the target). Automatic items show
 * where their progress came from and can still be added to by hand.
 */
export function PowerItemRow({ s, date, compact }: { s: ItemState; date: ISODate; compact?: boolean }) {
  const { toast } = useFeedback();
  const save = useLogSaver(s.item, date);
  const auto = s.auto ?? 0;
  const src = autoLine(s);
  const count = s.item.kind === "count";
  const manual = s.log?.value ?? 0;
  const [draft, setDraft] = useState(String(s.value));
  useEffect(() => setDraft(String(s.value)), [s.value]);

  const setValue = (n: number) => {
    const v = Math.max(0, Math.min(100000, Math.round(n)));
    save(v, v >= s.target);
  };
  const toggle = () => {
    if (!count) {
      if (s.done && !s.log?.done && auto >= 1) return toast(`Completed automatically: ${src?.toLowerCase()}.`, "info");
      return save(null, !s.log?.done);
    }
    if (!s.done) return setValue(s.target);
    if (auto >= s.target) return toast(`Completed automatically: ${src?.toLowerCase()}.`, "info");
    setValue(auto > 0 ? auto : 0);
  };
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n < 0) return setDraft(String(s.value));
    if (Math.round(n) !== s.value) setValue(n);
  };
  const unit = unitOf(s);
  const minusDisabled = s.value <= 0 || (s.value <= auto && manual <= auto);
  const label = count ? `${s.item.name}: ${s.value} of ${s.target}${unit ? ` ${unit}` : ""}` : s.item.name;

  const check = (
    <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition",
      s.done ? "border-gold bg-gold text-ink" : "border-line")} aria-hidden>
      {s.done && <Check className="h-4 w-4" strokeWidth={2.5} />}
    </span>
  );
  const name = (
    <span className="min-w-0 flex-1">
      <span className={cx("block break-words text-[14.5px] leading-snug", s.done ? "text-mute line-through decoration-faint" : "text-bone")}>{s.item.name}</span>
      {(src || (count && !compact)) && (
        <span className="mt-0.5 block text-[11.5px] text-faint">
          {count && !compact && <span className="num">{s.value}/{s.target}{unit ? ` ${unit}` : ""}</span>}
          {count && !compact && src && " · "}
          {src}
        </span>
      )}
    </span>
  );

  if (compact) {
    return (
      <li className="flex items-center gap-2 py-1.5">
        <button type="button" onClick={toggle} aria-pressed={s.done} aria-label={count ? `${label}. ${s.done ? "Completed" : "Complete to target"}` : label}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left">
          {check}{name}
        </button>
        {count && (
          <div className="flex shrink-0 items-center rounded-xl border border-line bg-raised">
            <button type="button" aria-label={`Decrease ${s.item.name}`} disabled={minusDisabled} onClick={() => setValue(s.value - 1)}
              className="flex h-10 w-9 items-center justify-center text-mute hover:text-bone disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
            <span className="num min-w-[44px] text-center text-[12.5px] font-semibold text-bone">{s.value}/{s.target}</span>
            <button type="button" aria-label={`Increase ${s.item.name}`} onClick={() => setValue(s.value + 1)}
              className="flex h-10 w-9 items-center justify-center text-gold hover:text-gold-hi"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={toggle} aria-pressed={s.done} aria-label={count ? `${label}. ${s.done ? "Completed" : "Complete to target"}` : label}
          className="flex min-h-[44px] min-w-[min(100%,14rem)] flex-1 items-center gap-3 text-left">
          {check}{name}
        </button>
        {count && (
          <div className="ml-10 flex items-center gap-2 sm:ml-0">
            <div className="flex items-center rounded-xl border border-line bg-raised">
              <button type="button" aria-label={`Decrease ${s.item.name}`} disabled={minusDisabled} onClick={() => setValue(s.value - 1)}
                className="flex h-10 w-10 items-center justify-center text-mute hover:text-bone disabled:opacity-30"><Minus className="h-4 w-4" /></button>
              <input inputMode="numeric" aria-label={`${s.item.name} amount${unit ? ` in ${unit}` : ""}`} value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="num h-10 w-12 bg-transparent text-center text-[15px] font-semibold text-bone outline-none" />
              <button type="button" aria-label={`Increase ${s.item.name}`} onClick={() => setValue(s.value + 1)}
                className="flex h-10 w-10 items-center justify-center text-gold hover:text-gold-hi"><Plus className="h-4 w-4" /></button>
            </div>
            <Button size="sm" variant={s.done ? "ghost" : "secondary"} className="h-10 min-w-[64px]" disabled={s.done}
              aria-label={`Mark ${s.item.name} done (${s.target}${unit ? ` ${unit}` : ""})`} onClick={() => setValue(s.target)}>
              Done
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────── today card ──
/** Compact Power List for the Today page. */
export function PowerTodayCard() {
  const { data, today, insert } = useStore();
  const { toast } = useFeedback();
  const idx = usePowerIndex();
  const [busy, setBusy] = useState(false);
  const r = useMemo(() => dayResult(data.powerItems, today, idx), [data.powerItems, today, idx]);
  const streak = useMemo(() => greenStreak(data.powerItems, idx, today), [data.powerItems, idx, today]);
  const moment = useDayCelebration(r);

  if (!data.powerItems.length) {
    const setup = async () => {
      setBusy(true);
      try {
        await insert("powerItems", standardPowerList(today) as unknown as Record<string, unknown>[]);
        toast("Standard Power List added. It counts from today.");
      } catch (e) {
        toast(errorMessage(e), "error");
      } finally {
        setBusy(false);
      }
    };
    return (
      <Card className="p-6">
        <Eyebrow className="mb-1 text-gold">Power List</Eyebrow>
        <h2 className="text-[28px] leading-none">Today's standard</h2>
        <p className="mt-2 text-[13px] text-mute">The non-negotiables you complete every day. A day is green at {GREEN_AT}% or more.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button busy={busy} onClick={setup}>Use my standard list</Button>
          <Link to="/power" className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] text-mute hover:bg-raised hover:text-bone">Build my own</Link>
        </div>
      </Card>
    );
  }

  const status = dayStatus(r, today);
  return (
    <Card className="p-6">
      {moment}
      <div className="flex items-start gap-5">
        <Ring value={r.done} max={r.due || 1} size={92}>
          <span className="num text-[22px] font-semibold">{pctText(r.pct ?? 0)}</span>
          <span className="num text-[10px] text-mute">{r.done}/{r.due}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1 text-gold">Power List</Eyebrow>
          <h2 className="text-[28px] leading-none">Today</h2>
          <p className={cx("mt-1.5 text-[12.5px]", status === "green" ? "text-[#6fbf8a]" : "text-mute")}>{dayStatusLine(r, today)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.pct !== null && <PcrBadge pct={r.pct} size="sm" />}
            <StreakFlame current={streak.current} />
          </div>
        </div>
      </div>
      {r.due ? (
        <ul className="mt-4 divide-y divide-hair">
          {r.items.map((s) => <PowerItemRow key={s.item.id} s={s} date={today} compact />)}
        </ul>
      ) : <p className="mt-4 text-[13px] text-faint">Nothing on the list is due today.</p>}
      <Link to="/power" className="mt-3 inline-flex h-10 items-center gap-1.5 text-[13px] text-mute hover:text-gold">
        Open Power List <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── calendar ──
const STATUS_WORD: Record<DayStatus, string> = {
  green: "green day", red: "red day", "in-progress": "in progress", future: "upcoming", none: "nothing due",
};
const CELL: Record<DayStatus, string> = {
  green: "border-[#6fbf8a]/50 bg-[#6fbf8a]/15 text-bone",
  red: "border-alert/45 bg-alert/10 text-bone",
  "in-progress": "border-dashed border-gold/70 bg-gold-wash text-bone",
  future: "border-hair text-faint/70",
  none: "border-hair text-faint",
};
const PCT_TONE: Record<DayStatus, string> = { green: "text-[#6fbf8a]", red: "text-alert", "in-progress": "text-gold", future: "", none: "" };

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-mute">
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-[#6fbf8a]/50 bg-[#6fbf8a]/30" />{GREEN_AT}% or more</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-alert/50 bg-alert/25" />Under {GREEN_AT}%</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-gold/70" />Today, in progress</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line" />Nothing due</li>
    </ul>
  );
}

/** Month grid, Monday first: green at 75%+, red under 75% once the day is over. */
export function PowerCalendar({ month, selected, onSelect, onMonthChange }: {
  month: ISODate; selected?: ISODate; onSelect?: (d: ISODate) => void; onMonthChange?: (m: ISODate) => void;
}) {
  const { data, today } = useStore();
  const idx = usePowerIndex();
  const items = data.powerItems;
  const m0 = monthStart(month);
  const end = monthEnd(m0);
  const days = useMemo(() => dateRange(m0, end).map((d) => dayResult(items, d, idx)), [m0, end, items, idx]);
  const summary = useMemo(() => periodResult(items, m0, end, idx, today), [items, m0, end, idx, today]);
  const lead = (dow(m0) + 6) % 7;
  const start = firstStart(items);
  const earliest = monthStart(start && start < today ? start : today);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {onMonthChange && (
          <IconButton label="Previous month" disabled={m0 <= earliest} onClick={() => onMonthChange(addMonths(m0, -1))}
            className="disabled:pointer-events-none disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></IconButton>
        )}
        <div className="min-w-0 flex-1 text-center">
          <div className="font-display text-[22px] leading-none text-bone">{fmtMonth(m0)}</div>
          <div className="num mt-1 text-[11.5px] text-mute">
            {summary.pct === null ? "Nothing due" : `${pctText(summary.pct)} PCR · ${summary.greenDays} green · ${summary.redDays} red`}
          </div>
        </div>
        {onMonthChange && (
          <IconButton label="Next month" disabled={m0 >= monthStart(today)} onClick={() => onMonthChange(addMonths(m0, 1))}
            className="disabled:pointer-events-none disabled:opacity-30"><ChevronRight className="h-5 w-5" /></IconButton>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="group" aria-label={`Power List calendar, ${fmtMonth(m0)}`}>
          {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
            <div key={i} aria-hidden className="pb-1 text-center text-[10.5px] font-semibold uppercase tracking-wider text-faint">{l}</div>
          ))}
          {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} aria-hidden />)}
          {days.map((r) => {
            const st = dayStatus(r, today);
            const n = Number(r.date.slice(8, 10));
            const aria = `${fmtLongDate(r.date)}: ${r.pct === null || st === "future" ? STATUS_WORD[st] : `${pctText(r.pct)} PCR, ${r.done} of ${r.due} items, ${STATUS_WORD[st]}`}${r.date === today ? ", today" : ""}`;
            const body = (
              <>
                <span className={cx("num text-[12.5px] font-semibold leading-none", r.date === today && "text-gold")}>{n}</span>
                {r.pct !== null && st !== "future" && <span className={cx("num text-[9.5px] leading-none sm:text-[10.5px]", PCT_TONE[st])}>{Math.round(r.pct)}%</span>}
              </>
            );
            const cls = cx("flex h-11 flex-col items-center justify-center gap-1 rounded-lg border transition sm:h-14",
              CELL[st], selected === r.date && "ring-2 ring-bone ring-offset-1 ring-offset-panel");
            const clickable = onSelect && r.date <= today;
            return (
              clickable ? (
                <button key={r.date} type="button" className={cx(cls, "w-full hover:border-bone/50")} aria-label={aria}
                  aria-current={selected === r.date ? "date" : undefined} onClick={() => onSelect(r.date)}>{body}</button>
              ) : <div key={r.date} className={cls} role="img" aria-label={aria}>{body}</div>
            );
          })}
      </div>
      <div className="mt-3"><CalendarLegend /></div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── trend chart ──
interface TrendPoint { x: string; pct: number; label: string }

function TrendTip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-raised px-3 py-2 text-[12px] shadow-xl shadow-black/50">
      <div className="mb-1 text-mute">{p.label}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: GOLD }} />
        <span className="text-mute">PCR</span>
        <span className="num ml-auto pl-3 font-semibold text-bone">{p.pct}% · {rating(p.pct).label}</span>
      </div>
    </div>
  );
}

/** PCR per week or month as bars, with the 75 / 80 / 90 lines. */
export function PcrTrendChart({ points, height = 220, tick }: { points: TrendPoint[]; height?: number; tick: (x: string) => string }) {
  const min = points.reduce((m, p) => Math.min(m, p.pct), 100);
  const lower = Math.max(0, Math.min(50, Math.floor((min - 5) / 10) * 10));
  const axis = { stroke: "#2a2a2f", tick: { fill: "#8a8990", fontSize: 11 }, tickLine: false, axisLine: false };
  // 80 sits too close to 75 to carry its own label; the caption under the chart names all three.
  const refs: { y: number; label?: string; position?: "insideTopRight" | "insideBottomRight" }[] = [
    { y: 90, label: "90", position: "insideTopRight" },
    { y: 80 },
    { y: 75, label: "75", position: "insideBottomRight" },
  ];
  return (
    <div className="w-full" role="img"
      aria-label={`PCR by period: ${points.map((p) => `${p.label} ${p.pct}%`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke="#1d1d21" vertical={false} />
          <XAxis dataKey="x" {...axis} tickFormatter={tick} minTickGap={16} />
          <YAxis {...axis} width={40} domain={[lower, 100]} ticks={[lower, ...[25, 50, 75, 100].filter((t) => t > lower)]} tickFormatter={(v) => `${v}%`} allowDataOverflow />
          <Tooltip content={<TrendTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          {refs.map((r) => (
            <ReferenceLine key={r.y} y={r.y} stroke={r.y === 75 ? "#5c5c64" : "#3d3d44"} strokeWidth={1} strokeDasharray={r.y === 75 ? undefined : "3 3"}
              label={r.label ? { value: r.label, position: r.position, fill: "#8a8990", fontSize: 10.5 } : undefined} />
          ))}
          <Bar dataKey="pct" name="PCR" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mute" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-[#5c5c64]" />75 Good</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-[#5c5c64]" />80 Great · 90 Exceptional</span>
      </div>
    </div>
  );
}

/** A day as a small coloured dot (history sheets). */
export function DayDot({ r, today }: { r: DayResult; today: ISODate }) {
  const st = dayStatus(r, today);
  const tone = st === "green" ? "bg-[#6fbf8a]/80 text-ink" : st === "red" ? "bg-alert/70 text-ink" : st === "in-progress" ? "border border-dashed border-gold text-gold" : "border border-line text-faint";
  return (
    <span role="img" aria-label={`${fmtLongDate(r.date)}: ${r.pct === null ? STATUS_WORD[st] : `${pctText(r.pct)} PCR, ${STATUS_WORD[st]}`}`}
      title={`${fmtShort(r.date)} · ${r.pct === null ? STATUS_WORD[st] : pctText(r.pct)}`}
      className={cx("num flex h-7 w-7 items-center justify-center rounded-full text-[10.5px] font-semibold", tone)}>
      {Number(r.date.slice(8, 10))}
    </span>
  );
}
