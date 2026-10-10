import { useState, type FormEvent } from "react";
import { useStore } from "@/data/store";
import { checkAudience, fmtCount, platformInfo, PLATFORMS, platformSeries, readingOn } from "@/lib/calc/audience";
import { fmtDate } from "@/lib/dates";
import { num } from "@/lib/format";
import type { AudienceEntry, AudiencePlatform } from "@/lib/types";
import { useFeedback } from "../feedback";
import { Button, Field, Input, NumberInput } from "../ui";
import { useSubmit } from "./body";

const blank = (): Record<AudiencePlatform, string> => ({ instagram: "", youtube: "", skool: "" });

function parseCount(raw: string, label: string): number {
  const n = num(raw.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} can't be negative.`);
  if (!Number.isInteger(n)) throw new Error(`${label} must be a whole number.`);
  if (n > 1_000_000_000) throw new Error(`${label} looks too large — check for extra digits.`);
  return n;
}

/** Today's totals for any of the three platforms. Blank fields are left as they were. */
export function AudienceForm({ initial, onDone }: { initial?: AudienceEntry; onDone?: () => void }) {
  const { data, today, upsert, update } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(initial?.recorded_on ?? today);
  const [counts, setCounts] = useState(() => {
    const c = blank();
    if (initial) c[initial.platform] = String(initial.count);
    return c;
  });
  const [note, setNote] = useState(initial?.note ?? "");
  const shown = initial ? PLATFORMS.filter((p) => p.key === initial.platform) : PLATFORMS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (date > today) throw new Error("You can't record counts for a future date.");
      const filled = shown.filter((p) => counts[p.key].trim() !== "");
      if (!filled.length) throw new Error("Enter at least one count.");
      const rows = filled.map((p) => ({ platform: p.key, count: parseCount(counts[p.key], `${p.name} ${p.unit}`) }));
      const reasons = rows.flatMap((r) => checkAudience(r.count, date, r.platform, data.audience, initial?.id).reasons.map((x) => `${platformInfo(r.platform).name}: ${x}`));
      if (reasons.length) {
        const ok = await confirm({
          title: "Double-check these numbers",
          body: <><ul className="list-disc space-y-1 pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul><p className="mt-2">If one is a typo, go back and fix it — milestones use these readings.</p></>,
          confirmLabel: "They're correct — save",
        });
        if (!ok) return;
      }
      const n = note.trim() || null;
      if (initial) {
        await update("audience", initial.id, { recorded_on: date, count: rows[0].count, note: n });
      } else {
        // One reading per platform per day: saving again on the same day replaces it.
        await Promise.all(rows.map((r) => upsert("audience", { ...r, recorded_on: date, note: n }, "platform,recorded_on")));
        setCounts(blank());
        setNote("");
      }
      onDone?.();
      return initial ? "Reading updated." : `Saved ${rows.map((r) => `${fmtCount(r.count)} ${platformInfo(r.platform).name}`).join(", ")}.`;
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={initial ? "Edit audience reading" : "Audience form"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((p) => {
          const series = platformSeries(data.audience, p.key).filter((r) => !initial || r.date !== initial.recorded_on);
          const sameDay = series.find((r) => r.date === date);
          const last = readingOn(series.filter((r) => r.date !== date), date);
          const hint = sameDay && !initial
            ? `${fmtCount(sameDay.count)} already recorded for this date — saving replaces it.`
            : last ? `Last: ${fmtCount(last.count)} on ${fmtDate(last.date)}` : "First reading";
          return (
            <Field key={p.key} label={`${p.name} ${p.unit}`} hint={hint}>
              <NumberInput value={counts[p.key]} onChange={(v) => setCounts((c) => ({ ...c, [p.key]: v }))}
                step="1" min="0" inputMode="numeric" placeholder="0" aria-label={`${p.name} ${p.unit}`} />
            </Field>
          );
        })}
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Reading date" /></Field>
        <Field label="Note" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="optional — e.g. viral reel, launch week" /></Field>
      </div>
      <p className="text-[12px] text-faint">Enter the total shown on each platform. Leave a box empty to skip it.</p>
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save changes" : "Save audience"}</Button>
    </form>
  );
}
