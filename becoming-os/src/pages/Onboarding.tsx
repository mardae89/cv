import { ArrowLeft, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeedback } from "@/components/feedback";
import { Button, Card, cx, DayPicker, Field, Input, Notice, NumberInput, Segmented, Select, Textarea, Toggle } from "@/components/ui";
import { useStore } from "@/data/store";
import { supabase } from "@/data/supabase";
import { READINESS_LABEL } from "@/lib/calc/athletic";
import { paceRate } from "@/lib/calc/weight";
import { fmtDate, MISSION_END } from "@/lib/dates";
import { buildDemo, DEMO_TODAY } from "@/lib/demo";
import { errorMessage, num, round } from "@/lib/format";
import { ACTIVITY_OPTIONS, BUSINESS_TEMPLATES, HABIT_TEMPLATES, habitFromTemplate } from "@/lib/templates";
import type { GoalMetric, Pace, Readiness, ShareSettings } from "@/lib/types";

type Step = "plan" | "body" | "training" | "business" | "habits" | "privacy" | "reminders";

export default function Onboarding() {
  const s = useStore();
  const { data, today } = s;
  const { toast, confirm } = useFeedback();
  const nav = useNavigate();
  // No plan is pre-selected: each person chooses, so nobody inherits another's numbers.
  const [preset, setPreset] = useState<"primary" | "partner" | "custom" | null>(data.profile.plan_preset);
  const [bizOn, setBizOn] = useState(data.profile.business_enabled);
  const steps: Step[] = ["plan", "body", "training", ...(bizOn ? (["business"] as Step[]) : []), "habits", "privacy", "reminders"];
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const [busy, setBusy] = useState(false);

  // body
  const g = data.goals;
  const [startWeight, setStartWeight] = useState(g?.start_weight ? String(g.start_weight) : "");
  const [startDate, setStartDate] = useState(g?.start_date ?? today);
  const [waist, setWaist] = useState(g?.start_waist ? String(g.start_waist) : "");
  const [targetLoss, setTargetLoss] = useState(g?.target_loss ? String(g.target_loss) : "");
  const [stretchLoss, setStretchLoss] = useState(g?.stretch_loss ? String(g.stretch_loss) : "");
  const [pace, setPace] = useState<Pace>(g?.pace ?? "steady");
  const [activity, setActivity] = useState(g?.activity_level ?? "");
  const [healthNotes, setHealthNotes] = useState(g?.health_notes ?? "");
  const [prefs, setPrefs] = useState<string[]>(g?.preferred_activities ?? []);
  const [minutes, setMinutes] = useState(g?.weekly_training_minutes ? String(g.weekly_training_minutes) : "");

  // training
  const a = data.athletic;
  const [readiness, setReadiness] = useState<Readiness | "">(a?.readiness ?? "");
  const [assessedOn, setAssessedOn] = useState(a?.assessed_on ?? "");
  const [injuryNotes, setInjuryNotes] = useState(a?.injury_notes ?? "");
  const [days, setDays] = useState<number[]>(a?.training_days ?? [1, 3, 5]);
  const [target, setTarget] = useState(String(a?.weekly_session_target ?? 3));
  const [goalText, setGoalText] = useState(a?.goal_text ?? "");

  // business
  const b = data.businessSettings;
  const [metric, setMetric] = useState<GoalMetric>(b?.goal_metric ?? "revenue");
  const [baseRev, setBaseRev] = useState(b?.baseline_revenue !== null && b?.baseline_revenue !== undefined ? String(b.baseline_revenue) : "");
  const [baseExp, setBaseExp] = useState(b?.baseline_expenses !== null && b?.baseline_expenses !== undefined ? String(b.baseline_expenses) : "");
  const [workspaces, setWorkspaces] = useState<string[]>(data.businesses.length ? [] : ["lrg", "em"]);

  // habits
  const [habitPicks, setHabitPicks] = useState<string[]>(
    data.habits.length ? [] : HABIT_TEMPLATES.filter((t) => t.defaultOn && (!t.business || bizOn)).map((t) => t.name));

  // privacy
  const [share, setShare] = useState<ShareSettings | null>(s.shareSettings);
  // reminders
  const [hour, setHour] = useState(String(s.reminderSettings?.daily_logging_hour ?? 20));

  const next = () => setI((x) => Math.min(x + 1, steps.length - 1));
  const back = () => setI((x) => Math.max(0, x - 1));

  const finish = async () => {
    setBusy(true);
    try {
      await s.saveProfile({ onboarding_done: true });
      nav("/", { replace: true });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      if (step === "reminders") await finish();
      else next();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const savePlan = () => run(async () => {
    if (!preset) throw new Error("Choose the plan that fits you, or skip setup for now.");
    await s.saveProfile({ plan_preset: preset, business_enabled: bizOn });
  });

  const choosePreset = (key: "primary" | "partner" | "custom") => {
    setPreset(key);
    if (key === "primary") setBizOn(true);
    if (key === "partner") setBizOn(false);
    if (g) return; // never overwrite saved goals
    if (key === "primary") {
      setStartWeight("267");
      setTargetLoss("50");
      setStretchLoss("60");
      if (!a) setGoalText("Complete a 10K");
    } else {
      setStartWeight("");
      setTargetLoss(key === "partner" ? "60" : "");
      setStretchLoss("");
    }
  };

  const saveBody = () => run(async () => {
    const sw = num(startWeight);
    if (!startWeight) return; // skipped
    if (sw < 70 || sw > 700) throw new Error("Enter a starting weight between 70 and 700 lb.");
    const tl = num(targetLoss);
    if (tl <= 0) throw new Error("Enter how many pounds you want to lose.");
    const sl = stretchLoss ? num(stretchLoss) : null;
    if (sl !== null && sl < tl) throw new Error("The stretch goal should be at least the main goal.");
    await s.saveSingle("goals", {
      start_weight: sw, start_date: startDate, target_loss: tl, stretch_loss: sl,
      start_waist: waist ? num(waist) : null, pace, activity_level: activity || null,
      health_notes: healthNotes.trim() || null, preferred_activities: prefs,
      weekly_training_minutes: minutes ? Math.round(num(minutes)) : null,
    });
    // The confirmed start becomes the first weigh-in if that day has none.
    if (!data.weights.some((w) => w.entry_date === startDate)) {
      await s.insert("weights", { entry_date: startDate, weight: sw, waist_in: waist ? num(waist) : null, note: "Starting weight" });
    }
  });

  const saveTraining = () => run(async () => {
    await s.saveSingle("athletic", {
      readiness: readiness || null, assessed_on: assessedOn || null, injury_notes: injuryNotes.trim() || null,
      training_days: days, weekly_session_target: Math.max(1, Math.min(14, Math.round(num(target) || 3))),
      goal_text: goalText.trim() || "Complete a 10K",
    });
  });

  const saveBusiness = () => run(async () => {
    await s.saveSingle("businessSettings", {
      goal_metric: metric,
      baseline_revenue: baseRev === "" ? null : num(baseRev),
      baseline_expenses: baseExp === "" ? null : num(baseExp),
      baseline_confirmed_on: baseRev === "" && baseExp === "" ? null : today,
    });
    for (const key of workspaces) {
      const t = BUSINESS_TEMPLATES.find((x) => x.key === key)!;
      if (data.businesses.some((b) => b.name === t.name)) continue;
      const [biz] = await s.insert<{ id: string }>("businesses", { name: t.name, kind: t.kind, description: t.description, sort_order: data.businesses.length });
      await s.insert("offers", t.offers.map((o) => ({ ...o, business_id: biz.id })));
      await s.insert("metrics", t.metrics.map((m, idx) => ({ ...m, business_id: biz.id, sort_order: idx })));
    }
  });

  const saveHabits = () => run(async () => {
    const picks = HABIT_TEMPLATES.filter((t) => habitPicks.includes(t.name) && !data.habits.some((h) => h.name === t.name));
    if (picks.length) await s.insert("habits", picks.map((t, idx) => habitFromTemplate(t, today, data.habits.length + idx)));
  });

  const savePrivacy = () => run(async () => {
    if (share) await s.saveSingle("shareSettings", { ...share });
  });

  const saveReminders = () => run(async () => {
    await s.saveSingle("reminderSettings", { daily_logging_hour: Math.max(0, Math.min(23, Math.round(num(hour)))) });
  });

  const startDemo = async () => {
    const hasRecords = data.weights.length + data.workouts.length + data.habits.length + data.transactions.length > 0;
    if (hasRecords) return toast("Demo data can only be loaded into an empty account.", "error");
    const ok = await confirm({
      title: "Make this a demo account?",
      body: "This fills this account with clearly labelled sample data and sets its clock to Dec 15, 2026 so you can explore a populated dashboard. Use a separate account for your real records. You can reset the demo later in Settings.",
      confirmLabel: "Load sample data",
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const { table, rows } of buildDemo(s.uid)) {
        for (let k = 0; k < rows.length; k += 500) {
          const { error } = await supabase.from(table).insert(rows.slice(k, k + 500), { defaultToNull: false });
          if (error) throw error;
        }
      }
      await s.saveProfile({ demo_mode: true, demo_today: DEMO_TODAY, onboarding_done: true, plan_preset: "primary", business_enabled: true, display_name: data.profile.display_name || "Demo" });
      await s.invalidateAll();
      nav("/", { replace: true });
    } catch (e) {
      toast(`Demo load failed: ${errorMessage(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const tl = num(targetLoss), sw = num(startWeight), sl = stretchLoss ? num(stretchLoss) : null;
  const weeks = 32.3;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="eyebrow text-gold">Setup · step {Math.min(i, steps.length - 1) + 1} of {steps.length}</div>
        <button className="text-[13px] text-mute hover:text-bone" onClick={finish}>Skip setup for now</button>
      </div>
      <div className="mb-8 flex gap-1.5">
        {steps.map((x, k) => <div key={x} className={cx("h-1 flex-1 rounded-full", k <= i ? "bg-gold" : "bg-raised")} />)}
      </div>

      {step === "plan" && (
        <section className="animate-rise">
          <h1 className="text-[42px] leading-none">Welcome{data.profile.display_name ? `, ${data.profile.display_name}` : ""}.</h1>
          <p className="mt-3 text-[15px] text-mute">A few questions so targets come from your real numbers. Every step can be skipped and finished later — nothing is invented in the meantime.</p>
          <div className="mt-8 grid gap-3">
            {([
              ["primary", "Body, business and a 10K", "Lose 50–60 lb, build to $10,000/month in business, and train toward a 10K."],
              ["partner", "My own transformation", "Your own weight goal (default 60 lb), habits and training. No business tracking unless you turn it on."],
              ["custom", "Custom", "Choose everything yourself."],
            ] as const).map(([key, title, sub]) => (
              <button key={key} onClick={() => choosePreset(key)} aria-pressed={preset === key}
                className={cx("rounded-2xl border p-5 text-left transition", preset === key ? "border-gold bg-gold-wash" : "border-line hover:border-mute")}>
                <div className="font-display text-[22px] text-bone">{title}</div>
                <div className="mt-1 text-[13px] text-mute">{sub}</div>
              </button>
            ))}
          </div>
          <Card className="mt-4">
            <Toggle checked={bizOn} onChange={setBizOn} label="Track business performance" sub="Revenue, cash, expenses, pipeline and outreach. Never shared unless you choose to." />
          </Card>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button onClick={startDemo} className="inline-flex items-center gap-2 text-[13px] text-mute hover:text-gold" disabled={busy}>
              <Sparkles className="h-4 w-4" /> Explore with sample data instead (demo account)
            </button>
            <Button size="lg" busy={busy} disabled={!preset} onClick={savePlan}>Continue</Button>
          </div>
        </section>
      )}

      {step === "body" && (
        <section className="animate-rise space-y-5">
          <h1 className="text-[38px] leading-none">Body baseline</h1>
          <p className="text-[14px] text-mute">Weigh in on your usual scale and enter the number. Targets are calculated from it.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={preset === "primary" && !g ? "Confirm your starting weight" : "Starting weight"}
              hint={preset === "primary" && !g && startWeight === "267" ? "Pre-filled with the 267 lb from your plan — change it to today's scale reading." : undefined}>
              <NumberInput value={startWeight} onChange={setStartWeight} suffix="lb" placeholder="e.g. 230.4" />
            </Field>
            <Field label="Weigh-in date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} max={today} /></Field>
            <Field label={preset === "primary" ? "Target loss (50–60 lb)" : "Pounds to lose"} hint="You can enter a target weight instead, below.">
              <NumberInput value={targetLoss} onChange={setTargetLoss} suffix="lb" />
            </Field>
            <Field label="Target weight" hint="Calculated from your baseline.">
              <NumberInput value={sw && tl ? String(round(sw - tl, 1)) : ""} onChange={(v) => sw && v && setTargetLoss(String(round(sw - num(v), 1)))} suffix="lb" />
            </Field>
            <Field label="Stretch goal (optional)"><NumberInput value={stretchLoss} onChange={setStretchLoss} suffix="lb" /></Field>
            <Field label="Waist (optional)"><NumberInput value={waist} onChange={setWaist} suffix="in" /></Field>
          </div>
          {sw > 0 && tl > 0 && (
            <Notice tone="gold" title={`Target: ${round(sw - tl, 1)} lb${sl ? ` · stretch ${round(sw - sl, 1)} lb` : ""}`}>
              Reaching {tl} lb by {fmtDate(MISSION_END)} averages {round(tl / weeks, 2)} lb/week. Your pace setting caps planning at {paceRate(pace, sw)} lb/week;
              if the goal needs more than that, the roadmap shows a later date rather than an unsafe one.
            </Notice>
          )}
          <Field group label="Preferred pace">
            <Segmented value={pace} onChange={setPace} className="w-full" options={[
              { value: "gentle", label: "Gentle" }, { value: "steady", label: "Steady" }, { value: "ambitious", label: "Ambitious" },
            ]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Activity level today">
              <Select value={activity} onChange={(e) => setActivity(e.target.value as typeof activity)}>
                <option value="">Prefer not to say</option>
                <option value="sedentary">Mostly sitting</option>
                <option value="light">Lightly active</option>
                <option value="moderate">Moderately active</option>
                <option value="active">Very active</option>
              </Select>
            </Field>
            <Field label="Training time available"><NumberInput value={minutes} onChange={setMinutes} suffix="min/wk" /></Field>
          </div>
          <Field group label="Activities you enjoy">
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_OPTIONS.map((o) => (
                <button key={o} type="button" onClick={() => setPrefs((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))}
                  className={cx("rounded-full border px-3 py-1.5 text-[13px]", prefs.includes(o) ? "border-gold bg-gold-wash text-gold" : "border-line text-mute")}>{o}</button>
              ))}
            </div>
          </Field>
          <Field label="Health considerations (private)" hint="Anything you want to remember when planning — injuries, conditions, advice from your doctor.">
            <Textarea value={healthNotes} onChange={(e) => setHealthNotes(e.target.value)} maxLength={2000} />
          </Field>
          <Nav back={back} skip={next} save={saveBody} busy={busy} />
        </section>
      )}

      {step === "training" && (
        <section className="animate-rise space-y-5">
          <h1 className="text-[38px] leading-none">Training readiness</h1>
          <Notice title="About pain and running">
            BECOMING OS records what you report and points you to a clinician when symptoms warrant it. It can't assess an injury or clear you to run.
            If you've had sharp ankle pain, get it assessed before returning to running.
          </Notice>
          <Field group label="Where are you right now?">
            <div className="grid gap-2">
              {(Object.keys(READINESS_LABEL) as Readiness[]).map((r) => (
                <button key={r} type="button" onClick={() => setReadiness(r)}
                  className={cx("rounded-xl border px-4 py-3 text-left text-[14px]", readiness === r ? "border-gold bg-gold-wash text-bone" : "border-line text-mute")}>
                  {READINESS_LABEL[r]}
                </button>
              ))}
            </div>
          </Field>
          {(readiness === "under_care" || readiness === "cleared_by_clinician") && (
            <Field label="Date assessed"><Input type="date" value={assessedOn} max={today} onChange={(e) => setAssessedOn(e.target.value)} /></Field>
          )}
          <Field label="Injury notes (private)"><Textarea value={injuryNotes} onChange={(e) => setInjuryNotes(e.target.value)} placeholder="What hurts, when, what makes it worse" /></Field>
          <Field group label="Preferred training days"><DayPicker value={days} onChange={setDays} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sessions per week"><NumberInput value={target} onChange={setTarget} step="1" /></Field>
            <Field label="Athletic goal"><Input value={goalText} onChange={(e) => setGoalText(e.target.value)} maxLength={120} placeholder="e.g. Complete a 10K" /></Field>
          </div>
          <Nav back={back} skip={next} save={saveTraining} busy={busy} />
        </section>
      )}

      {step === "business" && (
        <section className="animate-rise space-y-5">
          <h1 className="text-[38px] leading-none">Business baseline</h1>
          <Field group label="What does the $10,000/month goal measure?" hint="You can change this later. Milestones follow whichever you choose.">
            <Segmented value={metric} onChange={setMetric} className="w-full" options={[
              { value: "revenue", label: "Revenue" }, { value: "cash", label: "Cash collected" }, { value: "profit", label: "Net profit" },
            ]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current monthly revenue" hint="Leave blank if you're not sure yet."><NumberInput value={baseRev} onChange={setBaseRev} suffix="$/mo" /></Field>
            <Field label="Current monthly expenses"><NumberInput value={baseExp} onChange={setBaseExp} suffix="$/mo" /></Field>
          </div>
          <Field group label="Create workspaces">
            <div className="grid gap-2">
              {BUSINESS_TEMPLATES.map((t) => {
                const exists = data.businesses.some((b) => b.name === t.name);
                return (
                  <label key={t.key} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-4", workspaces.includes(t.key) || exists ? "border-gold/60" : "border-line")}>
                    <input type="checkbox" className="mt-1 accent-[var(--gold)]" disabled={exists} checked={exists || workspaces.includes(t.key)}
                      onChange={(e) => setWorkspaces((w) => (e.target.checked ? [...w, t.key] : w.filter((x) => x !== t.key)))} />
                    <span>
                      <span className="block text-[14px] text-bone">{t.name}{exists && " (created)"}</span>
                      <span className="block text-[12px] text-mute">{t.description}</span>
                      <span className="mt-1 block text-[11.5px] text-faint">Offers: {t.offers.map((o) => `${o.name}${o.price ? ` $${o.price}` : ""}`).join(" · ")} — editable defaults, not expected sales.</span>
                    </span>
                  </label>
                );
              })}
              <p className="text-[12px] text-faint">You can add any other business, offer or revenue stream later from the Business page.</p>
            </div>
          </Field>
          <Nav back={back} skip={next} save={saveBusiness} busy={busy} />
        </section>
      )}

      {step === "habits" && (
        <section className="animate-rise space-y-5">
          <h1 className="text-[38px] leading-none">Daily system</h1>
          <p className="text-[14px] text-mute">Pick a starting set. Each has its own schedule — weekdays, weekends, or specific days — and you can edit everything later. Rest days pause training habits.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {HABIT_TEMPLATES.filter((t) => !t.business || bizOn).map((t) => {
              const exists = data.habits.some((h) => h.name === t.name);
              const on = exists || habitPicks.includes(t.name);
              return (
                <button key={t.name} type="button" disabled={exists}
                  onClick={() => setHabitPicks((p) => (p.includes(t.name) ? p.filter((x) => x !== t.name) : [...p, t.name]))}
                  className={cx("rounded-xl border px-4 py-3 text-left", on ? "border-gold bg-gold-wash" : "border-line")}>
                  <div className="text-[14px] text-bone">{t.name}</div>
                  <div className="text-[11.5px] text-mute">{t.schedule_days.length === 7 ? "Every day" : t.schedule_days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(" · ")}</div>
                </button>
              );
            })}
          </div>
          <Nav back={back} skip={next} save={saveHabits} busy={busy} />
        </section>
      )}

      {step === "privacy" && share && (
        <section className="animate-rise space-y-5">
          <h1 className="text-[38px] leading-none">What your partner can see</h1>
          <p className="text-[14px] text-mute">Applies once you connect accounts. Enforced by the database, not just hidden on screen. You can change it any time.</p>
          <PrivacyEditor value={share} onChange={setShare} business={bizOn} />
          <Nav back={back} skip={next} save={savePrivacy} busy={busy} />
        </section>
      )}

      {step === "reminders" && (
        <section className="animate-rise space-y-5">
          <h1 className="text-[38px] leading-none">Reminders</h1>
          <Field label="Daily logging reminder after" hint="Reminders appear in the in-app notification centre when you open BECOMING OS. Phone push notifications aren't set up in this version.">
            <Select value={hour} onChange={(e) => setHour(e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`}</option>)}
            </Select>
          </Field>
          <p className="text-[13px] text-mute">Other reminder categories (workouts, reviews, milestones, business targets, recovery, race checkpoints) are on by default and can be switched off in Settings.</p>
          <Nav back={back} skip={finish} save={saveReminders} busy={busy} last />
        </section>
      )}
    </div>
  );
}

function Nav({ back, skip, save, busy, last }: { back: () => void; skip: () => void; save: () => void; busy: boolean; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hair pt-5">
      <Button variant="ghost" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={skip}>Skip</Button>
        <Button busy={busy} onClick={save}>{last ? "Finish" : "Save & continue"}</Button>
      </div>
    </div>
  );
}

export function PrivacyEditor({ value, onChange, business }: { value: ShareSettings; onChange: (v: ShareSettings) => void; business: boolean }) {
  const set = <K extends keyof ShareSettings>(k: K, v: ShareSettings[K]) => onChange({ ...value, [k]: v });
  const row = (label: string, sub: string, control: React.ReactNode) => (
    <div className="flex flex-col gap-2 border-b border-hair py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="text-[14px] text-bone">{label}</div><div className="text-[12px] text-mute">{sub}</div></div>
      {control}
    </div>
  );
  return (
    <Card className="py-1">
      {row("Weight progress", "Percent only hides pounds and weights. Weight milestones need pounds or more.",
        <Segmented size="sm" value={value.weight} onChange={(v) => set("weight", v)} options={[
          { value: "none", label: "Hidden" }, { value: "percent", label: "% of goal" }, { value: "pounds", label: "Pounds lost" }, { value: "full", label: "Full detail" }]} />)}
      {row("Training", "Summary: sessions, distance, longest run. Full: every workout.",
        <Segmented size="sm" value={value.training} onChange={(v) => set("training", v)} options={[
          { value: "none", label: "Hidden" }, { value: "summary", label: "Summary" }, { value: "full", label: "Full" }]} />)}
      {row("Habits", "Summary: completion percentages. Full: each habit and task.",
        <Segmented size="sm" value={value.habits} onChange={(v) => set("habits", v)} options={[
          { value: "none", label: "Hidden" }, { value: "summary", label: "Summary" }, { value: "full", label: "Full" }]} />)}
      {row("Milestones", "Your achievement timeline (category limits above still apply).",
        <Segmented size="sm" value={value.milestones} onChange={(v) => set("milestones", v)} options={[
          { value: "none", label: "Hidden" }, { value: "full", label: "Shared" }]} />)}
      {row("Health details", "Sleep, symptoms, nutrition, injury notes.",
        <Segmented size="sm" value={value.health} onChange={(v) => set("health", v)} options={[
          { value: "none", label: "Private" }, { value: "full", label: "Shared" }]} />)}
      {row("Progress photos", "Photos are private unless shared here.",
        <Segmented size="sm" value={value.photos} onChange={(v) => set("photos", v)} options={[
          { value: "none", label: "Private" }, { value: "full", label: "Shared" }]} />)}
      {business && row("Business", "Summary: progress toward the monthly goal only. Full: every transaction and customer.",
        <Segmented size="sm" value={value.business} onChange={(v) => set("business", v)} options={[
          { value: "none", label: "Private" }, { value: "summary", label: "Goal only" }, { value: "full", label: "Full" }]} />)}
      <p className="pb-4 pt-1 text-[12px] text-faint">Journal entries and reflections are private unless you mark an individual entry as shared.</p>
    </Card>
  );
}
