import { CalendarMinus, CalendarPlus, ChevronLeft, ChevronRight, Library, Pencil, Plus, Search, Trash2, Wand2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ContentProgress, DoneBox, FilmingFocus, FUNNEL_LABEL, FUNNEL_ORDER, IdeaChips, IdeaForm, IdeaTitle, productionDue, RowAction,
  ScheduleStrip, useContentActions, useContentDay, useTargets,
} from "@/components/content";
import { useSubmit } from "@/components/forms/body";
import { Button, Card, cx, EmptyState, Eyebrow, Field, Input, PageHeader, Segmented, Select, Sheet, Toggle } from "@/components/ui";
import { useStore } from "@/data/store";
import { CONTENT_PACK, SECTION_NOTES } from "@/lib/contentPack";
import { fmtLongDate, fmtShort } from "@/lib/dates";
import { plural } from "@/lib/format";
import type { ContentFormat, ContentIdea, FunnelStage } from "@/lib/types";

type Tab = "today" | "library";
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

export default function Content() {
  const { data } = useStore();
  const { line } = useTargets();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "library" ? "library" : "today";
  const setTab = (v: Tab) => setParams(v === "library" ? { tab: "library" } : {}, { replace: true });
  const [editing, setEditing] = useState<ContentIdea | "new" | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const empty = !data.contentIdeas.length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Production" title="Content" sub={line}
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Add idea</Button>} />

      <Segmented label="Content view" value={tab} onChange={setTab}
        options={[{ value: "today", label: "Today" }, { value: "library", label: `Library${empty ? "" : ` · ${data.contentIdeas.length}`}` }]} />

      {tab === "today" ? <TodayTab onAddOwn={() => setEditing("new")} onLibrary={() => setTab("library")} />
        : <LibraryTab filters={filters} setFilters={(f) => { setFilters(f); setPage(1); }} page={page} setPage={setPage}
          onEdit={setEditing} onAddOwn={() => setEditing("new")} />}

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
    <EmptyState icon={<Library className="h-7 w-7" />} title="Your idea library is empty"
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
function TodayTab({ onAddOwn, onLibrary }: { onAddOwn: () => void; onLibrary: () => void }) {
  const { data, today } = useStore();
  const day = useContentDay();
  const act = useContentActions();
  const { busy, run } = useSubmit();
  const focus = productionDue(data.powerItems, today);
  const hasProduction = data.powerItems.some((i) => /^(film|edit)\b/i.test(i.name.trim()) && !(i.archived_on && i.archived_on <= today));
  const empty = !data.contentIdeas.length;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow className="mb-1.5">{fmtLongDate(today)}</Eyebrow>
            <h2 className="text-[26px] leading-none">Filming focus</h2>
          </div>
          <Link to="/power" className="inline-flex h-10 items-center text-[12.5px] text-mute hover:text-gold">Power List →</Link>
        </div>
        {focus.length ? <FilmingFocus /> : (
          <p className="text-[13px] text-mute">
            {hasProduction ? "No filming or editing scheduled today." : <>No filming or editing items on your Power List yet. <Link to="/power" className="link">Set up the Power List</Link></>}
          </p>
        )}
        {hasProduction && (
          <div className="mt-5 border-t border-hair pt-4">
            <div className="eyebrow mb-2.5">This week</div>
            <ScheduleStrip />
          </div>
        )}
      </Card>

      {empty ? <EmptyLibrary onAddOwn={onAddOwn} /> : (
        <>
          <Card><ContentProgress day={day} /></Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[26px] leading-none">Today's slate</h2>
                <p className="mt-1.5 text-[12.5px] text-mute">Check a video off once it's posted. It stays here, crossed out.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="md" variant="secondary" icon={<Wand2 className="h-4 w-4" />} busy={busy} onClick={() => run(act.fillSlate)}>Fill today's slate</Button>
                <Button size="md" variant="ghost" icon={<Library className="h-4 w-4" />} onClick={onLibrary}>Add from library</Button>
              </div>
            </div>
            {day.slate.length ? (
              <ul className="divide-y divide-hair" aria-label="Today's slate">
                {day.slate.map((c) => <SlateRow key={c.id} idea={c} />)}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-mute">
                Nothing planned for today. Fill the slate from your library, or pick ideas yourself.
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
    </div>
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

  const goTo = (n: number) => {
    setPage(n);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

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
              options={[{ value: "all", label: "All" }, { value: "short", label: "Short form" }, { value: "long", label: "Long form" }]} />
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
              <LibraryRow key={c.id} idea={c} today={today} onEdit={() => onEdit(c)}
                onDone={(v) => { setKeep((k) => new Set(k).add(c.id)); act.setDone(c, v); }}
                onPlan={(v) => act.setPlanned(c, v)} onDelete={() => act.deleteIdea(c)} />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-[13px] text-mute">No ideas match these filters.</p>
        )}
        {results.length > PAGE_SIZE && (
          <nav className="mt-4 flex items-center justify-between gap-3 border-t border-hair pt-4" aria-label="Pages">
            <Button variant="secondary" disabled={p <= 1} onClick={() => goTo(p - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Previous</Button>
            <span className="num text-[12.5px] text-mute">{p} / {pages}</span>
            <Button variant="secondary" disabled={p >= pages} onClick={() => goTo(p + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
          </nav>
        )}
      </Card>
    </div>
  );
}

function LibraryRow({ idea, today, onDone, onPlan, onEdit, onDelete }: {
  idea: ContentIdea; today: string; onDone: (v: boolean) => void; onPlan: (v: boolean) => void; onEdit: () => void; onDelete: () => void;
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
        <div className="-ml-2.5 mt-1 flex flex-wrap items-center">
          {!done && (
            <RowAction aria-pressed={planned} onClick={() => onPlan(!planned)} className={cx(planned && "text-gold hover:text-gold-hi")}
              aria-label={`${planned ? "Planned today" : "Add to today"}: #${idea.num}`}>
              {planned ? <CalendarMinus className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
              {planned ? "Planned today" : "Add to today"}
            </RowAction>
          )}
          <RowAction onClick={onEdit} aria-label={`Edit #${idea.num}`}><Pencil className="h-3.5 w-3.5" />Edit</RowAction>
          <RowAction onClick={onDelete} aria-label={`Delete #${idea.num}`} className="hover:text-alert"><Trash2 className="h-3.5 w-3.5" />Delete</RowAction>
        </div>
      </div>
    </li>
  );
}
