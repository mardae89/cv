// The content workflow shared by the Content page and the Today card: today's
// filming focus, today's slate of ideas, check-off, slate filling, loading the
// idea library, and the idea form. Every number is recomputed from saved ideas.
import { Check, Library, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/data/store";
import { indexPower, isDue, itemState, settingsOf, weekOf } from "@/lib/calc/power";
import { CONTENT_PACK } from "@/lib/contentPack";
import { addDays, dow, fmtShort, fmtWeekday } from "@/lib/dates";
import { errorMessage, plural } from "@/lib/format";
import type { ContentFormat, ContentIdea, FunnelStage, ISODate, PowerItem } from "@/lib/types";
import { useFeedback } from "./feedback";
import { useSubmit } from "./forms/body";
import { Button, Card, cx, Eyebrow, Field, Input, Meter, Pill, Segmented, Select, Textarea, Toggle } from "./ui";

export const FUNNEL_LABEL: Record<FunnelStage, string> = {
  top: "Top of funnel",
  middle: "Middle of funnel",
  bottom: "Bottom of funnel",
};
export const FUNNEL_ORDER: Record<FunnelStage, number> = { top: 0, middle: 1, bottom: 2 };
export const FORMAT_LABEL: Record<ContentFormat, string> = { short: "Short form", long: "Long form" };
export const DEFAULT_SECTION = "My ideas";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// ───────────────────────────────────────────────────────── production ──
/** A Power List item about filming or editing ("Film short-form", "Edit for 90 minutes"). */
export const isProductionItem = (i: PowerItem) => /^(film|edit)\b/i.test(i.name.trim());

/** Filming and editing items due on a date, in list order. */
export function productionDue(items: PowerItem[], date: ISODate): PowerItem[] {
  return items.filter((i) => isProductionItem(i) && isDue(i, date)).sort((a, b) => a.sort_order - b.sort_order);
}

/** Target line pieces: "2 short-form a day", "4 long-form a week", "6 stories a day" (stories only if on the Power List). */
export function useTargets() {
  const { data, today } = useStore();
  const settings = settingsOf(data);
  const stories = data.powerItems.find((i) => /stor(y|ies)/i.test(i.name) && i.kind === "count" && i.target && !(i.archived_on && i.archived_on <= today));
  const parts = [`${settings.shorts_per_day} short-form a day`, `${settings.longs_per_week} long-form a week`];
  if (stories) parts.push(`${stories.target} ${stories.unit || "stories"} a ${stories.days.length === 7 ? "day" : "scheduled day"}`);
  return { settings, line: parts.join(" · ") };
}

// ───────────────────────────────────────────────────────────── state ──
export interface ContentDay {
  /** Ideas planned for today, or completed today. */
  slate: ContentIdea[];
  /** Open ideas planned for an earlier day. */
  carried: ContentIdea[];
  shortsToday: number;
  longsWeek: number;
  shortTarget: number;
  longTarget: number;
  week: { from: ISODate; to: ISODate };
}

const bySlateOrder = (a: ContentIdea, b: ContentIdea) =>
  (a.format === b.format ? 0 : a.format === "short" ? -1 : 1) || a.num - b.num;

export function contentDay(ideas: ContentIdea[], today: ISODate, shortTarget: number, longTarget: number): ContentDay {
  const week = weekOf(today);
  const doneOn = (c: ContentIdea) => (c.status === "done" ? c.completed_on : null);
  return {
    slate: ideas.filter((c) => c.planned_for === today || doneOn(c) === today).sort(bySlateOrder),
    carried: ideas.filter((c) => c.status === "open" && c.planned_for && c.planned_for < today)
      .sort((a, b) => (a.planned_for! < b.planned_for! ? -1 : a.planned_for! > b.planned_for! ? 1 : a.num - b.num)),
    shortsToday: ideas.filter((c) => c.format === "short" && doneOn(c) === today).length,
    longsWeek: ideas.filter((c) => { const d = doneOn(c); return c.format === "long" && !!d && d >= week.from && d <= week.to; }).length,
    shortTarget,
    longTarget,
    week,
  };
}

export function useContentDay(): ContentDay {
  const { data, today } = useStore();
  const s = settingsOf(data);
  return contentDay(data.contentIdeas, today, s.shorts_per_day, s.longs_per_week);
}

// ─────────────────────────────────────────────────────────── actions ──
export function useContentActions() {
  const { data, today, update, insert, remove } = useStore();
  const { toast, confirm } = useFeedback();
  const settings = settingsOf(data);
  const fail = (e: unknown) => toast(errorMessage(e), "error");

  const setDone = async (c: ContentIdea, done: boolean) => {
    const before = contentDay(data.contentIdeas, today, settings.shorts_per_day, settings.longs_per_week);
    try {
      await update("contentIdeas", c.id, done ? { status: "done", completed_on: today } : { status: "open", completed_on: null });
    } catch (e) {
      return fail(e);
    }
    if (!done) return;
    if (c.format === "short" && settings.shorts_per_day > 0 && before.shortsToday + 1 === settings.shorts_per_day) {
      toast(`Short-form target met: ${settings.shorts_per_day} of ${settings.shorts_per_day} today.`);
    } else if (c.format === "long" && settings.longs_per_week > 0 && before.longsWeek + 1 === settings.longs_per_week) {
      toast(`Long-form target met for the week: ${settings.longs_per_week} of ${settings.longs_per_week}.`);
    }
  };

  const setPlanned = async (c: ContentIdea, planned: boolean) => {
    try {
      await update("contentIdeas", c.id, { planned_for: planned ? today : null });
      toast(planned ? `Added #${c.num} to today's slate.` : `Removed #${c.num} from today.`, planned ? "success" : "info");
    } catch (e) {
      fail(e);
    }
  };

  /** Plans enough open ideas to meet today's short-form target, plus one long-form idea if the week needs it. */
  const fillSlate = async () => {
    const ideas = data.contentIdeas;
    const week = weekOf(today);
    const onSlate = (c: ContentIdea) =>
      (c.status === "done" && c.completed_on === today) || (c.status === "open" && !!c.planned_for && c.planned_for <= today);
    const shortsOnSlate = ideas.filter((c) => c.format === "short" && onSlate(c)).length;
    const pool = ideas.filter((c) => c.status === "open" && !c.planned_for)
      .sort((a, b) => Number(b.priority) - Number(a.priority) || a.num - b.num);
    const shorts = pool.filter((c) => c.format === "short").slice(0, Math.max(0, settings.shorts_per_day - shortsOnSlate));
    const longsDone = ideas.filter((c) => c.format === "long" && c.status === "done" && c.completed_on && c.completed_on >= week.from && c.completed_on <= week.to).length;
    const longsPlanned = ideas.filter((c) => c.format === "long" && c.status === "open" && c.planned_for && c.planned_for <= week.to).length;
    const longOnSlate = ideas.some((c) => c.format === "long" && onSlate(c));
    const releaseDay = settings.long_release_days.includes(dow(today));
    const long = releaseDay && longsDone + longsPlanned < settings.longs_per_week && !longOnSlate ? pool.find((c) => c.format === "long") : undefined;
    const add = [...shorts, ...(long ? [long] : [])];
    if (!add.length) {
      const needsMore = shortsOnSlate < settings.shorts_per_day || (releaseDay && longsDone + longsPlanned < settings.longs_per_week && !longOnSlate);
      toast(needsMore ? "No open ideas left to add. Add new ideas in the library." : "Today's slate already covers your targets.", "info");
      return;
    }
    for (const c of add) await update("contentIdeas", c.id, { planned_for: today });
    const parts = [
      shorts.length ? `${plural(shorts.length, "short-form idea")}` : "",
      long ? "1 long-form idea" : "",
    ].filter(Boolean);
    toast(`Added ${parts.join(" and ")} to today's slate.`);
  };

  /** Adds your content library, skipping any idea whose title is already saved. */
  const loadPack = async () => {
    const ideas = data.contentIdeas;
    const have = new Set(ideas.map((c) => norm(c.title)));
    const fresh = CONTENT_PACK.filter((p) => !have.has(norm(p.title)));
    if (!fresh.length) {
      toast("Your content ideas are already in the library.", "info");
      return;
    }
    const maxNum = ideas.reduce((m, c) => Math.max(m, c.num), 0);
    await insert("contentIdeas", fresh.map((p, i) => ({
      num: ideas.length ? maxNum + 1 + i : p.num, title: p.title, format: p.format, section: p.section, funnel: p.funnel,
      cta: p.cta, priority: p.priority, status: "open", planned_for: null, completed_on: null, notes: null,
    })));
    const skipped = CONTENT_PACK.length - fresh.length;
    toast(skipped ? `Added ${plural(fresh.length, "idea")}. ${plural(skipped, "was", "were")} already in your library.` : `Loaded ${fresh.length} content ideas.`);
  };

  const deleteIdea = async (c: ContentIdea) => {
    if (!(await confirm({ title: `Delete idea #${c.num}?`, body: c.title, confirmLabel: "Delete", destructive: true }))) return false;
    try {
      await remove("contentIdeas", c.id);
      toast(`Deleted #${c.num}.`);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  return { setDone, setPlanned, fillSlate, loadPack, deleteIdea };
}

// ──────────────────────────────────────────────────────────── pieces ──
/** A 40px tap target around a 24px check box. Done ideas are crossed out by the row. */
export function DoneBox({ idea, onChange }: { idea: ContentIdea; onChange: (done: boolean) => void }) {
  const done = idea.status === "done";
  return (
    <button type="button" role="checkbox" aria-checked={done} aria-label={idea.title} title={done ? "Mark as not done" : "Mark as done"}
      onClick={() => onChange(!done)} className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-raised">
      <span className={cx("flex h-6 w-6 items-center justify-center rounded-md border transition",
        done ? "border-gold bg-gold text-ink" : "border-line")}>{done && <Check className="h-3.5 w-3.5" />}</span>
    </button>
  );
}

export function IdeaChips({ idea, section = true }: { idea: ContentIdea; section?: boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <Pill tone={idea.format === "long" ? "gold" : "neutral"}>{idea.format === "short" ? "Short" : "Long"}</Pill>
      <Pill>{FUNNEL_LABEL[idea.funnel]}</Pill>
      {idea.cta && <Pill tone="calm">CTA</Pill>}
      {idea.priority && <Pill tone="gold">Priority</Pill>}
      {section && <span className="text-[11.5px] text-faint">{idea.section}</span>}
    </div>
  );
}

/** Small row action with a 40px tap height. */
export function RowAction({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx("inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-mute transition hover:bg-raised hover:text-bone", className)} {...rest}>
      {children}
    </button>
  );
}

export function IdeaTitle({ idea, className }: { idea: ContentIdea; className?: string }) {
  const done = idea.status === "done";
  return (
    <div className={cx("break-words text-[14.5px] leading-snug", done ? "text-mute line-through decoration-faint" : "text-bone", className)}>
      <span className="num mr-1.5 text-[12px] text-faint no-underline">#{idea.num}</span>{idea.title}
    </div>
  );
}

// ───────────────────────────────────────────────────────── idea form ──
export function IdeaForm({ initial, onDone }: { initial?: ContentIdea; onDone: () => void }) {
  const { data, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [format, setFormat] = useState<ContentFormat>(initial?.format ?? "short");
  const [funnel, setFunnel] = useState<FunnelStage>(initial?.funnel ?? "top");
  const [cta, setCta] = useState(initial?.cta ?? false);
  const [priority, setPriority] = useState(initial?.priority ?? false);
  const [section, setSection] = useState(initial?.section ?? DEFAULT_SECTION);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const sections = [...new Set(data.contentIdeas.map((c) => c.section))];
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      run(async () => {
        const t = title.trim();
        if (!t) throw new Error("Write the idea first.");
        const dupe = data.contentIdeas.find((c) => c.id !== initial?.id && norm(c.title) === norm(t));
        if (dupe) throw new Error(`That idea is already in the library as #${dupe.num}.`);
        const row = { title: t, format, funnel, cta, priority, section: section.trim() || DEFAULT_SECTION, notes: notes.trim() || null };
        if (initial) await update("contentIdeas", initial.id, row);
        else await insert("contentIdeas", { ...row, num: data.contentIdeas.reduce((m, c) => Math.max(m, c.num), 0) + 1, status: "open" });
        onDone();
        return initial ? "Idea updated." : "Idea added.";
      });
    }}>
      <Field label="Idea"><Textarea value={title} onChange={(e) => setTitle(e.target.value)} maxLength={400} placeholder="What the video shows, in one or two lines" autoFocus={!initial} /></Field>
      <Field group label="Format">
        <Segmented label="Format" className="w-full" value={format} onChange={setFormat}
          options={[{ value: "short", label: "Short form" }, { value: "long", label: "Long form" }]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Funnel stage">
          <Select value={funnel} onChange={(e) => setFunnel(e.target.value as FunnelStage)}>
            {(Object.keys(FUNNEL_LABEL) as FunnelStage[]).map((f) => <option key={f} value={f}>{FUNNEL_LABEL[f]}</option>)}
          </Select>
        </Field>
        <Field label="Section">
          <Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={80} list="content-sections" />
        </Field>
      </div>
      <datalist id="content-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="divide-y divide-hair rounded-xl border border-line px-3.5">
        <Toggle checked={cta} onChange={setCta} label="Call to action" sub="Points viewers to the free group or coaching." />
        <Toggle checked={priority} onChange={setPriority} label="Priority" sub="Filled into today's slate first." />
      </div>
      <Field label="Notes" hint="Optional: hook, shot list, caption.">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </Field>
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save" : "Add idea"}</Button>
    </form>
  );
}

// ─────────────────────────────────────────────────────── focus + week ──
/** Today's filming and editing items from the Power List, with whether each is checked off there. */
export function FilmingFocus({ compact }: { compact?: boolean }) {
  const { data, today } = useStore();
  const due = productionDue(data.powerItems, today);
  if (!due.length) return null;
  const idx = indexPower(data);
  return (
    <ul className={cx("flex flex-wrap gap-2", compact && "gap-1.5")} aria-label="Filming focus today">
      {due.map((i) => {
        const done = itemState(i, today, idx).done;
        return (
          <li key={i.id} className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
            done ? "border-gold/40 bg-gold-wash text-gold" : "border-line text-bone")}>
            {done && <Check className="h-3.5 w-3.5" aria-hidden />}
            {i.name}
            {done && <span className="sr-only">(done)</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Monday to Sunday, with each day's filming and editing items and the videos completed. */
export function ScheduleStrip() {
  const { data, today } = useStore();
  const { from } = weekOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const done = (d: ISODate, f: ContentFormat) => data.contentIdeas.filter((c) => c.status === "done" && c.completed_on === d && c.format === f).length;
  return (
    <ol className="grid gap-1.5 lg:grid-cols-7" aria-label="This week's production schedule">
      {days.map((d) => {
        const items = productionDue(data.powerItems, d);
        const releaseLong = settingsOf(data).long_release_days.includes(dow(d));
        const isToday = d === today;
        const s = done(d, "short"), l = done(d, "long");
        return (
          <li key={d} aria-current={isToday ? "date" : undefined}
            className={cx("flex items-center gap-3 rounded-xl border px-3 py-2 lg:flex-col lg:items-stretch lg:gap-2 lg:py-3",
              isToday ? "border-gold/50 bg-gold-wash" : "border-hair bg-raised/40")}>
            <div className="w-14 shrink-0 lg:w-auto">
              <div className={cx("text-[12px] font-semibold", isToday ? "text-gold" : "text-bone")}>{fmtWeekday(d)}</div>
              <div className="num text-[11px] text-faint">{fmtShort(d)}</div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {releaseLong && <span className="rounded-md border border-gold/40 bg-gold-wash px-1.5 py-0.5 text-[11px] text-gold">Release long-form</span>}
              {items.map((i) => (
                <span key={i.id} className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[11px] text-mute">{i.name}</span>
              ))}
              {!items.length && !releaseLong && <span className="text-[11px] text-faint">{dow(d) === 0 || dow(d) === 6 ? "No filming" : "Nothing scheduled"}</span>}
            </div>
            {d <= today && (s > 0 || l > 0) && (
              <div className="num shrink-0 text-[11px] text-mute lg:mt-auto">{[s && `${s} short`, l && `${l} long`].filter(Boolean).join(" · ")}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Short-form today and long-form this week against your targets. */
export function ContentProgress({ day, className }: { day: ContentDay; className?: string }) {
  return (
    <div className={cx("grid gap-4 sm:grid-cols-2", className)}>
      <Meter label="Short-form today" right={`${day.shortsToday}/${day.shortTarget}`} value={day.shortsToday} max={day.shortTarget || 1}
        sub={day.shortsToday >= day.shortTarget ? "Target met." : `${day.shortTarget - day.shortsToday} to go.`} />
      <Meter label="Long-form this week" right={`${day.longsWeek}/${day.longTarget}`} value={day.longsWeek} max={day.longTarget || 1}
        sub={day.longsWeek >= day.longTarget ? "Target met." : `${day.longTarget - day.longsWeek} to go by ${fmtShort(day.week.to)}.`} />
    </div>
  );
}

// ──────────────────────────────────────────────────────── Today card ──
/** Compact content card for the Today page. */
export function ContentTodayCard() {
  const { data, today } = useStore();
  const day = useContentDay();
  const act = useContentActions();
  const { busy, run } = useSubmit();
  const focus = productionDue(data.powerItems, today);
  const empty = !data.contentIdeas.length;
  const rows = [...day.slate, ...day.carried];

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow className="mb-1 text-gold">Content</Eyebrow>
          <h2 id="content-today-title" className="text-[28px] leading-none">Today's content</h2>
          {focus.length > 0 && <p className="mt-1.5 text-[12.5px] text-mute">{focus.map((i) => i.name).join(" · ")}</p>}
        </div>
        <Link to="/content" className="inline-flex h-10 shrink-0 items-center text-[12.5px] text-mute hover:text-gold">Content Bank →</Link>
      </div>

      {empty ? (
        <div className="mt-5 rounded-xl border border-dashed border-line p-4 text-[13px] text-mute">
          Your idea library is empty. Load your content ideas to plan what to film and post each day.
          <div className="mt-3">
            <Button size="sm" icon={<Library className="h-4 w-4" />} busy={busy} onClick={() => run(act.loadPack)}>Load my content ideas</Button>
          </div>
        </div>
      ) : (
        <>
          <ContentProgress day={day} className="mt-5" />
          {rows.length ? (
            <ul className="mt-4 divide-y divide-hair">
              {rows.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-2.5">
                  <DoneBox idea={c} onChange={(v) => act.setDone(c, v)} />
                  <div className="min-w-0 flex-1">
                    <IdeaTitle idea={c} className="line-clamp-2 text-[13.5px]" />
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Pill tone={c.format === "long" ? "gold" : "neutral"}>{c.format === "short" ? "Short" : "Long"}</Pill>
                      {c.planned_for && c.planned_for < today && c.status === "open" && <span className="text-[11px] text-faint">Carried over from {fmtShort(c.planned_for)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3">
              <span className="text-[13px] text-mute">Nothing planned for today.</span>
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} busy={busy} onClick={() => run(act.fillSlate)}>Fill today's slate</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
