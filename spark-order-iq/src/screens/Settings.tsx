import { useRef, useState } from "react";
import { Header } from "../components/Header";
import { Banner, Button, Card, Field, NumberInput, SectionLabel, Sheet, TextInput, Toggle } from "../components/ui";
import { exportData, parseImport } from "../lib/storage";
import { GOAL_PRESETS, RULE_META } from "../lib/settings";
import type { RuleKey, ScoreKey, VisionProviderId } from "../lib/types";
import { providerList } from "../lib/vision";
import { useStore } from "../state/store";

const WEIGHT_LABELS: Record<ScoreKey, string> = {
  pay: "Pay",
  distance: "Distance",
  hourly: "Hourly",
  complexity: "Complexity",
  goal: "Goal progress",
};

const UNIT_ADORNMENT: Record<string, { prefix?: string; suffix?: string }> = {
  money: { prefix: "$" },
  perMile: { prefix: "$", suffix: "/mile" },
  hourly: { prefix: "$", suffix: "/hour" },
  miles: { suffix: "miles" },
  count: { suffix: "items" },
};

export function SettingsScreen() {
  const { settings, updateSettings, replaceSettings, orders, replaceOrders, loadSampleData, removeSampleData, hasSampleData, eraseEverything } =
    useStore();
  const [confirmErase, setConfirmErase] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const setRule = (key: RuleKey, patch: Partial<{ enabled: boolean; value: number }>) => {
    const current = settings.rules[key];
    updateSettings({ rules: { ...settings.rules, [key]: { ...current, ...patch } } });
  };

  const doExport = () => {
    const blob = new Blob([exportData(settings, orders)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spark-order-iq-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File | null | undefined) => {
    if (!file) return;
    const result = parseImport(await file.text());
    if (result.error) {
      setImportMessage(result.error);
      return;
    }
    if (result.settings) replaceSettings(result.settings);
    if (result.orders) replaceOrders(result.orders);
    setImportMessage(`Imported ${result.orders?.length ?? 0} orders.`);
  };

  return (
    <div className="anim-rise pb-6">
      <Header title="SETTINGS" subtitle="Everything stays on this device" />

      <SectionLabel>Goals</SectionLabel>
      <Card>
        <div className="space-y-4">
          <Field label="Daily goal">
            <div className="grid grid-cols-5 gap-1.5">
              {GOAL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => updateSettings({ dailyGoal: preset })}
                  className={`tnum h-11 rounded-lg border text-sm font-bold ${
                    settings.dailyGoal === preset ? "border-gold bg-gold text-ink" : "border-line bg-panel-2"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <NumberInput value={settings.dailyGoal} onValueChange={(v) => updateSettings({ dailyGoal: v ?? 0 })} prefix="$" step="5" />
            </div>
          </Field>
          <Field label="Weekly goal">
            <NumberInput value={settings.weeklyGoal} onValueChange={(v) => updateSettings({ weeklyGoal: v ?? 0 })} prefix="$" step="25" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Typical stop time" hint="Projections stop here.">
              <NumberInput
                value={settings.dayEndHour}
                onValueChange={(v) => updateSettings({ dayEndHour: Math.min(Math.max(v ?? 21, 0), 23) })}
                suffix=":00"
                step="1"
              />
            </Field>
            <Field label="Typical day" hint="Caps how far a pace is carried.">
              <NumberInput
                value={settings.typicalShiftHours}
                onValueChange={(v) => updateSettings({ typicalShiftHours: Math.min(Math.max(v ?? 8, 1), 16) })}
                suffix="hours"
                step="0.5"
              />
            </Field>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <SectionLabel>Cost &amp; time assumptions</SectionLabel>
        <Card>
          <div className="space-y-4">
            <Field label="Vehicle cost per mile" hint="Gas, tires, maintenance, depreciation — your number, not a published rate.">
              <NumberInput
                value={settings.vehicleCostPerMile}
                onValueChange={(v) => updateSettings({ vehicleCostPerMile: v ?? 0 })}
                prefix="$"
                suffix="/mile"
                step="0.05"
              />
            </Field>
            <Field label="Minutes per mile to the store" hint="How long your deadhead drive takes. 2.5 ≈ 24 mph on surface streets.">
              <NumberInput
                value={settings.pickupMinutesPerMile}
                onValueChange={(v) => updateSettings({ pickupMinutesPerMile: v ?? 0 })}
                suffix="min/mile"
                step="0.1"
              />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-panel-2 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Count pickup time in hourly</div>
                <p className="mt-0.5 text-xs text-mute">Offer time rarely includes your drive to the store.</p>
              </div>
              <Toggle
                checked={settings.includePickupTimeInHourly}
                onChange={(includePickupTimeInHourly) => updateSettings({ includePickupTimeInHourly })}
                label="Count pickup time in hourly"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <SectionLabel>My Spark rules</SectionLabel>
        <div className="space-y-2">
          {(Object.keys(RULE_META) as RuleKey[]).map((key) => {
            const meta = RULE_META[key];
            const rule = settings.rules[key];
            const adornment = UNIT_ADORNMENT[meta.unit] ?? {};
            return (
              <Card key={key}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{meta.label}</div>
                    <p className="mt-0.5 text-xs text-mute">{meta.help}</p>
                  </div>
                  <Toggle checked={rule.enabled} onChange={(enabled) => setRule(key, { enabled })} label={meta.label} />
                </div>
                <div className={`mt-3 ${rule.enabled ? "" : "opacity-50"}`}>
                  <NumberInput
                    value={rule.value}
                    onValueChange={(value) => setRule(key, { value: value ?? 0 })}
                    prefix={adornment.prefix}
                    suffix={adornment.suffix}
                    step={String(meta.step)}
                  />
                </div>
              </Card>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-mute">
          Switched-off rules never block a decision. Their values still act as benchmarks in the score.
        </p>
      </div>

      <div className="mt-5">
        <SectionLabel>Score weights</SectionLabel>
        <Card>
          <div className="space-y-3">
            {(Object.keys(WEIGHT_LABELS) as ScoreKey[]).map((key) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm font-semibold">{WEIGHT_LABELS[key]}</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={settings.weights[key]}
                  onChange={(e) => updateSettings({ weights: { ...settings.weights, [key]: Number(e.target.value) } })}
                  className="h-2 flex-1 accent-[#f0b93b]"
                />
                <span className="tnum w-8 text-right text-sm font-bold">{settings.weights[key]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">
            Scores are normalised, so the total doesn't have to add up to 100. A weight of 0 drops that factor.
          </p>
        </Card>
      </div>

      <div className="mt-5">
        <SectionLabel>Screenshot reader</SectionLabel>
        <Card>
          <div className="space-y-2">
            {providerList().map((provider) => {
              const active = settings.visionProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => updateSettings({ visionProvider: provider.id as VisionProviderId })}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    active ? "border-gold bg-gold/10" : "border-line bg-panel-2"
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? "text-gold" : ""}`}>{provider.label}</div>
                  <p className="mt-0.5 text-xs text-mute">{provider.description}</p>
                </button>
              );
            })}
          </div>

          {settings.visionProvider === "claude-vision" ? (
            <div className="mt-4 space-y-3">
              <Field label="Anthropic API key" hint="Stored on this device only. Screenshots are sent to Anthropic when this reader is active.">
                <TextInput
                  value={settings.anthropicApiKey}
                  onValueChange={(anthropicApiKey) => updateSettings({ anthropicApiKey })}
                  placeholder="sk-ant-…"
                  type="password"
                  autoComplete="off"
                />
              </Field>
              <Banner tone="warn">
                A key in a browser can be read by anything with access to this device. Use a key scoped to this and nothing
                else.
              </Banner>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-5">
        <SectionLabel>Privacy &amp; display</SectionLabel>
        <Card>
          <div className="space-y-3">
            <ToggleRow
              title="Keep the screenshot after reading"
              help="Off by default. The image is held in memory only and never written to storage either way."
              checked={settings.keepScreenshots}
              onChange={(keepScreenshots) => updateSettings({ keepScreenshots })}
            />
            <ToggleRow
              title="Reduce motion"
              help="Turns off the transitions."
              checked={settings.reducedMotion}
              onChange={(reducedMotion) => updateSettings({ reducedMotion })}
            />
          </div>
        </Card>
      </div>

      {settings.savedStores.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>Saved pickup locations</SectionLabel>
          <Card>
            <div className="space-y-2">
              {settings.savedStores.map((store) => (
                <div key={store.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{store.label}</div>
                    <div className="tnum text-xs text-mute">
                      {store.type} · {store.lat.toFixed(4)}, {store.lon.toFixed(4)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-skip"
                    onClick={() => updateSettings({ savedStores: settings.savedStores.filter((s) => s.id !== store.id) })}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="mt-5">
        <SectionLabel>Data</SectionLabel>
        <Card>
          <div className="space-y-2">
            <Button variant="secondary" full onClick={doExport}>
              Export my data (JSON)
            </Button>
            <Button variant="secondary" full onClick={() => importRef.current?.click()}>
              Import from a backup
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void doImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {hasSampleData ? (
              <Button variant="secondary" full onClick={removeSampleData}>
                Clear sample data
              </Button>
            ) : (
              <Button variant="secondary" full onClick={loadSampleData}>
                Load sample data
              </Button>
            )}
            <Button variant="danger" full onClick={() => setConfirmErase(true)}>
              Delete all data
            </Button>
          </div>
          {importMessage ? (
            <div className="mt-3">
              <Banner tone="info">{importMessage}</Banner>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <div className="label">About</div>
          <p className="mt-2 text-xs leading-relaxed text-mute">
            Spark Order IQ is a decision-support tool. It reads only the screenshots you give it, scores them against the
            rules you set, and leaves every accept-or-decline to you. It does not connect to Walmart Spark, and it is not
            affiliated with Walmart.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-mute">
            Payout, mileage, hourly and profit figures are estimates built from the numbers you supply.
          </p>
        </Card>
      </div>

      <Sheet open={confirmErase} onClose={() => setConfirmErase(false)} title="Delete all data?">
        <p className="text-sm text-mute">
          This removes every logged order, your rules, your goals and your saved pickup locations from this device. It
          can't be undone. Export first if you want a copy.
        </p>
        <div className="mt-5 space-y-2">
          <Button
            variant="danger"
            full
            onClick={() => {
              eraseEverything();
              setConfirmErase(false);
            }}
          >
            Yes, delete everything
          </Button>
          <Button variant="secondary" full onClick={() => setConfirmErase(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function ToggleRow({
  title,
  help,
  checked,
  onChange,
}: {
  title: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-panel-2 px-4 py-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-xs text-mute">{help}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
