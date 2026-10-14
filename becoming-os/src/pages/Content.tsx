import { CalendarMinus, CalendarPlus, Library, Pencil, Plus, Search, Trash2, Wand2, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "@/components/AppLink";
import {
  DoneBox, FilmingFocus, FORMAT_LABEL, FUNNEL_LABEL, FUNNEL_ORDER, hasProductionSchedule, IdeaChips, IdeaForm, IdeaTitle, Pager, productionFor, RowAction,
  ScheduleStrip, useContentActions, useContentDay, useReleasePlan, useTargets,
} from "@/components/content";
import { useSubmit } from "@/components/forms/body";
import { Button, Card, cx, EmptyState, Eyebrow, Field, IconButton, Input, PageHeader, Pill, Segmented, Select, Sheet, Textarea, Toggle } from "@/components/ui";
import { useStore } from "@/data/store";
import { settingsOf } from "@/lib/calc/power";
import { CONTENT_PACK, SECTION_NOTES, STRATEGY, strategyOf } from "@/lib/contentPack";
import { fmtDays, fmtLongDate, fmtShort, fmtWeekday } from "@/lib/dates";
import { plural } from "@/lib/format";
import type { ContentFormat, ContentIdea, ContentStrategy, FunnelStage, ISODate } from "@/lib/types";

type Tab = "today" | "library" | "strategy";
const PAGE_SIZE = 10;

type SortKey = "list" | "funnel" | "format" | "section" | "completed";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "list", label: "List order" },
  { value: "funnel", label: "Funnel stage" },
  { value: "format", label: "Format" },
  { value: "section", label: "Section" },
  { value: "completed", label: "Recently completed" },
];

interface Filters {
  format: "all" | ContentFormat;
  funnel: "all" | FunnelStage;
  cta: boolean;
  section: string;
  status: "open" | "done" | "all";
  q: string;
  sort: SortKey;
}
const DEFAULT_FILTERS: Filters = { format: "all", funnel: "all", cta: false, section: "", status: "open", q: "", sort: "list" };

/** Priority sections first, then list order: the order ideas are picked in. */
const byPick = (a: ContentIdea, b: ContentIdea) => Number(b.priority) - Number(a.priority) || a.num - b.num;

/** Scrolls an element into view, respecting reduced motion. */
const scrollTo = (el: HTMLElement | null) =>
  el?.scrollIntoView({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

export default function Content() {
  const { data } = useStore();
  const { line } = useTargets();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "library" || raw === "strategy" ? raw : "today";
  const setTab = (v: Tab) => setParams(v === "today" ? {} : { tab: v }, { replace: true });
  const [editing, setEditing] = useState<ContentIdea | "new" | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const count = data.contentIdeas.length;
  const openBank = (patch: Partial<Filters>) => {
    setFilters({ ...DEFAULT_FILTERS, ...patch });
    setPage(1);
    setTab("library");
    window.scrollTo(0, 0);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Production" title="Content Bank" sub={line}
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add idea</Button>} />

      <Segmented label="Content view" value={tab} onChange={setTab}
        options={[
          { value: "today", label: "Today" },
          { value: "library", label: `Bank${count ? ` · ${count}` : ""}` },
          { value: "strategy", label: "Strategy" },
        ]} />

      {tab === "today" && <TodayTab onAddOwn={() => setEditing("new")} onEdit={setEditing} onBank={(format) => openBank({ format })} />}
      {tab === "library" && (
        <LibraryTab filters={filters} setFilters={(f) => { setFilters(f); setPage(1); }} page={page} setPage={setPage}
          onEdit={setEditing} onAddOwn={() => setEditing("new")} />
      )}
      {tab === "strategy" && <StrategyTab onSection={(section) => openBank({ section })} />}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New idea" : editing ? `Edit idea #${editing.num}` : ""}>
        {editing && <IdeaForm initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── empty ──
function EmptyLibrary({ onAddOwn }: { onAddOwn: () => void }) {
  const act = useContentActions();
  const { busy, run } = useSubmit();
  return (
    <EmptyState icon={<Library className="h-7 w-7" />} title="Your Content Bank is empty"
      action={(
        <div className="flex flex-wrap justify-center gap-2">
          <Button busy={busy} icon={<Library className="h-4 w-4" />} onClick={() => run(act.loadPack)}>Load my content ideas ({CONTENT_PACK.length})</Button>
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onAddOwn}>Add my own</Button>
        </div>
      )}>
      Load your two idea lists, merged with repeats removed: short and long form, tagged by funnel stage, section and call to action. Or start with your own.
    </EmptyState>
  );
}

// ───────────────────────────────────────────────────────────── today ──
function TodayTab({ onAddOwn, onEdit, onBank }: { onAddOwn: () => void; onEdit: (c: ContentIdea) => void; onBank: (f: ContentFormat) => void }) {
  const { data, today } = useStore();
  const day = useContentDay();
  const act = useContentActions();
  const { busy, run } = useSubmit();
  const focus = productionFor(data, today);
  const hasProduction = hasProductionSchedule(data, today);
  const empty = !data.contentIdeas.length;

  return (
    <div className="space-y-6">
      {empty ? <EmptyLibrary onAddOwn={onAddOwn} /> : (
        <>
          <ReleaseToday onEdit={onEdit} onBank={onBank} />

          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[26px] leading-none">Today's slate</h2>
                <p className="mt-1.5 text-[12.5px] text-mute">Check a video off once it's posted. It stays here, crossed out.</p>
              </div>
              <Button size="md" variant="secondary" icon={<Wand2 className="h-4 w-4" />} busy={busy} onClick={() => run(act.fillSlate)}>Fill today's slate</Button>
            </div>
            {day.slate.length ? (
              <ul className="divide-y divide-hair" aria-label="Today's slate">
                {day.slate.map((c) => <SlateRow key={c.id} idea={c} />)}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-mute">
                Nothing planned for today. Fill the slate with your top ideas, or add them from the list above.
              </p>
            )}
            {day.carried.length > 0 && (
              <div className="mt-4 border-t border-hair pt-4">
                <div className="eyebrow mb-1">Carried over</div>
                <p className="mb-1 text-[12px] text-faint">Planned for an earlier day and not done yet.</p>
                <ul className="divide-y divide-hair" aria-label="Carried over">
                  {day.carried.map((c) => <SlateRow key={c.id} idea={c} carried />)}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow className="mb-1.5">{fmtLongDate(today)}</Eyebrow>
            <h2 className="text-[26px] leading-none">Filming focus</h2>
          </div>
          <Link to="/habits" className="inline-flex h-10 items-center text-[12.5px] text-mute hover:text-gold">Edit schedule →</Link>
        </div>
        {focus.length ? <FilmingFocus /> : (
          <p className="text-[13px] text-mute">
            {hasProduction ? "No filming or editing scheduled today." : <>No filming or editing on your schedule yet. <Link to="/habits" className="link">Add them to Daily execution</Link></>}
          </p>
        )}
        <div className="mt-5 border-t border-hair pt-4">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <div className="eyebrow">This week</div>
            <Link to="/settings#power" className="text-[12px] text-mute hover:text-gold">Change release days →</Link>
          </div>
          <ScheduleStrip />
        </div>
      </Card>
    </div>
  );
}

/** What's due for release today, and ten ideas at a time in the chosen format. */
function ReleaseToday({ onEdit, onBank }: { onEdit: (c: ContentIdea) => void; onBank: (f: ContentFormat) => void }) {
  const { data, today } = useStore();
  const plan = useReleasePlan();
  const act = useContentActions();
  const [format, setFormatState] = useState<ContentFormat>(() => (plan.short.due > 0 || !plan.long.today ? "short" : "long"));
  const [page, setPage] = useState(1);
  // Ideas checked off here stay in view, crossed out, until the format changes.
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  const listTop = useRef<HTMLDivElement>(null);
  const setFormat = (f: ContentFormat) => {
    setFormatState(f);
    setPage(1);
    setKeep(new Set());
  };

  const pool = data.contentIdeas.filter((c) => c.format === format && (c.status === "open" || keep.has(c.id))).sort(byPick);
  const pages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const p = Math.min(page, pages);
  const shown = pool.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  const nextText = (d: ISODate | null) => (d ? `Next release ${fmtWeekday(d)} ${fmtShort(d)}` : "No release days set");

  const tiles: { f: ContentFormat; due: boolean; head: string; line: string; value: number; max: number }[] = [
    {
      f: "short",
      due: plan.short.due > 0,
      head: plan.short.today ? `${plan.day.shortsToday} of ${plan.day.shortTarget} posted today` : "Not a release day",
      line: plan.short.today ? (plan.short.due ? `${plural(plan.short.due, "more video")} to release today.` : "Released for today.") : nextText(plan.short.next),
      value: plan.day.shortsToday,
      max: plan.day.shortTarget,
    },
    {
      f: "long",
      due: plan.long.today,
      head: `${plan.day.longsWeek} of ${plan.day.longTarget} this week`,
      line: plan.long.releaseDay ? (plan.long.left ? "Release day: post one today." : "Weekly target met.") : nextText(plan.long.next),
      value: plan.day.longsWeek,
      max: plan.day.longTarget,
    },
  ];

  return (
    <Card>
      <div className="mb-4">
        <Eyebrow className="mb-1.5 text-gold">{fmtLongDate(today)}</Eyebrow>
        <h2 className="text-[26px] leading-none">Release today</h2>
        <p className="mt-1.5 text-[12.5px] text-mute">Pick a format to see ten open ideas at a time. Add one to today, or check it off once it's posted.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Choose a format">
        {tiles.map((t) => {
          const active = format === t.f;
          return (
            <button key={t.f} type="button" aria-pressed={active} onClick={() => setFormat(t.f)}
              className={cx("rounded-2xl border p-4 text-left transition",
                active ? "border-gold bg-gold-wash" : "border-line hover:border-gold/50 hover:bg-raised")}>
              <span className="flex items-center justify-between gap-2">
                <span className={cx("text-[15px] font-semibold", active ? "text-gold" : "text-bone")}>{FORMAT_LABEL[t.f]}</span>
                {t.due ? <Pill tone="gold">Due today</Pill> : <Pill>{plural(plan.open[t.f], "open idea")}</Pill>}
              </span>
              <span className="num mt-2 block text-[13px] text-bone">{t.head}</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                <span className="block h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${t.max ? Math.min(100, (t.value / t.max) * 100) : 0}%` }} />
              </span>
              <span className="mt-1.5 block text-[11.5px] text-faint">{t.line}</span>
            </button>
          );
        })}
      </div>

      <div ref={listTop} className="mt-5 flex scroll-mt-24 flex-wrap items-baseline justify-between gap-2 border-t border-hair pt-4">
        <h3 className="text-[20px] leading-none">{FORMAT_LABEL[format]} ideas</h3>
        <span className="num text-[12px] text-mute" aria-live="polite">
          {pool.length ? `${(p - 1) * PAGE_SIZE + 1}–${Math.min(p * PAGE_SIZE, pool.length)} of ${pool.length} · priority first` : "None open"}
        </span>
      </div>
      {shown.length ? (
        <ul className="mt-1 divide-y divide-hair" aria-label={`${FORMAT_LABEL[format]} ideas`}>
          {shown.map((c) => (
            <IdeaRow key={c.id} idea={c} today={today} onEdit={() => onEdit(c)}
              onDone={(v) => { setKeep((k) => new Set(k).add(c.id)); act.setDone(c, v); }}
              onPlan={(v) => act.setPlanned(c, v)} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] text-mute">Every {format}-form idea is done. Add new ones with “Add idea”.</p>
      )}
      <Pager page={p} pages={pages} label={`${FORMAT_LABEL[format]} pages`} onPage={(n) => { setPage(n); scrollTo(listTop.current); }} />
      <button type="button" onClick={() => onBank(format)} className="link mt-3 inline-flex h-10 items-center text-[12.5px]">
        Filter {format}-form by funnel, CTA or section →
      </button>
    </Card>
  );
}

function SlateRow({ idea, carried }: { idea: ContentIdea; carried?: boolean }) {
  const act = useContentActions();
  const { today } = useStore();
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="pt-0.5"><DoneBox idea={idea} onChange={(v) => act.setDone(idea, v)} /></div>
      <div className="min-w-0 flex-1">
        <IdeaTitle idea={idea} />
        <IdeaChips idea={idea} />
        {carried && idea.planned_for && <div className="mt-1 text-[11.5px] text-faint">Planned for {fmtShort(idea.planned_for)}</div>}
      </div>
      {(carried || idea.planned_for === today) && (
        <RowAction className="-mr-2 shrink-0" title="Remove from today" aria-label={`Remove #${idea.num} from today`} onClick={() => act.setPlanned(idea, false)}>
          <CalendarMinus className="h-4 w-4" /><span className="hidden sm:inline">Remove from today</span>
        </RowAction>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────── library ──
function sortIdeas(list: ContentIdea[], sort: SortKey): ContentIdea[] {
  const byNum = (a: ContentIdea, b: ContentIdea) => a.num - b.num;
  const cmp: Record<SortKey, (a: ContentIdea, b: ContentIdea) => number> = {
    list: byNum,
    funnel: (a, b) => FUNNEL_ORDER[a.funnel] - FUNNEL_ORDER[b.funnel] || byNum(a, b),
    format: (a, b) => (a.format === b.format ? 0 : a.format === "short" ? -1 : 1) || byNum(a, b),
    section: (a, b) => a.section.localeCompare(b.section) || byNum(a, b),
    completed: (a, b) => {
      const x = a.status === "done" ? a.completed_on ?? "" : "", y = b.status === "done" ? b.completed_on ?? "" : "";
      return x === y ? byNum(a, b) : x > y ? -1 : 1;
    },
  };
  return [...list].sort(cmp[sort]);
}

function LibraryTab({ filters: f, setFilters, page, setPage, onEdit, onAddOwn }: {
  filters: Filters; setFilters: (f: Filters) => void; page: number; setPage: (p: number) => void;
  onEdit: (c: ContentIdea) => void; onAddOwn: () => void;
}) {
  const { data, today } = useStore();
  const act = useContentActions();
  // Ideas checked or unchecked here stay in view (crossed out) until the filters change.
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  const top = useRef<HTMLDivElement>(null);
  const ideas = data.contentIdeas;
  if (!ideas.length) return <EmptyLibrary onAddOwn={onAddOwn} />;

  const set = (patch: Partial<Filters>) => {
    setKeep(new Set());
    setFilters({ ...f, ...patch });
  };
  const sections = [...new Set([...ideas].sort((a, b) => a.num - b.num).map((c) => c.section))];
  const q = f.q.trim().toLowerCase();
  const matches = (c: ContentIdea) =>
    (f.format === "all" || c.format === f.format) && (f.funnel === "all" || c.funnel === f.funnel) && (!f.cta || c.cta) &&
    (!f.section || c.section === f.section) && (f.status === "all" || c.status === f.status) && (!q || c.title.toLowerCase().includes(q));
  const results = sortIdeas(ideas.filter((c) => matches(c) || keep.has(c.id)), f.sort);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const p = Math.min(page, pages);
  const shown = results.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  const filtered = JSON.stringify({ ...f, sort: "list" }) !== JSON.stringify({ ...DEFAULT_FILTERS, sort: "list" });
  const doneCount = ideas.filter((c) => c.status === "done").length;
  const countOf = (fm: ContentFormat) => ideas.filter((c) => c.format === fm).length;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[26px] leading-none">Filter</h2>
          <span className="num text-[12px] text-mute">{doneCount} of {ideas.length} done</span>
        </div>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search ideas" aria-label="Search ideas" className="pl-10" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field group label="Format">
            <Segmented label="Format" className="w-full" value={f.format} onChange={(v) => set({ format: v })}
              options={[{ value: "all", label: "All" }, { value: "short", label: `Short form · ${countOf("short")}` }, { value: "long", label: `Long form · ${countOf("long")}` }]} />
          </Field>
          <Field group label="Status">
            <Segmented label="Status" className="w-full" value={f.status} onChange={(v) => set({ status: v })}
              options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
          </Field>
          <Field label="Funnel">
            <Select value={f.funnel} onChange={(e) => set({ funnel: e.target.value as Filters["funnel"] })}>
              <option value="all">All stages</option>
              {(Object.keys(FUNNEL_LABEL) as FunnelStage[]).map((k) => <option key={k} value={k}>{FUNNEL_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Section" hint={f.section ? SECTION_NOTES[f.section] : undefined} className="sm:col-span-2 lg:col-span-1">
            <Select value={f.section} onChange={(e) => set({ section: e.target.value })}>
              <option value="">All sections</option>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Sort">
            <Select value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-line px-3.5">
              <Toggle checked={f.cta} onChange={(v) => set({ cta: v })} label="CTA only" sub="Direct calls to the group or coaching." />
            </div>
          </div>
        </div>
        {filtered && (
          <button type="button" className="link mt-3 inline-flex h-10 items-center text-[12.5px]" onClick={() => set({ ...DEFAULT_FILTERS, sort: f.sort })}>Clear filters</button>
        )}
      </Card>

      <Card>
        <div ref={top} className="mb-2 flex scroll-mt-24 flex-wrap items-center justify-between gap-3">
          <h2 className="text-[26px] leading-none">Ideas</h2>
          <span className="num text-[12.5px] text-mute" aria-live="polite">Page {p} of {pages} · {plural(results.length, "idea")}</span>
        </div>
        {shown.length ? (
          <ul className="divide-y divide-hair">
            {shown.map((c) => (
              <IdeaRow key={c.id} idea={c} today={today} onEdit={() => onEdit(c)}
                onDone={(v) => { setKeep((k) => new Set(k).add(c.id)); act.setDone(c, v); }}
                onPlan={(v) => act.setPlanned(c, v)} onDelete={() => act.deleteIdea(c)} />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-[13px] text-mute">No ideas match these filters.</p>
        )}
        <Pager page={p} pages={pages} onPage={(n) => { setPage(n); scrollTo(top.current); }} />
      </Card>
    </div>
  );
}

function IdeaRow({ idea, today, onDone, onPlan, onEdit, onDelete }: {
  idea: ContentIdea; today: string; onDone: (v: boolean) => void; onPlan: (v: boolean) => void; onEdit: () => void; onDelete?: () => void;
}) {
  const planned = idea.planned_for === today;
  const done = idea.status === "done";
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="pt-0.5"><DoneBox idea={idea} onChange={onDone} /></div>
      <div className="min-w-0 flex-1">
        <IdeaTitle idea={idea} />
        <IdeaChips idea={idea} />
        {(done && idea.completed_on) || (idea.planned_for && !planned) ? (
          <div className="mt-1 text-[11.5px] text-faint">
            {done && idea.completed_on ? `Done ${fmtShort(idea.completed_on)}` : `Planned for ${fmtShort(idea.planned_for)}`}
          </div>
        ) : null}
        {idea.notes && <p className="mt-1 whitespace-pre-line text-[12px] text-mute">{idea.notes}</p>}
        <div className="-ml-2.5 mt-1 flex flex-wrap items-center">
          {!done && (
            <RowAction aria-pressed={planned} onClick={() => onPlan(!planned)} className={cx(planned && "text-gold hover:text-gold-hi")}
              aria-label={`${planned ? "Planned today" : "Add to today"}: #${idea.num}`}>
              {planned ? <CalendarMinus className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
              {planned ? "Planned today" : "Add to today"}
            </RowAction>
          )}
          <RowAction onClick={onEdit} aria-label={`Edit #${idea.num}`}><Pencil className="h-3.5 w-3.5" />Edit</RowAction>
          {onDelete && <RowAction onClick={onDelete} aria-label={`Delete #${idea.num}`} className="hover:text-alert"><Trash2 className="h-3.5 w-3.5" />Delete</RowAction>}
        </div>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────── strategy ──
function StrategyTab({ onSection }: { onSection: (section: string) => void }) {
  const { data } = useStore();
  const settings = settingsOf(data);
  const st = strategyOf(settings);
  const [editing, setEditing] = useState(false);

  // Sections in list order, with how much of each is done and its main funnel stage.
  const order: string[] = [];
  const bySection = new Map<string, ContentIdea[]>();
  for (const c of [...data.contentIdeas].sort((a, b) => a.num - b.num)) {
    if (!bySection.has(c.section)) { bySection.set(c.section, []); order.push(c.section); }
    bySection.get(c.section)!.push(c);
  }
  const mainFunnel = (list: ContentIdea[]) =>
    (Object.keys(FUNNEL_LABEL) as FunnelStage[]).reduce((best, k) => (list.filter((c) => c.funnel === k).length > list.filter((c) => c.funnel === best).length ? k : best), "top" as FunnelStage);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Eyebrow className="text-gold">Positioning</Eyebrow>
          <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>Edit strategy</Button>
        </div>
        <p className="mt-3 max-w-3xl font-display text-[26px] leading-tight text-bone sm:text-[30px]">{st.positioning}</p>
        <dl className="mt-6 grid gap-5 border-t border-hair pt-5 sm:grid-cols-2">
          <div>
            <dt className="eyebrow mb-1.5">Tone</dt>
            <dd className="text-[14px] leading-relaxed text-bone/90">{st.tone}</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1.5">Goal</dt>
            <dd className="text-[14px] leading-relaxed text-bone/90">{st.goal}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <h2 className="mb-4 text-[24px] leading-none">How to use this</h2>
          <ol className="space-y-3">
            {st.rules.map((r, i) => (
              <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-bone/90">
                <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 text-[11px] font-semibold text-gold">{i + 1}</span>
                <span className="min-w-0">{r}</span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-[24px] leading-none">Release schedule</h2>
            <dl className="space-y-2 text-[13.5px]">
              <div className="flex justify-between gap-3"><dt className="text-mute">Short form</dt><dd className="text-right text-bone">{settings.shorts_per_day} a day · {fmtDays(settings.short_release_days)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mute">Long form</dt><dd className="text-right text-bone">{settings.longs_per_week} a week · {fmtDays(settings.long_release_days)}</dd></div>
            </dl>
            <Link to="/settings#power" className="link mt-3 inline-flex h-10 items-center text-[12.5px]">Change targets and release days →</Link>
          </Card>
          {st.changed && (
            <Card>
              <h2 className="mb-3 text-[24px] leading-none">What changed</h2>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-bone/90">{st.changed}</p>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <h2 className="mb-1 text-[24px] leading-none">Sections</h2>
        <p className="mb-4 text-[12.5px] text-mute">What each section is for. Open one to see its ideas.</p>
        {order.length ? (
          <ul className="divide-y divide-hair">
            {order.map((s) => {
              const list = bySection.get(s)!;
              const done = list.filter((c) => c.status === "done").length;
              return (
                <li key={s} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-bone">{s}</span>
                      {list.some((c) => c.priority) && <Pill tone="gold">Priority</Pill>}
                      <Pill>{FUNNEL_LABEL[mainFunnel(list)]}</Pill>
                    </div>
                    {SECTION_NOTES[s] && <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{SECTION_NOTES[s]}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="num text-[12px] text-faint">{done}/{list.length} done</span>
                    <Button size="sm" variant="ghost" onClick={() => onSection(s)} aria-label={`See ideas in ${s}`}>See ideas</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-mute">Load your content ideas to see the sections.</p>
        )}
      </Card>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit strategy" wide>
        {editing && <StrategyForm initial={st} onDone={() => setEditing(false)} />}
      </Sheet>
    </div>
  );
}

function StrategyForm({ initial, onDone }: { initial: ContentStrategy; onDone: () => void }) {
  const { saveSingle } = useStore();
  const { busy, run } = useSubmit();
  const [s, setS] = useState<ContentStrategy>({ ...initial, rules: [...initial.rules] });
  const set = (patch: Partial<ContentStrategy>) => setS((x) => ({ ...x, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const rules = s.rules.map((r) => r.trim()).filter(Boolean);
      if (!s.positioning.trim()) throw new Error("Write your positioning in a sentence.");
      await saveSingle("powerSettings", {
        strategy: { positioning: s.positioning.trim(), tone: s.tone.trim(), goal: s.goal.trim(), changed: s.changed.trim(), rules },
      });
      onDone();
      return "Strategy saved.";
    });
  };
  const restore = () => setS({ ...STRATEGY, rules: [...STRATEGY.rules] });
  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Content strategy">
      <Field label="Positioning"><Textarea value={s.positioning} maxLength={400} onChange={(e) => set({ positioning: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tone"><Textarea value={s.tone} maxLength={400} onChange={(e) => set({ tone: e.target.value })} /></Field>
        <Field label="Goal"><Textarea value={s.goal} maxLength={600} onChange={(e) => set({ goal: e.target.value })} /></Field>
      </div>
      <div>
        <div className="eyebrow mb-2">How to use this</div>
        <ol className="space-y-2">
          {s.rules.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <Textarea value={r} maxLength={400} rows={2} aria-label={`Rule ${i + 1}`}
                onChange={(e) => set({ rules: s.rules.map((x, j) => (j === i ? e.target.value : x)) })} />
              <IconButton type="button" label={`Remove rule ${i + 1}`} className="hover:text-alert"
                onClick={() => set({ rules: s.rules.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></IconButton>
            </li>
          ))}
        </ol>
        {s.rules.length < 20 && <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => set({ rules: [...s.rules, ""] })}>Add a rule</Button>}
      </div>
      <Field label="What changed" hint="Optional: why the plan looks the way it does.">
        <Textarea value={s.changed} maxLength={2000} rows={4} onChange={(e) => set({ changed: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" busy={busy}>Save strategy</Button>
        <button type="button" className="link inline-flex h-10 items-center text-[12.5px]" onClick={restore}>Restore my original notes</button>
      </div>
    </form>
  );
}
