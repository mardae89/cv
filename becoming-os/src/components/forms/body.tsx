import { Camera } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { StorageError } from "@/data/docstore";
import { newId } from "@/data/engine";
import { useStore } from "@/data/store";
import { checkDate, checkWeight } from "@/lib/calc/validation";
import { fmtDate } from "@/lib/dates";
import { errorMessage, num } from "@/lib/format";
import type { DailyCheckin, PainType, ProgressPhoto, SymptomLog, WeightEntry } from "@/lib/types";
import { useFeedback } from "../feedback";
import { forgetPhoto, rememberPhoto } from "../Photo";
import { Button, Field, Input, Notice, NumberInput, Scale, Segmented, Select, Textarea } from "../ui";

export function useSubmit() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | void>) => {
    if (busy) return; // guards double taps / duplicate submissions
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) toast(msg);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function WeightForm({ initial, onDone }: { initial?: WeightEntry; onDone?: () => void }) {
  const { data, today, upsert, update } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(initial?.entry_date ?? today);
  const [weight, setWeight] = useState(initial?.weight != null ? String(initial.weight) : "");
  const [waist, setWaist] = useState(initial?.waist_in != null ? String(initial.waist_in) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const existing = data.weights.find((w) => w.entry_date === date && w.id !== initial?.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!weight && !waist) throw new Error("Enter a weight or a waist measurement.");
      const d = checkDate(date, today);
      if (!d.ok) throw new Error("You can't log a weigh-in for a future date.");
      const w = weight ? num(weight) : null;
      if (w !== null && (w < 70 || w > 700)) throw new Error("Weight must be between 70 and 700 lb.");
      let flagged = false;
      if (w !== null) {
        const c = checkWeight(w, date, data.weights, data.goals?.start_weight ?? null, initial?.id ?? existing?.id);
        if (!c.ok) {
          const ok = await confirm({
            title: "Double-check this weigh-in",
            body: <><p>{w} lb is {c.reasons.join(" ")}</p><p className="mt-2">If it's a typo, go back and fix it. Milestones use your 7-day average, but a wrong number still skews it.</p></>,
            confirmLabel: "It's correct — save",
          });
          if (!ok) return;
          flagged = true;
        }
      }
      const row = { entry_date: date, weight: w, waist_in: waist ? num(waist) : null, note: note.trim() || null, flagged };
      if (initial) await update("weights", initial.id, row);
      else await upsert("weights", row, "user_id,entry_date");
      if (!initial) {
        setWeight("");
        setWaist("");
        setNote("");
      }
      onDone?.();
      return initial ? "Weigh-in updated." : existing ? `Replaced the weigh-in for ${fmtDate(date)}.` : "Weigh-in saved.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Weigh-in form">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight"><NumberInput value={weight} onChange={setWeight} suffix="lb" placeholder="0.0" autoFocus={!initial} aria-label="Weight in pounds" /></Field>
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Waist (optional)"><NumberInput value={waist} onChange={setWaist} suffix="in" /></Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="optional" /></Field>
      </div>
      {existing && !initial && <p className="text-[12px] text-faint">You already logged {existing.weight} lb on this date — saving replaces it (one weigh-in per day).</p>}
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save changes" : "Save weigh-in"}</Button>
    </form>
  );
}

export function CheckinForm({ initial, onDone }: { initial?: DailyCheckin; onDone?: () => void }) {
  const { data, today, upsert, update } = useStore();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(initial?.checkin_date ?? today);
  const base = initial ?? data.checkins.find((c) => c.checkin_date === date);
  const [sleep, setSleep] = useState(base?.sleep_hours != null ? String(base.sleep_hours) : "");
  const [quality, setQuality] = useState<number | null>(base?.sleep_quality ?? null);
  const [energy, setEnergy] = useState<number | null>(base?.energy ?? null);
  const [soreness, setSoreness] = useState<number | null>(base?.soreness ?? null);
  const [fatigue, setFatigue] = useState<number | null>(base?.fatigue ?? null);
  const [water, setWater] = useState(base?.water_oz != null ? String(base.water_oz) : "");
  const [note, setNote] = useState(base?.note ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (date > today) throw new Error("You can't log a check-in for a future date.");
      if (sleep && (num(sleep) < 0 || num(sleep) > 24)) throw new Error("Sleep must be between 0 and 24 hours.");
      const row = {
        checkin_date: date, sleep_hours: sleep ? num(sleep) : null, sleep_quality: quality, energy, soreness, fatigue,
        water_oz: water ? num(water) : null, note: note.trim() || null,
      };
      if (initial) await update("checkins", initial.id, row);
      else await upsert("checkins", row, "user_id,checkin_date");
      onDone?.();
      return "Check-in saved.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Check-in form">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} disabled={!!initial} /></Field>
        <Field label="Sleep"><NumberInput value={sleep} onChange={setSleep} suffix="hours" /></Field>
      </div>
      <Scale label="Sleep quality" value={quality} onChange={setQuality} low="Poor" high="Great" />
      <Scale label="Energy" value={energy} onChange={setEnergy} low="Drained" high="Charged" />
      <Scale label="Soreness" value={soreness} onChange={setSoreness} low="None" high="Severe" />
      <Scale label="Fatigue" value={fatigue} onChange={setFatigue} low="Fresh" high="Exhausted" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Water"><NumberInput value={water} onChange={setWater} suffix="oz" /></Field>
        <Field label="Notes"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="optional" /></Field>
      </div>
      <Button type="submit" busy={busy} className="w-full">{initial || base ? "Update check-in" : "Save check-in"}</Button>
    </form>
  );
}

const PAIN_TYPES: PainType[] = ["sharp", "dull", "aching", "burning", "stiffness", "swelling", "other"];

export function SymptomForm({ initial, onDone }: { initial?: SymptomLog; onDone?: () => void }) {
  const { today, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(initial?.log_date ?? today);
  const [area, setArea] = useState(initial?.body_area ?? "Ankle");
  const [side, setSide] = useState<SymptomLog["side"]>(initial?.side ?? "right");
  const [pain, setPain] = useState<number | null>(initial?.pain_level ?? null);
  const [type, setType] = useState<PainType | "">(initial?.pain_type ?? "");
  const [during, setDuring] = useState<SymptomLog["during"] | "">(initial?.during ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (pain === null) throw new Error("Choose a pain level from 0 to 10.");
      if (date > today) throw new Error("You can't log symptoms for a future date.");
      const row = { log_date: date, body_area: area.trim() || "Ankle", side, pain_level: pain, pain_type: type || null, during: during || null, note: note.trim() || null };
      if (initial) await update("symptoms", initial.id, row);
      else await insert("symptoms", row);
      if (!initial) {
        setPain(null);
        setNote("");
      }
      onDone?.();
      return "Symptoms logged. Thank you for tracking honestly.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Where"><Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={60} /></Field>
      </div>
      <Segmented value={side ?? "n/a"} onChange={(v) => setSide(v)} className="w-full" options={[
        { value: "left", label: "Left" }, { value: "right", label: "Right" }, { value: "both", label: "Both" }, { value: "n/a", label: "N/A" }]} />
      <Scale label="Pain (0 = none, 10 = worst)" value={pain} onChange={setPain} min={0} max={10} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as PainType)}>
            <option value="">—</option>
            {PAIN_TYPES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="When">
          <Select value={during ?? ""} onChange={(e) => setDuring(e.target.value as SymptomLog["during"])}>
            <option value="">—</option>
            {["rest", "walking", "running", "training", "stairs", "morning", "other"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What makes it better or worse?" /></Field>
      {(type === "sharp" || (pain ?? 0) >= 5) && (
        <Notice tone="alert" title="Consider getting this checked">
          Sharp or significant pain should be assessed by a doctor or physical therapist, especially before running. This app can't diagnose or clear an injury.
        </Notice>
      )}
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save changes" : "Log symptoms"}</Button>
    </form>
  );
}

/** Each photo is stored as one record, which must stay under 240K characters. */
const PHOTO_CHARS = 230_000;

async function decode(file: File): Promise<{ img: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { img: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  } catch {
    // Older browsers: fall back to an <img>, which also honours the photo's rotation.
    const url = URL.createObjectURL(file);
    try {
      const el = new Image();
      el.src = url;
      await el.decode();
      return { img: el, width: el.naturalWidth, height: el.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("This photo's format can't be read here. Try a JPEG or PNG.");
    }
  }
}

/** Downscales (long edge 1280px to start) and re-encodes as JPEG, lowering quality, then size, until it fits. */
async function toStoredJpeg(file: File): Promise<string> {
  const src = await decode(file);
  try {
    if (!src.width || !src.height) throw new Error("That image is empty.");
    let edge = Math.min(1280, Math.max(src.width, src.height));
    for (;;) {
      const scale = edge / Math.max(src.width, src.height);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(src.width * scale));
      c.height = Math.max(1, Math.round(src.height * scale));
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff"; // JPEG has no transparency
      g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingQuality = "high";
      g.drawImage(src.img, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.75, 0.65, 0.55]) {
        const url = c.toDataURL("image/jpeg", q);
        if (url.length < PHOTO_CHARS) return url;
      }
      if (edge <= 320) throw new Error("That photo couldn't be made small enough to store. Try a different one.");
      edge = Math.max(320, Math.round(edge * 0.8));
    }
  } finally {
    src.done();
  }
}

export function PhotoUpload({ onDone }: { onDone?: () => void }) {
  const { host, engine, today, insert } = useStore();
  const { busy, run } = useSubmit();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(today);
  const [pose, setPose] = useState<ProgressPhoto["pose"]>("front");
  const [caption, setCaption] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!file) throw new Error("Choose a photo first.");
      if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
      const dataUrl = await toStoredJpeg(file);
      // The image is stored first, under the photo's own id; the record follows.
      const id = newId();
      try {
        await engine.putImage(id, dataUrl);
        await insert("photos", { id, taken_on: date, storage_path: id, pose, caption: caption.trim() || null });
      } catch (err) {
        // Roll back so a failed upload leaves nothing half-saved (the record may
        // already be on screen, waiting on storage).
        if (engine.getState().tables.photos.some((p) => p.id === id)) await engine.remove("photos", id).catch(() => undefined);
        await engine.deleteImage(id).catch(() => undefined);
        forgetPhoto(id);
        const retrying = err instanceof StorageError && (err.code === "unavailable" || err.code === "resource_exhausted");
        throw retrying ? new Error("Couldn't save the photo, so nothing was kept. Try again in a moment.") : err;
      }
      rememberPhoto(id, dataUrl);
      setFile(null);
      setCaption("");
      if (input.current) input.current.value = "";
      onDone?.();
      return "Photo saved privately.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-mute hover:border-gold/60">
        <Camera className="h-6 w-6 text-gold" />
        {file ? <span className="text-bone">{file.name}</span> : <span>Take or choose a progress photo</span>}
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Pose">
          <Select value={pose ?? "front"} onChange={(e) => setPose(e.target.value as ProgressPhoto["pose"])}>
            <option value="front">Front</option><option value="side">Side</option><option value="back">Back</option><option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <Field label="Caption"><Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="optional" /></Field>
      <p className="text-[11.5px] text-faint">
        {host.mode === "shared-page" ? "Stored privately in your own space on this page. Photos aren't shared with your partner." : "Stored privately in this browser only."}
      </p>
      <Button type="submit" busy={busy} className="w-full" disabled={!file}>Upload photo</Button>
    </form>
  );
}
