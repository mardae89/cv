import { Download, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFeedback } from "@/components/feedback";
import { useSubmit } from "@/components/forms/body";
import { Button, Card, Field, Input, Notice, NumberInput, PageHeader, Segmented, Select, Textarea, Toggle } from "@/components/ui";
import { useStore, LIST_TABLES, SINGLE_TABLES, fetchAll } from "@/data/store";
import { supabase } from "@/data/supabase";
import { toCSV, download } from "@/lib/csv";
import { round, num, errorMessage } from "@/lib/format";
import { ACTIVITY_OPTIONS } from "@/lib/templates";
import type { Pace, ReminderSettings, ShareSettings } from "@/lib/types";
import { GoalSettings } from "./Business";
import { PrivacyEditor } from "./Onboarding";
import { TrainingSettings } from "./Train";

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[28px] leading-none">{title}</h2>
      {sub && <p className="mb-4 mt-1.5 text-[13px] text-mute">{sub}</p>}
      <div className={sub ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

export default function Settings() {
  const s = useStore();
  const { data } = s;
  const loc = useLocation();
  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [loc.hash]);
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Settings" title="Your system" />
      <Section id="profile" title="Profile"><ProfileSettings /></Section>
      <Section id="body" title="Body goals" sub="Changing the baseline recalculates every meter and milestone from your records."><BodySettings /></Section>
      <Section id="training" title="Training & readiness"><Card><TrainingSettings /></Card></Section>
      <Section id="business" title="Business">
        <Card>
          <Toggle checked={data.profile.business_enabled} onChange={(v) => s.saveProfile({ business_enabled: v })} label="Track business performance" sub="Hiding it keeps all records; turning it back on restores them." />
          {data.profile.business_enabled && <div className="mt-4 border-t border-hair pt-4"><GoalSettings /></div>}
        </Card>
      </Section>
      <Section id="privacy" title="Privacy & sharing" sub="Enforced by database row-level security. Your partner can never edit your records."><PrivacySettings /></Section>
      <Section id="reminders" title="Reminders"><ReminderSettingsCard /></Section>
      <Section id="data" title="Your data"><DataSettings /></Section>
      <Section id="demo" title={data.profile.demo_mode ? "Demo account" : "Danger zone"}><DangerZone /></Section>
    </div>
  );
}

function ProfileSettings() {
  const { data, saveProfile } = useStore();
  const { busy, run } = useSubmit();
  const nav = useNavigate();
  const [name, setName] = useState(data.profile.display_name);
  const [tz, setTz] = useState(data.profile.timezone);
  const [pw, setPw] = useState("");
  const zones: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [data.profile.timezone];
  return (
    <Card className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
        <Field label="Time zone" hint="Decides when your day starts and ends.">
          <Select value={tz} onChange={(e) => setTz(e.target.value)}>
            {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={() => run(async () => { await saveProfile({ display_name: name.trim(), timezone: tz }); return "Profile saved."; })}>Save profile</Button>
        <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await supabase.auth.signOut(); nav("/auth"); }}>Sign out</Button>
      </div>
      <div className="border-t border-hair pt-4">
        <Field label="Change password" hint="At least 8 characters.">
          <div className="flex gap-2">
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            <Button variant="secondary" className="shrink-0" busy={busy} onClick={() => run(async () => {
              if (pw.length < 8) throw new Error("Use at least 8 characters.");
              const { error } = await supabase.auth.updateUser({ password: pw });
              if (error) throw error;
              setPw("");
              return "Password updated.";
            })}>Update</Button>
          </div>
        </Field>
      </div>
    </Card>
  );
}

function BodySettings() {
  const { data, today, saveSingle } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const g = data.goals;
  const [start, setStart] = useState(g?.start_weight != null ? String(g.start_weight) : "");
  const [startDate, setStartDate] = useState(g?.start_date ?? today);
  const [target, setTarget] = useState(g?.target_loss != null ? String(g.target_loss) : "");
  const [stretch, setStretch] = useState(g?.stretch_loss != null ? String(g.stretch_loss) : "");
  const [waist, setWaist] = useState(g?.start_waist != null ? String(g.start_waist) : "");
  const [pace, setPace] = useState<Pace>(g?.pace ?? "steady");
  const [notes, setNotes] = useState(g?.health_notes ?? "");
  const [prefs, setPrefs] = useState<string[]>(g?.preferred_activities ?? []);
  const sw = num(start), tl = num(target);
  return (
    <Card className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Starting weight"><NumberInput value={start} onChange={setStart} suffix="lb" /></Field>
        <Field label="Start date"><Input type="date" value={startDate} max={today} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Starting waist"><NumberInput value={waist} onChange={setWaist} suffix="in" /></Field>
        <Field label="Target loss" hint={sw && tl ? `Target weight ${round(sw - tl, 1)} lb` : undefined}><NumberInput value={target} onChange={setTarget} suffix="lb" /></Field>
        <Field label="Target weight"><NumberInput value={sw && tl ? String(round(sw - tl, 1)) : ""} onChange={(v) => sw && v && setTarget(String(round(sw - num(v), 1)))} suffix="lb" /></Field>
        <Field label="Stretch goal" hint={sw && stretch ? `${round(sw - num(stretch), 1)} lb` : "optional"}><NumberInput value={stretch} onChange={setStretch} suffix="lb" /></Field>
      </div>
      <Field group label="Pace"><Segmented value={pace} onChange={setPace} className="w-full" options={[{ value: "gentle", label: "Gentle" }, { value: "steady", label: "Steady" }, { value: "ambitious", label: "Ambitious" }]} /></Field>
      <Field group label="Preferred activities">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_OPTIONS.map((o) => (
            <button key={o} type="button" onClick={() => setPrefs((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] ${prefs.includes(o) ? "border-gold bg-gold-wash text-gold" : "border-line text-mute"}`}>{o}</button>
          ))}
        </div>
      </Field>
      <Field label="Health considerations (private)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-[64px]" /></Field>
      <Button busy={busy} onClick={() => run(async () => {
        if (!sw || sw < 70 || sw > 700) throw new Error("Enter a starting weight between 70 and 700 lb.");
        if (!(tl > 0)) throw new Error("Enter a target loss.");
        if (stretch && num(stretch) < tl) throw new Error("The stretch goal should be at least the main goal.");
        if (g?.start_weight && num(g.start_weight) !== sw &&
          !(await confirm({ title: "Change starting weight?", body: `From ${g.start_weight} to ${sw} lb. Progress and weight milestones will be recalculated from the corrected baseline.`, confirmLabel: "Change it" }))) return;
        await saveSingle("goals", {
          start_weight: sw, start_date: startDate, target_loss: tl, stretch_loss: stretch ? num(stretch) : null,
          start_waist: waist ? num(waist) : null, pace, health_notes: notes.trim() || null, preferred_activities: prefs,
        });
        return "Body goals saved.";
      })}>Save body goals</Button>
    </Card>
  );
}

function PrivacySettings() {
  const { shareSettings, data, saveSingle } = useStore();
  const { busy, run } = useSubmit();
  const [v, setV] = useState<ShareSettings | null>(shareSettings);
  if (!v) return <Notice tone="alert">Sharing settings are missing for this account.</Notice>;
  return (
    <div className="space-y-3">
      <PrivacyEditor value={v} onChange={setV} business={data.profile.business_enabled} />
      <Button busy={busy} onClick={() => run(async () => { await saveSingle("shareSettings", { ...v }); return "Privacy saved — applies immediately."; })}>Save privacy</Button>
    </div>
  );
}

function ReminderSettingsCard() {
  const { reminderSettings, saveSingle } = useStore();
  const { toast } = useFeedback();
  if (!reminderSettings) return null;
  const set = (patch: Partial<ReminderSettings>) => saveSingle("reminderSettings", patch).catch((e) => toast(errorMessage(e), "error"));
  const rows: [keyof ReminderSettings, string, string][] = [
    ["daily_logging", "Daily logging", "If nothing is logged by the time below"],
    ["workouts", "Planned workouts", "On your training days"],
    ["weekly_review", "Weekly review", "Sunday through Tuesday until completed"],
    ["monthly_review", "Monthly review & chapters", "First days of each month"],
    ["milestones", "Upcoming milestones", "When you're 85% of the way"],
    ["business_targets", "Business activity targets", "Late in the week if behind pace"],
    ["recovery", "Recovery & symptoms", "After 6+ sessions without rest, or concerning symptoms"],
    ["race_checkpoints", "Race preparation", "8, 4, 2 and 1 weeks out"],
  ];
  return (
    <Card>
      <Notice>In-app only: reminders appear in the notification centre when you open the app. No push or email is sent in this version.</Notice>
      <div className="mt-3 divide-y divide-hair">
        {rows.map(([k, label, sub]) => (
          <Toggle key={k} checked={reminderSettings[k] as boolean} onChange={(v) => set({ [k]: v })} label={label} sub={sub} />
        ))}
      </div>
      <Field label="Daily logging reminder after" className="mt-3 max-w-xs">
        <Select value={String(reminderSettings.daily_logging_hour)} onChange={(e) => set({ daily_logging_hour: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`}</option>)}
        </Select>
      </Field>
    </Card>
  );
}

function DataSettings() {
  const { uid, today } = useStore();
  const { busy, run } = useSubmit();
  const everything = async () => {
    const out: Record<string, unknown> = {};
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", uid).single();
    out.profile = profile;
    for (const [k, t] of Object.entries(SINGLE_TABLES)) {
      const { data } = await supabase.from(t).select("*").eq("user_id", uid).maybeSingle();
      out[k] = data;
    }
    for (const [k, t] of Object.entries(LIST_TABLES)) out[k] = await fetchAll(t.table, "user_id", uid, t.order);
    return out;
  };
  return (
    <Card className="space-y-3">
      <p className="text-[13px] text-mute">Download a complete copy of your records. Progress photo files stay in storage; their metadata is included.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" busy={busy} icon={<Download className="h-4 w-4" />} onClick={() => run(async () => {
          download(`becoming-os-export-${today}.json`, JSON.stringify(await everything(), null, 2), "application/json");
          return "Export downloaded.";
        })}>Everything (JSON)</Button>
        <Button variant="secondary" busy={busy} icon={<Download className="h-4 w-4" />} onClick={() => run(async () => {
          const all = await everything();
          for (const k of ["weights", "workouts", "checkins", "nutrition", "completions", "journal", "transactions", "payments"]) {
            const rows = all[k] as Record<string, unknown>[];
            if (rows.length) download(`becoming-os-${k}-${today}.csv`, toCSV(rows));
          }
          return "CSV files downloaded.";
        })}>Main tables (CSV)</Button>
      </div>
    </Card>
  );
}

function DangerZone() {
  const { data, uid, saveProfile, invalidateAll } = useStore();
  const { confirm, toast } = useFeedback();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    const demo = data.profile.demo_mode;
    const ok = await confirm({
      title: demo ? "Reset the demo account?" : "Delete all your data?",
      body: demo ? "All sample data is removed and setup starts again." : "Every record in this account — weights, workouts, habits, business records, journal, photos and milestones — is permanently deleted. Export first if you want a copy.",
      confirmLabel: demo ? "Reset demo" : "Delete everything", destructive: true, typeToConfirm: demo ? undefined : "DELETE",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { data: files } = await supabase.storage.from("progress-photos").list(uid, { limit: 1000 });
      if (files?.length) await supabase.storage.from("progress-photos").remove(files.map((f) => `${uid}/${f.name}`));
      const { error } = await supabase.rpc("reset_my_data");
      if (error) throw error;
      await saveProfile({ onboarding_done: false });
      await invalidateAll();
      toast(demo ? "Demo cleared." : "All data deleted.");
      nav("/onboarding");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="border-alert/30">
      {data.profile.demo_mode && <Notice tone="gold">This is a demo account with sample data and a simulated date. Reset it to start fresh, or use a separate account for your real records.</Notice>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-mute">{data.profile.demo_mode ? "Removes all sample data and returns to setup." : "Permanently deletes every record you own. Your partner's data is untouched."}</p>
        <Button variant="danger" busy={busy} onClick={reset}>{data.profile.demo_mode ? "Reset demo account" : "Delete all my data"}</Button>
      </div>
    </Card>
  );
}
