import { useState } from "react";
import { Link } from "react-router-dom";
import { useSubmit } from "@/components/forms/body";
import { Button, Card, cx, Eyebrow, Field, Notice, PageHeader, Pill, Select, Textarea } from "@/components/ui";
import { useStore } from "@/data/store";
import { buildRoadmap, type ChapterView } from "@/lib/calc/roadmap";
import { fmtDate, fmtShort, monthStart } from "@/lib/dates";
import { lb, money, pct, signed } from "@/lib/format";

const STATUS: Record<string, { label: string; tone: "gold" | "neutral" | "calm" | "alert" }> = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  in_progress: { label: "In progress", tone: "gold" },
  complete: { label: "Complete", tone: "calm" },
  not_started: { label: "Not started", tone: "neutral" },
  adjusted: { label: "Adjusted", tone: "alert" },
};

export default function Roadmap() {
  const { data, today, ev } = useStore();
  const chapters = buildRoadmap(data, today, ev.unlocked.map((m) => m.achievedOn!));
  const current = chapters.findIndex((c) => today >= c.def.start && today <= c.def.end);
  const [open, setOpen] = useState<number>(current >= 0 ? current : 0);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Oct 10, 2026 – May 24, 2027" title="Seven-month roadmap"
        sub="Eight chapters. Targets start from your confirmed baseline and re-plan from actual results at a sustainable pace — strategic guides, not guarantees." />
      {!data.goals?.start_weight && <Notice tone="gold">Weight targets appear once your starting weight is confirmed. <Link to="/settings#body" className="link">Set it</Link></Notice>}
      <ol className="relative space-y-3 border-l border-hair pl-5 sm:pl-7">
        {chapters.map((c, i) => (
          <li key={c.def.key} className="relative">
            <span className={cx("absolute -left-[27px] top-6 h-3 w-3 rounded-full border-2 sm:-left-[35px]",
              c.status === "complete" ? "border-gold bg-gold" : c.status === "in_progress" ? "border-gold bg-ink" : "border-line bg-ink")} />
            <Chapter c={c} index={i} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chapter({ c, index, open, onToggle }: { c: ChapterView; index: number; open: boolean; onToggle: () => void }) {
  const { data, today, upsert } = useStore();
  const { busy, run } = useSubmit();
  const [objective, setObjective] = useState(c.note?.objective ?? "");
  const [actions, setActions] = useState(c.note?.planned_actions ?? "");
  const [reflection, setReflection] = useState(c.note?.reflection ?? "");
  const [status, setStatus] = useState(c.note?.status_override ?? "");
  const s = STATUS[c.status];
  const started = today >= c.def.start;
  const monthReview = data.reviews.find((r) => r.period === "month" && r.period_start === monthStart(c.def.start) && r.completed_at);
  return (
    <Card className={cx("p-0 transition", open && "border-line")}>
      <button className="flex w-full items-center justify-between gap-4 p-5 text-left" onClick={onToggle} aria-expanded={open}>
        <div className="min-w-0">
          <Eyebrow className="mb-1">Chapter {index + 1} · {fmtShort(c.def.start)} – {fmtDate(c.def.end)}</Eyebrow>
          <h2 className="text-[26px] leading-none">{c.def.title}</h2>
        </div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </button>
      {open && (
        <div className="space-y-5 border-t border-hair p-5 animate-fade">
          <p className="text-[14px] leading-relaxed text-bone/90">{c.note?.objective || c.def.objective}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Target label="Weight milestone" planned={c.weightPlanned !== null ? `${lb(c.weightPlanned)} 7-day avg` : "Set a start weight"}
              adjusted={c.weightAdjusted !== null && c.weightAdjusted !== c.weightPlanned ? `${lb(c.weightAdjusted)} re-planned` : undefined}
              actual={c.actual.weightEnd !== null ? `${lb(c.actual.weightEnd)}${c.actual.weightChange !== null ? ` (${signed(c.actual.weightChange)})` : ""}` : undefined} />
            {data.profile.business_enabled && (
              <Target label="Monthly revenue milestone" planned={c.revenuePlanned !== null ? money(c.revenuePlanned) : "—"}
                adjusted={c.revenueAdjusted !== null && c.revenueAdjusted !== c.revenuePlanned ? `${money(c.revenueAdjusted)} re-planned` : undefined}
                actual={c.actual.revenue !== null ? money(c.actual.revenue) : undefined} />
            )}
            <Target label="Athletic" planned={c.athletic} actual={started ? `${c.actual.sessions} sessions` : undefined} />
            <Target label="Habit focus" planned={c.def.habitFocus} actual={c.actual.habitPct !== null ? `${pct(c.actual.habitPct)} completion` : undefined} />
          </div>
          {started && <p className="text-[12.5px] text-mute">{c.actual.milestones} milestone{c.actual.milestones === 1 ? "" : "s"} unlocked in this chapter{today <= c.def.end ? " so far" : ""}.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Planned actions" hint={`Suggestions: ${c.def.suggestedActions.join(" · ")}`}>
              <Textarea value={actions} onChange={(e) => setActions(e.target.value)} maxLength={3000} placeholder={c.def.suggestedActions.map((a) => `• ${a}`).join("\n")} />
            </Field>
            <Field label="Reflection" hint={monthReview ? "Your monthly review for this month is complete." : started ? undefined : "Write this at the end of the chapter."}>
              <Textarea value={reflection} onChange={(e) => setReflection(e.target.value)} maxLength={3000} />
            </Field>
            <Field label="Your own objective (optional)"><Textarea value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={500} className="min-h-[64px]" placeholder={c.def.objective} /></Field>
            <Field label="Status" hint="Leave on automatic to follow the calendar.">
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="">Automatic</option><option value="not_started">Not started</option><option value="in_progress">In progress</option>
                <option value="complete">Complete</option><option value="adjusted">Adjusted</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={`/reviews?period=month&month=${monthStart(c.def.start)}`} className="link text-[13px]">Monthly review →</Link>
            <Button busy={busy} onClick={() => run(async () => {
              await upsert("roadmapNotes", {
                chapter_key: c.def.key, objective: objective.trim() || null, planned_actions: actions.trim() || null,
                reflection: reflection.trim() || null, status_override: status || null,
              }, "user_id,chapter_key");
              return "Chapter saved.";
            })}>Save chapter</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Target({ label, planned, adjusted, actual }: { label: string; planned: string; adjusted?: string; actual?: string }) {
  return (
    <div className="rounded-xl border border-hair p-3">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="text-[13px] text-bone">{planned}</div>
      {adjusted && <div className="mt-1 text-[12px] text-gold">{adjusted}</div>}
      {actual && <div className="mt-1.5 border-t border-hair pt-1.5 text-[12px] text-mute">Actual: <span className="text-bone">{actual}</span></div>}
    </div>
  );
}
