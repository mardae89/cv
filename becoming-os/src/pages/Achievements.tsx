import { Award, Lock } from "lucide-react";
import { useState } from "react";
import { CardActions, progressLine } from "@/components/Celebration";
import { Card, cx, Eyebrow, Meter, PageHeader, Segmented, Sheet } from "@/components/ui";
import { useStore } from "@/data/store";
import type { Milestone } from "@/lib/calc/milestones";
import { XP, LEVELS } from "@/lib/calc/xp";
import { fmtDate } from "@/lib/dates";
import { money, round } from "@/lib/format";
import type { AchievementCategory } from "@/lib/types";

const CAT_LABEL: Record<AchievementCategory, string> = { weight: "Weight", business: "Business", audience: "Audience", athletic: "Athletic", habit: "Consistency", level: "Levels" };

export default function Achievements() {
  const { data, ev, today } = useStore();
  const [cat, setCat] = useState<AchievementCategory | "all">("all");
  const [view, setView] = useState<string | null>(null);
  const lv = ev.level;
  const timeline = [...data.achievements].sort((a, b) => (a.achieved_on < b.achieved_on ? 1 : -1));
  const cats = (["weight", "business", "audience", "athletic", "habit", "level"] as AchievementCategory[])
    .filter((c) => ev.milestones.some((m) => m.category === c));
  const shown = ev.milestones.filter((m) => cat === "all" || m.category === cat);
  const row = view ? data.achievements.find((a) => a.key === view) : null;
  const m = view ? ev.milestones.find((x) => x.key === view) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Earned, permanently" title="Milestones" sub="Unlocked from your saved records. Setbacks never take them away — only correcting the record that earned one can." />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-gold/10 blur-3xl" />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow className="mb-2 text-gold">Level {lv.current.level} of {LEVELS.length}</Eyebrow>
            <h2 className="text-[48px] leading-none">{lv.current.name}</h2>
            <p className="mt-2 text-[13px] text-mute">{ev.xp.total.toLocaleString()} XP · {lv.achievements} milestones</p>
          </div>
          {lv.next && (
            <div className="w-full max-w-sm">
              <Meter value={lv.progress} label={`Next: ${lv.next.name}`} right={`${lv.progress}%`}
                sub={`${lv.xpToNext > 0 ? `${lv.xpToNext.toLocaleString()} XP` : "XP ✓"} · ${lv.achievementsToNext > 0 ? `${lv.achievementsToNext} more milestone${lv.achievementsToNext === 1 ? "" : "s"}` : "milestones ✓"}`} />
            </div>
          )}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-hair pt-4 sm:grid-cols-7">
          {(Object.entries(ev.xp.byCategory) as [string, number][]).map(([k, v]) => (
            <div key={k}><div className="eyebrow mb-1 text-[9.5px]">{k}</div><div className="num text-[15px] font-semibold">{v.toLocaleString()}</div></div>
          ))}
        </div>
        <details className="mt-4 text-[12px] text-mute">
          <summary className="cursor-pointer text-faint">How XP works</summary>
          <p className="mt-2 leading-relaxed">
            Weigh-in {XP.weighIn} · check-in {XP.checkin} · symptom log {XP.symptomLog} · workout {XP.workout} (mobility, walks and recovery {XP.lightSession}; at most {XP.workoutsPerDay} per day) ·
            meal {XP.meal} (max {XP.mealCap}/day) · habit 5–25 as set · task {XP.task} · rest day {XP.restDay} · journal {XP.journal} · learning {XP.learning} ·
            business transaction {XP.transaction} (max {XP.transactionCap}/day) · activity log {XP.activityLog} · weekly review {XP.weeklyReview} · monthly review {XP.monthlyReview} ·
            milestones {XP.minorAchievement}/{XP.majorAchievement}. No points for extra training volume, eating less, or weight change. Missed days never subtract XP.
          </p>
        </details>
      </Card>

      <div className="-mx-4 overflow-x-auto px-4">
        <Segmented label="Category" size="sm" value={cat} onChange={setCat} options={[{ value: "all", label: "All" }, ...cats.map((c) => ({ value: c, label: CAT_LABEL[c] }))]} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((x) => <Tile key={x.key} m={x} onOpen={() => x.achievedOn && setView(x.key)} />)}
      </div>

      <Card data-testid="timeline">
        <h2 className="mb-4 text-[26px] leading-none">Timeline</h2>
        {timeline.length ? (
          <ol className="relative space-y-4 border-l border-hair pl-5">
            {timeline.map((a) => (
              <li key={a.id} className="relative">
                <span className={cx("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full", a.tier === "major" ? "bg-gold" : "bg-gold-dim")} />
                <button className="text-left" onClick={() => setView(a.key)}>
                  <div className="num text-[11.5px] text-faint">{fmtDate(a.achieved_on)}</div>
                  <div className={cx("text-[15px]", a.tier === "major" ? "font-display text-[20px] text-bone" : "text-bone/90")}>{a.title}</div>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="text-[13px] text-faint">Your first milestone will appear here — check the closest one above.</p>}
      </Card>

      <Sheet open={!!row} onClose={() => setView(null)} title="Milestone">
        {row && (
          <div className="text-center">
            <Award className="mx-auto mb-3 h-8 w-8 text-gold" />
            <div className="eyebrow mb-2 text-gold">{row.tier === "major" ? "Major milestone" : "Milestone"}</div>
            <h3 className="text-[32px] leading-tight">{row.title}</h3>
            <p className="num mt-2 text-[13px] text-mute">{fmtDate(row.achieved_on)}</p>
            <p className="mt-2 text-[13px] text-bone/80">{m?.requirement}</p>
            <p className="mt-1 text-[12.5px] text-mute">{progressLine(row, data, ev, today)}</p>
            <div className="mt-5"><CardActions a={row} line={progressLine(row, data, ev, today)} /></div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Tile({ m, onOpen }: { m: Milestone; onOpen: () => void }) {
  const fmt = (n: number) => (m.progress?.unit === "$" ? money(n) : `${round(n, 1).toLocaleString("en-US")} ${m.progress?.unit}`);
  return (
    <button onClick={onOpen} disabled={!m.achievedOn}
      className={cx("rounded-2xl border p-4 text-left transition", m.achievedOn ? "border-gold/40 bg-gold-wash hover:border-gold" : "border-hair bg-panel")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{CAT_LABEL[m.category]} · {m.group}</span>
        {m.achievedOn ? <Award className={cx("h-4 w-4", m.tier === "major" ? "text-gold" : "text-gold-dim")} /> : <Lock className="h-3.5 w-3.5 text-faint" />}
      </div>
      <div className={cx("text-[15px] leading-snug", m.achievedOn ? "text-bone" : "text-mute")}>{m.title}</div>
      <div className="mt-1 text-[11.5px] text-faint">{m.achievedOn ? fmtDate(m.achievedOn) : m.requirement}</div>
      {!m.achievedOn && m.progress && (
        <Meter thin className="mt-3" value={m.progress.current} max={m.progress.target} sub={`${fmt(Math.min(m.progress.current, m.progress.target))} of ${fmt(m.progress.target)}`} />
      )}
    </button>
  );
}
