"use client";

import { useState } from "react";
import { Eyebrow, GhostButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Chips, Field, LocalNote, TextArea, TextInput, fmtMoney, num } from "@/components/os";
import { Icon } from "@/components/icons";
import { DEFAULT_PLAN, SESSIONS, uid, usePlan, type PlanItem, type TradingPlan } from "@/lib/os/store";
import { TRADABLE_ASSETS } from "@/lib/data/universe";

const CURRENCIES = ["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY", "NZD"];

export default function PlanPage() {
  const [plan, save, ready] = usePlan();

  const set = <K extends keyof TradingPlan>(key: K, value: TradingPlan[K]) =>
    save((p) => ({ ...p, [key]: value, updatedAt: Date.now() }));

  if (!ready) return <Skeleton className="mx-auto h-96 max-w-5xl" />;

  const oneR = plan.accountSize ? (plan.accountSize * plan.riskPerTradePct) / 100 : null;
  const dailyLimit = plan.accountSize ? (plan.accountSize * plan.maxDailyLossPct) / 100 : null;
  const dailyLimitR = plan.riskPerTradePct > 0 ? plan.maxDailyLossPct / plan.riskPerTradePct : null;
  const groups = Array.from(new Set(TRADABLE_ASSETS.map((a) => a.group)));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading
        title="My Trading Plan"
        subtitle="Written on a calm day, followed on every day. The journal, the Today screen and the Reset Room all hold you to it."
      />

      {/* --------------------------------- RISK --------------------------------- */}
      <Panel className="p-5">
        <Eyebrow className="mb-4">Account & risk</Eyebrow>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Account size" hint="Leave blank to track limits in R only.">
            <NumberBox value={plan.accountSize} onChange={(v) => set("accountSize", v)} placeholder="e.g. 10000" />
          </Field>
          <Field label="Account currency">
            <select value={plan.accountCurrency} onChange={(e) => set("accountCurrency", e.target.value)} className="w-full px-3 py-2 text-sm">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Risk per trade %" hint={oneR != null ? `1R = ${fmtMoney(oneR, plan.accountCurrency, false)}` : "1R = this share of the account"}>
            <NumberBox value={plan.riskPerTradePct} onChange={(v) => set("riskPerTradePct", v ?? DEFAULT_PLAN.riskPerTradePct)} />
          </Field>
          <Field label="Minimum R:R" hint="Below this, the trade does not qualify.">
            <NumberBox value={plan.minRR} onChange={(v) => set("minRR", v ?? DEFAULT_PLAN.minRR)} />
          </Field>
          <Field label="Max trades per day">
            <NumberBox value={plan.maxTradesPerDay} onChange={(v) => set("maxTradesPerDay", Math.max(0, Math.round(v ?? 0)))} />
          </Field>
          <Field
            label="Daily loss limit %"
            hint={`${dailyLimit != null ? `${fmtMoney(dailyLimit, plan.accountCurrency, false)} · ` : ""}${dailyLimitR != null ? `${dailyLimitR.toFixed(1)}R` : ""}`}
          >
            <NumberBox value={plan.maxDailyLossPct} onChange={(v) => set("maxDailyLossPct", v ?? 0)} />
          </Field>
          <Field label="Losses in a row before a break">
            <NumberBox value={plan.maxConsecutiveLosses} onChange={(v) => set("maxConsecutiveLosses", Math.max(1, Math.round(v ?? 1)))} />
          </Field>
          <Field label="Cool-down (minutes)">
            <NumberBox value={plan.cooldownMinutes} onChange={(v) => set("cooldownMinutes", Math.max(1, Math.round(v ?? 1)))} />
          </Field>
        </div>
        {plan.riskPerTradePct > 2 ? (
          <p className="mt-4 border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-gold">
            {plan.riskPerTradePct}% per trade means a ten-trade losing streak — normal for most strategies — costs about{" "}
            {Math.round((1 - Math.pow(1 - plan.riskPerTradePct / 100, 10)) * 100)}% of the account.
          </p>
        ) : null}
      </Panel>

      {/* ------------------------------ WHAT I TRADE ----------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <Eyebrow className="mb-3">Sessions I trade</Eyebrow>
          <Chips
            options={SESSIONS}
            selected={plan.sessions as (typeof SESSIONS)[number][]}
            onToggle={(s) => set("sessions", plan.sessions.includes(s) ? plan.sessions.filter((x) => x !== s) : [...plan.sessions, s])}
          />
          <Eyebrow className="mb-3 mt-6">Strategies I trade</Eyebrow>
          <TagList
            values={plan.strategies}
            onChange={(v) => set("strategies", v.length ? v : DEFAULT_PLAN.strategies)}
            placeholder="Add a strategy"
          />
        </Panel>

        <Panel className="p-5">
          <Eyebrow className="mb-3">My markets</Eyebrow>
          <p className="mb-3 text-xs text-faint">A short list traded well beats every pair traded badly.</p>
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-faint">{g}</div>
                <Chips
                  options={TRADABLE_ASSETS.filter((a) => a.group === g).map((a) => a.symbol)}
                  selected={plan.markets}
                  onToggle={(s) => set("markets", plan.markets.includes(s) ? plan.markets.filter((x) => x !== s) : [...plan.markets, s])}
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ------------------------------- CHECKLIST ------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <Eyebrow className="mb-1">Pre-trade checklist</Eyebrow>
          <p className="mb-4 text-xs text-faint">Ticked on every trade you log. If one box is empty, so is the trade.</p>
          <ItemList items={plan.checklist} onChange={(v) => set("checklist", v)} placeholder="Add a checklist item" prefix="c" />
        </Panel>
        <Panel className="p-5">
          <Eyebrow className="mb-1">My rules — the non-negotiables</Eyebrow>
          <p className="mb-4 text-xs text-faint">Specific and binary: you either followed it or you did not.</p>
          <ItemList items={plan.rules} onChange={(v) => set("rules", v)} placeholder="Add a rule" prefix="r" numbered />
        </Panel>
      </div>

      <Panel className="p-5">
        <Eyebrow className="mb-1">Why I trade</Eyebrow>
        <p className="mb-3 text-xs text-faint">Shown in the Reset Room when you need reminding. Make it personal.</p>
        <TextArea
          value={plan.whyITrade}
          onChange={(v) => set("whyITrade", v)}
          rows={4}
          placeholder="Who is this for? What does consistent trading change in your life?"
        />
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LocalNote />
        <GhostButton
          onClick={() => {
            if (window.confirm("Reset the plan to the defaults? Your journal is not affected.")) save({ ...DEFAULT_PLAN, updatedAt: Date.now() });
          }}
        >
          Reset to defaults
        </GhostButton>
      </div>
    </div>
  );
}

/** A number box that keeps what is typed while typing, and saves only numbers. */
function NumberBox({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  return (
    <TextInput
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={(v) => {
        setText(v);
        const n = num(v);
        if (n != null || !v.trim()) onChange(n);
      }}
    />
  );
}

function ItemList({
  items, onChange, placeholder, prefix, numbered = false,
}: {
  items: PlanItem[];
  onChange: (v: PlanItem[]) => void;
  placeholder: string;
  prefix: string;
  numbered?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, { id: uid(prefix), text: draft.trim() }]);
    setDraft("");
  };
  return (
    <div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right font-display text-[11px] font-bold text-gold">{numbered ? `${i + 1}.` : "□"}</span>
            <input
              value={item.text}
              onChange={(e) => onChange(items.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)))}
              className="flex-1 border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-hairline focus:bg-ink"
            />
            <button
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
              className="p-1 text-faint hover:text-bear"
              aria-label="Remove"
            >
              <Icon.trash className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm"
        />
        <GhostButton onClick={add} disabled={!draft.trim()}><Icon.plus className="h-4 w-4" /> Add</GhostButton>
      </div>
    </div>
  );
}

function TagList({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5 border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-gold/70 hover:text-bear">×</button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm"
        />
        <GhostButton onClick={add} disabled={!draft.trim()}><Icon.plus className="h-4 w-4" /> Add</GhostButton>
      </div>
    </div>
  );
}
