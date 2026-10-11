import { useState, type FormEvent } from "react";
import { useStore } from "@/data/store";
import { num } from "@/lib/format";
import type { JournalEntry, Meal, NutritionLog } from "@/lib/types";
import { useFeedback } from "../feedback";
import { Button, Field, Input, NumberInput, Segmented, Textarea, Toggle } from "../ui";
import { useSubmit } from "./body";

/** With `onDateChange`, the date follows the caller's (the Log page keeps it in step with the day it shows). */
export function MealForm({ initial, date: shownDate, onDateChange, onDone }: {
  initial?: NutritionLog; date?: string; onDateChange?: (date: string) => void; onDone?: () => void;
}) {
  const { data, today, insert, update } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const [ownDate, setOwnDate] = useState(initial?.log_date ?? shownDate ?? today);
  const date = onDateChange && shownDate ? shownDate : ownDate;
  const setDate = onDateChange ?? setOwnDate;
  const [meal, setMeal] = useState<Meal>(initial?.meal ?? "breakfast");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [cal, setCal] = useState(initial?.calories != null ? String(initial.calories) : "");
  const [protein, setProtein] = useState(initial?.protein_g != null ? String(initial.protein_g) : "");
  const [carbs, setCarbs] = useState(initial?.carbs_g != null ? String(initial.carbs_g) : "");
  const [fat, setFat] = useState(initial?.fat_g != null ? String(initial.fat_g) : "");
  const [note, setNote] = useState(initial?.note ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (date > today) throw new Error("You can't log meals for a future date.");
      if (!desc.trim() && !cal && !protein) throw new Error("Describe the meal or enter at least calories or protein.");
      const row = {
        log_date: date, meal, description: desc.trim() || null, calories: cal ? Math.round(num(cal)) : null,
        protein_g: protein ? num(protein) : null, carbs_g: carbs ? num(carbs) : null, fat_g: fat ? num(fat) : null, note: note.trim() || null,
      };
      const dup = data.nutrition.find((n) => n.id !== initial?.id && n.log_date === date && n.meal === meal &&
        (n.description ?? "") === (row.description ?? "") && n.calories === row.calories);
      if (dup && !initial && !(await confirm({ title: "Possible duplicate", body: "This meal is already logged for that date.", confirmLabel: "Log it again" }))) return;
      if (initial) await update("nutrition", initial.id, row);
      else await insert("nutrition", row);
      if (!initial) {
        setDesc("");
        setCal("");
        setProtein("");
        setCarbs("");
        setFat("");
        setNote("");
      }
      onDone?.();
      return initial ? "Meal updated." : "Meal logged.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented label="Meal" value={meal} onChange={setMeal} className="w-full" size="sm" options={[
        { value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" }, { value: "dinner", label: "Dinner" }, { value: "snack", label: "Snack" }]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="What"><Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} placeholder="e.g. Chicken & rice" /></Field>
        <Field label="Calories (optional)"><NumberInput value={cal} onChange={setCal} suffix="kcal" /></Field>
        <Field label="Protein"><NumberInput value={protein} onChange={setProtein} suffix="g" /></Field>
        <Field label="Carbs"><NumberInput value={carbs} onChange={setCarbs} suffix="g" /></Field>
        <Field label="Fat"><NumberInput value={fat} onChange={setFat} suffix="g" /></Field>
      </div>
      <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="optional" /></Field>
      <p className="text-[11.5px] text-faint">Logging earns the same XP whatever you eat — BECOMING OS never rewards eating less.</p>
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save changes" : "Log meal"}</Button>
    </form>
  );
}

export function JournalForm({ initial, onDone }: { initial?: JournalEntry; onDone?: () => void }) {
  const { today, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [date, setDate] = useState(initial?.entry_date ?? today);
  const [kind, setKind] = useState<JournalEntry["kind"]>(initial?.kind ?? "journal");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [minutes, setMinutes] = useState(initial?.minutes != null ? String(initial.minutes) : "");
  const [shared, setShared] = useState(initial?.shared ?? false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!body.trim()) throw new Error("Write something first.");
      if (date > today) throw new Error("Entries can't be dated in the future.");
      const row = { entry_date: date, kind, title: title.trim() || null, body: body.trim(), minutes: kind === "learning" && minutes ? Math.round(num(minutes)) : null, shared };
      if (initial) await update("journal", initial.id, row);
      else await insert("journal", row);
      if (!initial) {
        setTitle("");
        setBody("");
        setMinutes("");
        setShared(false);
      }
      onDone?.();
      return initial ? "Entry updated." : "Entry saved.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented label="Entry type" value={kind} onChange={setKind} className="w-full" options={[
        { value: "journal", label: "Journal" }, { value: "reflection", label: "Reflection" }, { value: "learning", label: "Learning" }]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        {kind === "learning"
          ? <Field label="Minutes"><NumberInput value={minutes} onChange={setMinutes} suffix="min" /></Field>
          : <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="optional" /></Field>}
      </div>
      {kind === "learning" && <Field label="What did you read or learn?"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field>}
      <Field label={kind === "learning" ? "Notes" : kind === "reflection" ? "Reflection" : "Entry"}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} className="min-h-[140px]" />
      </Field>
      <Toggle checked={shared} onChange={setShared} label="Share this entry with my partner" sub="Private by default. Only this entry is shared." />
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save changes" : "Save entry"}</Button>
    </form>
  );
}
