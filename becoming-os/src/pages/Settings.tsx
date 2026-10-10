import { AlertTriangle, Check, Download, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFeedback } from "@/components/feedback";
import { useSubmit } from "@/components/forms/body";
import { Button, Card, Field, Input, Notice, NumberInput, PageHeader, Segmented, Select, Textarea, Toggle } from "@/components/ui";
import type { ExportFile } from "@/data/engine";
import { saveFile } from "@/data/host";
import { LIST_KEYS, SINGLE_DEFAULTS, SINGLE_KEYS, TABLES, validateRow, validateSingle } from "@/data/schema";
import { useStore } from "@/data/store";
import { toCSV } from "@/lib/csv";
import { fmtDate, todayIn } from "@/lib/dates";
import { round, num, errorMessage, plural } from "@/lib/format";
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
      <Section id="storage" title="Storage"><StorageSettings /></Section>
      <Section id="profile" title="Profile"><ProfileSettings /></Section>
      <Section id="body" title="Body goals" sub="Changing the baseline recalculates every meter and milestone from your records."><BodySettings /></Section>
      <Section id="training" title="Training & readiness"><Card><TrainingSettings /></Card></Section>
      <Section id="business" title="Business">
        <Card>
          <Toggle checked={data.profile.business_enabled} onChange={(v) => s.saveProfile({ business_enabled: v })} label="Track business performance" sub="Hiding it keeps all records; turning it back on restores them." />
          {data.profile.business_enabled && <div className="mt-4 border-t border-hair pt-4"><GoalSettings /></div>}
        </Card>
      </Section>
      <Section id="privacy" title="Privacy & sharing" sub={s.host.mode === "shared-page"
        ? "Your partner sees only a summary built from these choices, never your records, and can't edit anything of yours."
        : "These choices apply on your shared BECOMING OS page. In this browser nothing is shared."}><PrivacySettings /></Section>
      <Section id="reminders" title="Reminders"><ReminderSettingsCard /></Section>
      <Section id="data" title="Your data"><DataSettings /></Section>
      <Section id="demo" title={data.profile.demo_mode ? "Sample data" : "Danger zone"}><DangerZone /></Section>
    </div>
  );
}

/** Where records live, and whether the latest changes have reached storage. */
function StorageSettings() {
  const { host, saveStatus } = useStore();
  const { pending, error, lastSavedAt } = saveStatus;
  return (
    <Card className="space-y-3">
      <p className="text-[14px] text-bone">
        {host.mode === "shared-page"
          ? "Synced through your private BECOMING OS page. Your records are private to you; your partner only sees what you choose under Sharing."
          : "Saved in this browser on this device only. Nothing syncs. Export a backup regularly."}
      </p>
      {host.notice && <Notice tone="gold">{host.notice}</Notice>}
      <div className="flex items-start gap-2 border-t border-hair pt-3 text-[13px]" role="status" aria-live="polite">
        {error ? (
          <><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert" /><span className="text-alert">{error}{pending > 0 && " Retrying…"}</span></>
        ) : pending > 0 ? (
          <><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-mute" /><span className="text-mute">Saving…</span></>
        ) : (
          <><Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><span className="text-mute">
            All changes saved{lastSavedAt && ` · last save ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
          </span></>
        )}
      </div>
    </Card>
  );
}

function ProfileSettings() {
  const { data, saveProfile } = useStore();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(data.profile.display_name);
  const [tz, setTz] = useState(data.profile.timezone);
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
      <Button busy={busy} onClick={() => run(async () => { await saveProfile({ display_name: name.trim(), timezone: tz }); return "Profile saved."; })}>Save profile</Button>
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

/**
 * Row rules checked before a restore starts. Restoring clears what's stored
 * first, so a file that would fail halfway must be caught here.
 */
function checkBackup(raw: unknown): ExportFile {
  const f = raw as ExportFile;
  if (!f || typeof f !== "object" || f.app !== "becoming-os" || !f.tables || typeof f.tables !== "object") {
    throw new Error("That file isn't a BECOMING OS backup.");
  }
  if (f.version !== 1) throw new Error("That backup comes from a different version of BECOMING OS and can't be restored here.");
  if (!f.profile || typeof f.profile !== "object") throw new Error("That backup is missing its profile, so it can't be restored.");
  for (const t of LIST_KEYS) {
    const rows = f.tables[t] ?? [];
    if (!Array.isArray(rows)) throw new Error(`The backup's ${t} section is damaged.`);
    rows.forEach((r, i) => {
      try {
        validateRow(t, { ...TABLES[t].defaults, ...r });
      } catch (e) {
        throw new Error(`Record ${i + 1} in ${t}: ${errorMessage(e)}`);
      }
    });
  }
  for (const k of SINGLE_KEYS) {
    const row = f.singles?.[k];
    if (!row) continue;
    try {
      validateSingle(k, { ...SINGLE_DEFAULTS[k], ...row });
    } catch (e) {
      throw new Error(`${k} settings: ${errorMessage(e)}`);
    }
  }
  return f;
}

const CSV_TABLES = ["weights", "workouts", "checkins", "nutrition", "completions", "journal", "transactions", "payments"] as const;

function DataSettings() {
  const { data, host, engine } = useStore();
  const { confirm, toast } = useFeedback();
  const { busy, run } = useSubmit();
  const nav = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Inside the claude.ai frame, files can only be saved through the page's save dialog.
  const canSave = !host.framed || !!host.downloads;
  // Real date even when a demo clock is set, so backups sort by when they were made.
  const stamp = () => todayIn(data.profile.timezone);
  const where = host.mode === "shared-page" ? "for you on this page" : "in this browser";

  const backup = () => run(async () => {
    const file = await engine.exportAll(true);
    if ((await saveFile(host, `becoming-os-backup-${stamp()}.json`, JSON.stringify(file))) === "declined") return toast("Backup not saved.", "info");
    return "Backup saved.";
  });

  const csv = () => run(async () => {
    const ready = CSV_TABLES.filter((k) => data[k].length);
    if (!ready.length) return "Nothing to export yet.";
    let saved = 0;
    for (const k of ready) {
      const rows = data[k] as unknown as Record<string, unknown>[];
      if ((await saveFile(host, `becoming-os-${k}-${stamp()}.csv`, new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }))) === "declined") break;
      saved++;
    }
    if (!saved) return toast("CSV files not saved.", "info");
    return `${plural(saved, "CSV file")} saved.`;
  });

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still fires
    if (!picked) return;
    setRestoreError(null);
    setRestoring(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await picked.text());
      } catch {
        throw new Error("That file isn't a BECOMING OS backup (it isn't valid JSON).");
      }
      const file = checkBackup(parsed);
      // Milestones and reminders are rebuilt from the records, so they aren't counted.
      const count = LIST_KEYS.filter((t) => t !== "achievements" && t !== "notifications").reduce((n, t) => n + (file.tables[t]?.length ?? 0), 0);
      const photos = Object.keys(file.images ?? {}).length;
      const ok = await confirm({
        title: "Restore this backup?",
        body: <>
          <p>This replaces everything currently stored {where} with the backup{file.exported_at ? ` from ${fmtDate(file.exported_at.slice(0, 10))}` : ""}: {plural(count, "record")}{photos ? ` and ${plural(photos, "photo")}` : ""}.</p>
          <p className="mt-2">Anything you've logged that isn't in the backup is deleted. Save a backup of what's here first if you might want it.</p>
        </>,
        confirmLabel: "Replace everything", destructive: true,
      });
      if (!ok) return;
      await engine.importAll(file);
      toast("Backup restored.");
      // Restoring clears everything first, which briefly sends the app to setup; come back here.
      nav("/settings", { replace: true });
    } catch (err) {
      setRestoreError(errorMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="space-y-3">
        <p className="text-[13px] text-mute">
          A backup file holds every record, setting and progress photo. {host.mode === "device" ? "It's the only copy outside this browser, so keep it somewhere safe." : "Keep it somewhere safe."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy} disabled={!canSave || restoring} icon={<Download className="h-4 w-4" />} onClick={backup}>Save backup (JSON)</Button>
          <Button variant="secondary" busy={busy} disabled={!canSave || restoring} icon={<Download className="h-4 w-4" />} onClick={csv}>Main tables (CSV)</Button>
        </div>
        {!canSave && <p className="text-[12px] text-faint">Saving files isn't available in this view.</p>}
      </div>
      <div className="space-y-3 border-t border-hair pt-4">
        <p className="text-[13px] text-mute">Restore replaces everything stored {where} with a backup file's contents.</p>
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={restore} aria-label="Backup file to restore" />
        <Button variant="secondary" busy={restoring} disabled={busy} icon={<Upload className="h-4 w-4" />} onClick={() => fileInput.current?.click()}>Restore from backup</Button>
        {restoreError && <Notice tone="alert" title="Backup not restored">{restoreError}</Notice>}
      </div>
    </Card>
  );
}

function DangerZone() {
  const { data, host, engine, saveProfile } = useStore();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const demo = data.profile.demo_mode;
  const reset = async () => {
    const ok = await confirm({
      title: demo ? "Clear the sample data?" : "Delete all your data?",
      body: demo ? "All sample data is removed and setup starts again."
        : `Every record you've stored ${host.mode === "shared-page" ? "on this page" : "in this browser"} — weights, workouts, habits, business records, journal, photos and milestones — is permanently deleted. Save a backup first if you want a copy.`,
      confirmLabel: demo ? "Clear sample data" : "Delete everything", destructive: true, typeToConfirm: demo ? undefined : "DELETE",
    });
    if (!ok) return;
    setBusy(true);
    try {
      // "Demo" is the placeholder name sample data sets; drop it first so setup asks for a real one.
      if (demo && data.profile.display_name === "Demo") await saveProfile({ display_name: "" });
      // Setup opens on its own once the reset clears onboarding.
      await engine.reset();
      toast(demo ? "Sample data cleared." : "All data deleted.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="border-alert/30">
      {demo && <Notice tone="gold">You're exploring sample data with a simulated date. Clear it before you start logging your real records.</Notice>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-mute">
          {demo ? "Removes all sample data and returns to setup."
            : host.mode === "shared-page" ? "Permanently deletes every record you own. Your partner's records are untouched."
            : "Permanently deletes every record stored in this browser."}
        </p>
        <Button variant="danger" busy={busy} onClick={reset}>{demo ? "Clear sample data" : "Delete all my data"}</Button>
      </div>
    </Card>
  );
}
