import { useEffect, useState } from "react";
import type { Decision, OrderType, PickupType } from "../lib/types";
import { useStore } from "../state/store";
import { Button, Field, NumberInput, Segmented, Sheet, TextInput } from "./ui";

/** Pre-fill handed over from a completed analysis. */
export interface EarningsSeed {
  payout: number | null;
  miles: number | null;
  minutes: number | null;
  store: PickupType;
  storeLabel: string | null;
  type: OrderType;
  decision: Decision | null;
  score: number | null;
}

const blank = (store: PickupType): EarningsSeed => ({
  payout: null,
  miles: null,
  minutes: null,
  store,
  storeLabel: null,
  type: "Delivery",
  decision: null,
  score: null,
});

export function AddEarningsSheet({
  open,
  seed,
  onClose,
  onSaved,
}: {
  open: boolean;
  seed: EarningsSeed | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addOrder, settings, updateSettings } = useStore();
  const [form, setForm] = useState<EarningsSeed>(seed ?? blank(settings.defaultPickupType));
  const [label, setLabel] = useState(seed?.storeLabel ?? "");

  useEffect(() => {
    if (!open) return;
    setForm(seed ?? blank(settings.defaultPickupType));
    setLabel(seed?.storeLabel ?? "");
  }, [open, seed, settings.defaultPickupType]);

  const valid = form.payout !== null && form.payout > 0;

  const save = () => {
    if (!valid) return;
    addOrder({
      completedAt: new Date().toISOString(),
      payout: form.payout!,
      miles: form.miles,
      minutes: form.minutes,
      store: form.store,
      storeLabel: label.trim() ? label.trim() : null,
      type: form.type,
      decision: form.decision,
      score: form.score,
      notes: null,
    });
    if (form.store !== settings.defaultPickupType) updateSettings({ defaultPickupType: form.store });
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add earnings">
      <div className="space-y-4">
        <Field label="Amount earned">
          <NumberInput
            value={form.payout}
            onValueChange={(payout) => setForm((f) => ({ ...f, payout }))}
            prefix="$"
            placeholder="0.00"
            step="0.01"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Miles">
            <NumberInput
              value={form.miles}
              onValueChange={(miles) => setForm((f) => ({ ...f, miles }))}
              suffix="mi"
              placeholder="—"
              step="0.1"
            />
          </Field>
          <Field label="Time">
            <NumberInput
              value={form.minutes}
              onValueChange={(minutes) => setForm((f) => ({ ...f, minutes }))}
              suffix="min"
              placeholder="—"
              step="1"
            />
          </Field>
        </div>

        <Field label="Store">
          <Segmented
            value={form.store}
            onChange={(store) => setForm((f) => ({ ...f, store }))}
            options={[
              { value: "Walmart" as PickupType, label: "Walmart" },
              { value: "Sam's Club" as PickupType, label: "Sam's Club" },
            ]}
          />
        </Field>

        <Field label="Store name or number" hint="Optional — lets the Stats tab break performance down by store.">
          <TextInput value={label} onValueChange={setLabel} placeholder="Walmart #1234" />
        </Field>

        <Field label="Order type">
          <Segmented
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
            options={[
              { value: "Delivery" as OrderType, label: "Delivery" },
              { value: "Shopping" as OrderType, label: "Shopping" },
            ]}
          />
        </Field>

        <Button size="lg" full onClick={save} disabled={!valid}>
          SAVE ORDER
        </Button>
        <p className="text-center text-xs text-mute">Miles and time are optional, but they power your $/mile and hourly stats.</p>
      </div>
    </Sheet>
  );
}
