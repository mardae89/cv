import { Camera, ImagePlus, Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chart, ChartCard, GOLD, NEUTRAL, RangePicker, rangeFor, type RangeKey } from "@/components/charts";
import { useFeedback } from "@/components/feedback";
import { PhotoUpload, WeightForm } from "@/components/forms/body";
import { forgetPhoto, Photo } from "@/components/Photo";
import { RecordList } from "@/components/RecordList";
import { Button, Card, cx, EmptyState, Eyebrow, IconButton, Meter, PageHeader, Select, Sheet, Stat, Table } from "@/components/ui";
import { useStore } from "@/data/store";
import { paceRate, weeklyWeights, weightPlan, weightProgress } from "@/lib/calc/weight";
import { fmtDate, fmtShort, fmtWeekRange, MISSION_END } from "@/lib/dates";
import { errorMessage, lb, pct, round, signed } from "@/lib/format";
import type { ProgressPhoto, WeightEntry } from "@/lib/types";

/** Newest first by date; records are kept in the order they were entered, so a backfilled one would otherwise sit on top. */
const newestFirst = <T,>(rows: T[], date: (r: T) => string) =>
  [...rows].reverse().sort((a, b) => (date(a) < date(b) ? 1 : date(a) > date(b) ? -1 : 0));
const photosNewestFirst = (photos: ProgressPhoto[]) => newestFirst(photos, (p) => p.taken_on);

export default function Progress() {
  const { data, today, ev } = useStore();
  const [range, setRange] = useState<RangeKey>("mission");
  const [log, setLog] = useState(false);
  const [edit, setEdit] = useState<WeightEntry | null>(null);
  const nav = useNavigate();
  const wp = weightProgress(data.goals, data.weights);

  if (!wp) {
    // Weigh-ins and photos logged before a starting weight is set still need a place to be seen, edited and deleted.
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Body" title="Physical transformation" />
        <EmptyState title="Set your starting point" action={<Button onClick={() => nav("/settings#body")}>Confirm starting weight</Button>}>
          Progress meters need a confirmed starting weight and goal. Nothing is assumed until you enter them.
        </EmptyState>
        <Photos />
        {data.weights.length > 0 && <WeighIns onEdit={setEdit} />}
        <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit weigh-in">{edit && <WeightForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
      </div>
    );
  }

  const g = wp.goal;
  const { from, to } = rangeFor(range, today, wp.series[0]?.date);
  const pts = wp.series.filter((p) => p.date >= from && p.date <= to);
  const chartData = pts.map((p) => ({ date: p.date, weight: p.weight, trend: p.trend, lost: round(g.start - p.weight, 1) }));
  const weeks = weeklyWeights(data.weights).reverse();
  const plan = weightPlan(g, wp.trend, today, MISSION_END, data.goals!.pace);
  const waist = newestFirst(data.weights.filter((w) => w.waist_in !== null && w.entry_date >= from && w.entry_date <= to), (w) => w.entry_date)
    .reverse().map((w) => ({ date: w.entry_date, waist: w.waist_in }));
  const steps = ev.milestones.filter((m) => m.category === "weight");
  const days = Math.max(1, (Date.parse(today) - Date.parse(g.startDate ?? today)) / 864e5);
  const avgWeekly = wp.latest ? round((wp.lost / days) * 7, 2) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Body" title="Physical transformation"
        sub={`Started at ${lb(g.start)}${g.startDate ? ` on ${fmtDate(g.startDate)}` : ""}. Goal ${lb(g.targetWeight)}${g.stretchWeight ? `, stretch ${lb(g.stretchWeight)}` : ""}.`}
        action={<Button onClick={() => setLog(true)}>Log weigh-in</Button>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <Eyebrow className="mb-2">Pounds lost{wp.latest ? ` · ${lb(g.start)} → ${lb(wp.latest.weight)}` : ""}</Eyebrow>
          <div className="display-num text-[72px] leading-none text-gold">{Math.max(0, wp.lost).toFixed(1)}</div>
          {wp.lost < 0 && <p className="text-[13px] text-mute">Currently {signed(-wp.lost)} lb above the start — that happens. Keep logging.</p>}
          <div className="mt-5 space-y-4">
            <Meter value={wp.pctPrimary} label={`${g.targetLoss} lb goal → ${lb(g.targetWeight)}`} right={pct(wp.pctPrimary, 1)}
              sub={wp.pctPrimaryRaw > 100 ? `Goal exceeded — ${pct(wp.pctPrimaryRaw)} of the original target` : `${wp.remaining} lb remaining`} markers={[25, 50, 75].map((at) => ({ at }))} />
            {g.stretchLoss && <Meter value={wp.pctStretch ?? 0} label={`${g.stretchLoss} lb stretch → ${lb(g.stretchWeight)}`} right={pct(wp.pctStretch, 1)} sub={`${wp.remainingStretch} lb remaining`} />}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-hair pt-4">
            <Stat label="Latest weigh-in" value={wp.latest ? lb(wp.latest.weight) : "—"} sub={wp.latest ? fmtShort(wp.latest.date) : undefined} />
            <Stat label="7-day average" value={lb(wp.trend)} sub={wp.weekChange !== null ? `${signed(wp.weekChange)} lb vs last week` : "Smooths day-to-day swings"} />
            <Stat label="Next milestone" value={`${wp.nextMilestone} lb`} sub={`${wp.toNextMilestone} lb to go`} accent />
            <Stat label="Average pace" value={avgWeekly !== null ? `${avgWeekly} lb/wk` : "—"} sub={`${wp.daysTracked} weigh-ins`} />
          </div>
        </Card>

        <ChartCard title="Weight" sub="Dots are your weigh-ins, which progress and milestones count from. The gold line is the 7-day average, to show the direction."
          action={<RangePicker value={range} onChange={setRange} />}
          empty={chartData.length ? false : "No weigh-ins in this range yet."}>
          <Chart data={chartData} x="date" height={300} fmt={(v) => `${round(v, 0)}`}
            series={[{ key: "weight", label: "Weigh-in", color: NEUTRAL, type: "dots" }, { key: "trend", label: "7-day average", color: GOLD }]}
            refs={[{ y: g.targetWeight, label: `Goal ${g.targetWeight}` }, ...(g.stretchWeight ? [{ y: g.stretchWeight, label: `Stretch ${g.stretchWeight}` }] : [])]}
            yDomain={[(min: number) => Math.floor(Math.min(min, g.stretchWeight ?? g.targetWeight) - 2), (max: number) => Math.ceil(Math.max(max, g.start) + 2)]} />
        </ChartCard>
      </div>

      <Card>
        <Eyebrow className="mb-2">Plan to {fmtDate(MISSION_END)}</Eyebrow>
        <p className="text-[14px] text-bone/90">
          Reaching {lb(g.targetWeight)} by the deadline needs about <span className="num font-semibold">{plan.requiredPerWeek} lb/week</span> from today.
          Your {data.goals!.pace} pace plans up to <span className="num font-semibold">{paceRate(data.goals!.pace, wp.trend)} lb/week</span>.
          {plan.onPaceForDeadline
            ? " The goal fits within a sustainable pace."
            : ` At that pace the projection for ${fmtShort(MISSION_END)} is about ${lb(plan.projectedAtDeadline)}${plan.projectedGoalDate ? `, with the goal around ${fmtDate(plan.projectedGoalDate)}` : ""}. That's fine — the target isn't forced to fit the calendar.`}
        </p>
        <p className="mt-2 text-[11.5px] text-faint">Planning estimates only. Talk to your doctor about what rate is right for you.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pounds lost" sub="At each weigh-in" empty={chartData.length ? false : "No data yet."}>
          <Chart data={chartData} x="date" height={220} fmt={(v) => `${round(v, 1)}`} series={[{ key: "lost", label: "Pounds lost", color: GOLD, type: "area" }]}
            refs={[{ y: g.targetLoss, label: `${g.targetLoss} lb` }]} />
        </ChartCard>
        <ChartCard title="Waist" sub="Inches" empty={waist.length ? false : "Log a waist measurement with any weigh-in."}>
          <Chart data={waist} x="date" height={220} fmt={(v) => `${round(v, 1)}`} series={[{ key: "waist", label: "Waist", color: GOLD }]} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <h2 className="mb-4 text-[24px] leading-none">Weight milestones</h2>
          <ol className="space-y-1">
            {steps.map((m) => {
              const row = data.achievements.find((a) => a.key === m.key);
              return (
                <li key={m.key} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5", m.achievedOn ? "bg-gold-wash" : "")}>
                  <span className={cx("num w-14 shrink-0 text-[15px] font-semibold", m.achievedOn ? "text-gold" : "text-faint")}>{m.value} lb</span>
                  <div className="min-w-0 flex-1">
                    <div className={cx("text-[13.5px]", m.achievedOn ? "text-bone" : "text-mute")}>{m.title}</div>
                    <div className="text-[11.5px] text-faint">{m.achievedOn ? `Reached ${fmtDate(m.achievedOn)}` : `Weigh in at ${round(g.start - (m.value ?? 0), 1)} lb or less`}</div>
                  </div>
                  {m.achievedOn && row ? <MilestonePhoto achievementId={row.id} photoId={row.photo_id} title={m.title} /> : !m.achievedOn && <Lock className="h-3.5 w-3.5 text-faint" />}
                </li>
              );
            })}
          </ol>
        </Card>
        <Card>
          <h2 className="mb-4 text-[24px] leading-none">Weekly averages</h2>
          <Table head={["Week", "Average", "Change", "Weigh-ins"]} rows={weeks.slice(0, 12).map((w) => [
            fmtWeekRange(w.weekStart), lb(w.average), w.change === null ? "—" : <span className={w.change < 0 ? "text-gold" : "text-mute"}>{signed(w.change)} lb</span>, w.count,
          ])} empty="Weekly averages appear after your first weigh-in." />
        </Card>
      </div>

      <Photos />

      <WeighIns onEdit={setEdit} />

      <Sheet open={log} onClose={() => setLog(false)} title="Log weigh-in"><WeightForm onDone={() => setLog(false)} /></Sheet>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit weigh-in">{edit && <WeightForm initial={edit} onDone={() => setEdit(null)} />}</Sheet>
    </div>
  );
}

function WeighIns({ onEdit }: { onEdit: (w: WeightEntry) => void }) {
  const { data, remove } = useStore();
  return (
    <Card>
      <h2 className="mb-2 text-[24px] leading-none">All weigh-ins</h2>
      <RecordList limit={14} items={newestFirst(data.weights, (w) => w.entry_date).map((w) => ({
        id: w.id, primary: w.weight !== null ? `${w.weight} lb` : `Waist ${w.waist_in} in`,
        secondary: [fmtDate(w.entry_date), w.waist_in && w.weight !== null && `waist ${w.waist_in} in`, w.flagged && "confirmed unusual change", w.note].filter(Boolean).join(" · "),
        onEdit: () => onEdit(w), onDelete: () => remove("weights", w.id), deleteLabel: "this weigh-in",
      }))} />
    </Card>
  );
}

function MilestonePhoto({ achievementId, photoId, title }: { achievementId: string; photoId: string | null; title: string }) {
  const { data, update } = useStore();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const photo = data.photos.find((p) => p.id === photoId);
  const attach = async (id: string | null) => {
    try {
      await update("achievements", achievementId, { photo_id: id });
      setOpen(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${photo ? "Change" : "Attach"} photo for ${title}`} className="shrink-0">
        {photo ? <Photo id={photo.id} alt="Milestone photo" className="h-10 w-10" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-line text-faint"><ImagePlus className="h-4 w-4" /></span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Milestone photo">
        {data.photos.length ? (
          <div className="space-y-3">
            <Select value={photoId ?? ""} onChange={(e) => attach(e.target.value || null)} aria-label="Choose photo">
              <option value="">No photo</option>
              {photosNewestFirst(data.photos).map((p) => <option key={p.id} value={p.id}>{fmtDate(p.taken_on)}{p.pose ? ` · ${p.pose}` : ""}{p.caption ? ` · ${p.caption}` : ""}</option>)}
            </Select>
            <p className="text-[12px] text-faint">Upload new photos in the Photos section below.</p>
          </div>
        ) : <p className="text-[13px] text-mute">Upload a progress photo first, then attach it here.</p>}
      </Sheet>
    </>
  );
}

function Photos() {
  const { data, remove } = useStore();
  const { confirm, toast } = useFeedback();
  const [add, setAdd] = useState(false);
  const del = async (id: string) => {
    if (!(await confirm({ title: "Delete this photo?", body: "It's removed from storage permanently.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      // Also deletes the stored image and unlinks it from any milestone.
      await remove("photos", id);
      forgetPhoto(id);
      toast("Photo deleted.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const photos = photosNewestFirst(data.photos);
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[24px] leading-none">Progress photos</h2>
        <Button size="sm" variant="secondary" icon={<Camera className="h-4 w-4" />} onClick={() => setAdd(true)}>Add photo</Button>
      </div>
      {photos.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p) => (
            <figure key={p.id} className="group relative">
              <Photo id={p.id} alt={`Progress photo ${fmtDate(p.taken_on)}`} className="aspect-[3/4]" />
              <figcaption className="mt-1 text-[11px] text-faint">{fmtShort(p.taken_on)}{p.pose ? ` · ${p.pose}` : ""}</figcaption>
              {/* Always shown: touch screens and keyboards can't reveal a hover-only button. */}
              <IconButton label={`Delete photo from ${fmtDate(p.taken_on)}`} className="absolute right-1 top-1 h-8 w-8 bg-ink/70" onClick={() => del(p.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </figure>
          ))}
        </div>
      ) : <p className="text-[13px] text-faint">No photos yet. They're stored privately and are optional.</p>}
      <Sheet open={add} onClose={() => setAdd(false)} title="Progress photo"><PhotoUpload onDone={() => setAdd(false)} /></Sheet>
    </Card>
  );
}
