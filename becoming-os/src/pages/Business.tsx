import { Download, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Chart, ChartCard, GOLD, monthTick, SERIES } from "@/components/charts";
import { useFeedback } from "@/components/feedback";
import { useSubmit } from "@/components/forms/body";
import { PaymentForm, TransactionForm } from "@/components/forms/business";
import { RecordList } from "@/components/RecordList";
import { AudienceCard } from "@/components/cards";
import { Button, Card, cx, EmptyState, Eyebrow, Field, Input, Meter, Notice, NumberInput, PageHeader, Segmented, Select, Sheet, Stat, Table, Textarea } from "@/components/ui";
import { saveFile } from "@/data/host";
import { useStore } from "@/data/store";
import {
  customerStats, dailyRevenue, expensesByCategory, forecast, forecastDefaults, goalStatus, METRIC_LABEL, metricValue,
  monthFinance, monthlyHistory, periodFinance, pipelineStats, receivables, revenueByBusiness, revenueByOffer, salesToClose,
  type Ledger,
} from "@/lib/calc/business";
import { toCSV } from "@/lib/csv";
import { addDays, addMonths, fmtDate, fmtMonth, fmtShort, MISSION_END, MISSION_START, monthEnd, monthStart, weekStart } from "@/lib/dates";
import { errorMessage, money, num, pct, plural, round } from "@/lib/format";
import type { ForecastAssumptions, GoalMetric, Transaction } from "@/lib/types";
import { TransactionList } from "./Log";

export default function Business() {
  const { data, today, host } = useStore();
  const { toast } = useFeedback();
  const [month, setMonth] = useState(monthStart(today));
  const [view, setView] = useState<"earned" | "received">("earned");
  const [add, setAdd] = useState(false);
  const [newBiz, setNewBiz] = useState(false);
  const [goalEdit, setGoalEdit] = useState(false);
  const [gran, setGran] = useState<"day" | "week" | "month">("month");
  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const settings = data.businessSettings ?? { goal_metric: "revenue" as GoalMetric, goal_amount: 10000, goal_deadline: MISSION_END, baseline_revenue: null, baseline_expenses: null };
  const isCurrent = month === monthStart(today);
  const asOf = isCurrent ? today : monthEnd(month);
  const g = goalStatus(l, settings, asOf);
  const m = monthFinance(l, month);
  const cs = customerStats(l, data.customers, month, monthEnd(month));
  const pipe = pipelineStats(data.deals, month, monthEnd(month));
  const openPipe = pipelineStats(data.deals);
  const ar = receivables(l, today);
  const months = [...new Set([MISSION_START, ...data.transactions.map((t) => t.txn_date)].map(monthStart))].sort().reverse();
  if (!months.includes(monthStart(today))) months.unshift(monthStart(today));

  if (!data.businesses.length) {
    return (
      <div>
        <PageHeader eyebrow="Business" title="Command centre" />
        <EmptyState title="Add your first business" action={<Button onClick={() => setNewBiz(true)}>Add business</Button>}>
          Workspaces keep revenue, offers, customers and outreach separate per business. Lost Revenue Group and Exchange Mastery templates are in onboarding — or add any business here.
        </EmptyState>
        <div className="mt-6"><AudienceCard /></div>
        <Sheet open={newBiz} onClose={() => setNewBiz(false)} title="Add business"><BusinessForm onDone={() => setNewBiz(false)} /></Sheet>
      </div>
    );
  }

  const history = monthlyHistory(l, addMonths(monthStart(today), -11) < MISSION_START ? MISSION_START : addMonths(monthStart(today), -11), today)
    .map((h) => ({ date: h.month, revenue: h.revenue, cash: h.cash, profit: h.profit, expenses: h.expenses, recurring: h.recurring }));
  const series = gran === "month" ? history : gran === "week"
    ? Array.from({ length: 12 }, (_, i) => {
        const ws = addDays(weekStart(today), -7 * (11 - i));
        const p = periodFinance(l, ws, addDays(ws, 6));
        return { date: ws, revenue: p.revenue, cash: p.cash, profit: p.profit };
      })
    : dailyRevenue(l, month, asOf).map((d) => ({ date: d.date, revenue: d.revenue, cash: d.cash, profit: round(d.revenue - d.expenses, 2) }));

  // Inside the claude.ai frame, files can only be saved through the page's save dialog.
  const canSave = !host.framed || !!host.downloads;
  /** Offers each non-empty file in turn; if one is declined the rest are skipped. */
  const saveCSVs = async (files: [name: string, rows: Record<string, unknown>[]][]) => {
    const ready = files.filter(([, rows]) => rows.length);
    if (!ready.length) return toast("Nothing to export yet.", "info");
    try {
      for (const [name, rows] of ready) {
        if ((await saveFile(host, name, new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }))) === "declined") return;
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const exportTx = () => {
    const biz = new Map(data.businesses.map((b) => [b.id, b.name]));
    const offers = new Map(data.offers.map((o) => [o.id, o.name]));
    const cust = new Map(data.customers.map((c) => [c.id, c.name]));
    const paid = (id: string) => data.payments.filter((p) => p.transaction_id === id).reduce((s, p) => s + num(p.amount), 0);
    void saveCSVs([[`becoming-os-transactions-${today}.csv`, data.transactions.map((t) => ({
      date: t.txn_date, type: t.kind, business: t.business_id ? biz.get(t.business_id) : "", amount: t.amount,
      cash_collected: t.kind === "sale" ? round(paid(t.id), 2) : "", outstanding: t.kind === "sale" ? round(num(t.amount) - paid(t.id), 2) : "",
      recurring: t.kind === "sale" ? t.recurring : "", offer: t.offer_id ? offers.get(t.offer_id) : "", customer: t.customer_id ? cust.get(t.customer_id) : "",
      lead_source: t.lead_source, expense_category: t.expense_category, description: t.description, notes: t.notes,
    }))], [`becoming-os-payments-${today}.csv`, data.payments.map((p) => ({ paid_on: p.paid_on, amount: p.amount, transaction_id: p.transaction_id, method: p.method }))]]);
  };
  const exportSummary = () => {
    void saveCSVs([[`becoming-os-monthly-summary-${today}.csv`, monthlyHistory(l, MISSION_START < (data.transactions[0]?.txn_date ?? MISSION_START) ? MISSION_START : data.transactions[0]?.txn_date ?? MISSION_START, today).map((h) => ({
      month: h.month.slice(0, 7), gross_sales: h.grossSales, refunds: h.refunds, revenue_earned: h.revenue, cash_collected: h.cashIn,
      cash_net_of_refunds: h.cash, expenses: h.expenses, net_profit: h.profit, recurring_revenue: h.recurring, one_time_revenue: h.oneTime,
      paying_customers: h.payingCustomers, sales: h.salesCount, gig_income: h.gigIncome, personal_income: h.personalIncome, transfers_excluded: h.transfers,
    }))]]);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Business" title="Command centre"
        sub={`Goal: ${money(g.goal)}/month in ${METRIC_LABEL[g.metric].toLowerCase()} by ${fmtDate(settings.goal_deadline ?? MISSION_END)}.`}
        action={<div className="flex flex-wrap gap-2">
          {canSave && <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportTx}>Transactions CSV</Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportSummary}>Summary CSV</Button>
          </>}
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdd(true)}>Record</Button>
        </div>} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto py-2" aria-label="Month">
          {months.map((mm) => <option key={mm} value={mm}>{fmtMonth(mm)}</option>)}
        </Select>
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: "earned", label: "Earned this month" }, { value: "received", label: "Received this month" }]} />
        <button className="py-2 text-[12.5px] text-mute hover:text-gold" onClick={() => setGoalEdit(true)}>Goal settings</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <Eyebrow className="mb-2 text-gold">{fmtMonth(month)} · {METRIC_LABEL[g.metric]}</Eyebrow>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="display-num text-[64px] leading-none">{money(g.value)}</span>
            <span className="text-[14px] text-mute">of {money(g.goal)}</span>
          </div>
          <Meter className="mt-5" value={g.pct} right={pct(g.pct)} label="Monthly goal" markers={[...Array(9)].map((_, i) => ({ at: (i + 1) * 10 }))}
            sub={g.remaining > 0 ? `${money(g.remaining)} remaining · next $1,000 milestone in ${money(g.toNextThousand)}` : "Goal reached this month"} />
          {isCurrent && g.runRate !== null && <p className="mt-2 text-[12px] text-faint">Straight-line estimate at this month's pace: {money(g.runRate)} (estimate, not a forecast of sales).</p>}
          {g.remaining > 0 && salesToClose(g.remaining, data.offers).length > 0 && (
            <div className="mt-4 border-t border-hair pt-3">
              <div className="eyebrow mb-2">To close the gap ({money(g.remaining)}), roughly</div>
              <div className="flex flex-wrap gap-2">
                {salesToClose(g.remaining, data.offers).slice(0, 6).map((s) => (
                  <span key={s.offer.id} className="rounded-full border border-line px-3 py-1 text-[12px] text-mute">
                    <span className="num text-bone">{s.count}</span> × {s.offer.name} ({money(s.offer.price)}{s.offer.billing === "monthly" ? "/mo" : ""})
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-faint">Based on your editable offer prices{g.metric === "profit" ? ", before costs" : ""}. Arithmetic, not a prediction.</p>
            </div>
          )}
        </Card>
        <Card>
          <div className="grid grid-cols-2 gap-5">
            {view === "earned" ? (
              <>
                <Stat label="Revenue earned" value={money(m.revenue)} sub={m.refunds ? `Gross ${money(m.grossSales)} · refunds ${money(m.refunds)}` : `${plural(m.salesCount, "sale")}`} />
                <Stat label="Net profit" value={money(m.profit)} sub={m.revenue > 0 ? `${pct((m.profit / m.revenue) * 100)} margin` : "revenue − expenses"} />
                <Stat label="Expenses" value={money(m.expenses)} />
                <Stat label="Recurring (MRR)" value={money(m.recurring)} sub="recurring revenue earned" />
              </>
            ) : (
              <>
                <Stat label="Cash collected" value={money(m.cashIn)} sub={m.refunds ? `${money(m.cash)} after refunds` : "payments received"} />
                <Stat label="Cash profit" value={money(m.cashProfit)} sub="cash − refunds − expenses" />
                <Stat label="Expenses paid" value={money(m.expenses)} />
                <Stat label="Outstanding (A/R)" value={money(ar.total)} sub={`${plural(ar.open.length, "unpaid sale")} as of today`} />
              </>
            )}
            <Stat label="Paying customers" value={m.payingCustomers} sub={m.unlinkedSales ? `${m.unlinkedSales} sale(s) without a customer` : `${cs.newCustomers} new`} />
            <Stat label="Avg per customer" value={m.arpc !== null ? money(m.arpc) : "—"} />
            <Stat label="Churn" value={cs.churnPct !== null ? pct(cs.churnPct, 1) : "—"} sub={`${cs.churned} churned · retention ${cs.retentionPct !== null ? pct(cs.retentionPct, 1) : "—"}`} />
            <Stat label="Win rate" value={pipe.winRate !== null ? pct(pipe.winRate) : "—"} sub={`${pipe.won} won · ${pipe.lost} lost · ${openPipe.open} open`} />
          </div>
        </Card>
      </div>

      {(m.gigIncome > 0 || m.personalIncome > 0 || m.transfers > 0) && (
        <Notice title="Kept separate from business">
          Gig income {money(m.gigIncome)} · personal income {money(m.personalIncome)} · transfers between your accounts {money(m.transfers)}. None of these count toward revenue, cash collected, profit or the goal.
        </Notice>
      )}

      <ChartCard title="Revenue, cash collected and profit" sub="Three separate measures — never interchangeable"
        action={<Segmented size="sm" value={gran} onChange={setGran} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />}>
        <Chart data={series} x="date" height={260} fmt={(v) => money(v)} yWidth={60} xFmt={gran === "month" ? monthTick : fmtShort}
          series={[{ key: "revenue", label: "Revenue earned", color: SERIES[0], type: "bar" }, { key: "cash", label: "Cash collected", color: SERIES[1], type: "bar" }, { key: "profit", label: "Net profit", color: SERIES[2], type: "bar" }]}
          refs={gran === "month" ? [{ y: g.goal, label: "Goal" }] : undefined} />
      </ChartCard>

      <AudienceCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Recurring revenue by month" sub="Recurring sales earned each month">
          <Chart data={history} x="date" height={220} fmt={(v) => money(v)} yWidth={60} xFmt={monthTick} series={[{ key: "recurring", label: "Recurring", color: GOLD }]} />
        </ChartCard>
        <ChartCard title="Expenses by month">
          <Chart data={history} x="date" height={220} fmt={(v) => money(v)} yWidth={60} xFmt={monthTick} series={[{ key: "expenses", label: "Expenses", color: SERIES[3], type: "bar" }]} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-[20px] leading-none">By business</h3>
          {revenueByBusiness(l, data.businesses, month, monthEnd(month)).map((b) => (
            <Link key={b.business.id} to={`/business/${b.business.id}`} className="block rounded-xl py-2 hover:bg-raised/40">
              <Meter thin value={b.revenue} max={num(b.business.monthly_target) || Math.max(1, g.goal)} label={<span className="text-bone">{b.business.name}{!b.business.active && " (archived)"}</span>}
                right={money(metricValue(b, g.metric))} sub={`${b.business.monthly_target ? `target ${money(b.business.monthly_target)} · ` : ""}profit ${money(b.profit)} · cash ${money(b.cash)}`} />
            </Link>
          ))}
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setNewBiz(true)}>Add business</Button>
        </Card>
        <Card>
          <h3 className="mb-3 text-[20px] leading-none">By offer</h3>
          <Table head={["Offer", "Revenue"]} rows={revenueByOffer(l, data.offers, month, monthEnd(month)).map((o) => [o.name, money(o.amount)])} empty="No sales this month." />
        </Card>
        <Card>
          <h3 className="mb-3 text-[20px] leading-none">Expenses by category</h3>
          <Table head={["Category", "Amount"]} rows={expensesByCategory(l, month, monthEnd(month)).map((e) => [e.category[0].toUpperCase() + e.category.slice(1), money(e.amount)])} empty="No expenses this month." />
        </Card>
      </div>

      <Forecast />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-1 text-[20px] leading-none">Accounts receivable</h3>
          <p className="mb-3 text-[12px] text-mute">Revenue earned but not yet collected: {money(ar.total)}</p>
          <Receivables open={ar.open} />
        </Card>
        <Card>
          <h3 className="mb-3 text-[20px] leading-none">Pipeline</h3>
          <div className="grid grid-cols-3 gap-3">
            {(["lead", "contacted", "conversation", "proposal", "won", "lost"] as const).map((s) => (
              <div key={s} className="rounded-xl bg-raised px-3 py-2.5"><div className="eyebrow mb-1 text-[9.5px]">{s}</div><div className="num text-[18px] font-semibold">{openPipe.byStage[s]}</div></div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-mute">Open pipeline value {money(openPipe.openValue)} — potential only, never counted as revenue. Win rate (all time) {openPipe.winRate !== null ? pct(openPipe.winRate) : "—"}.</p>
          <p className="mt-1 text-[12px] text-faint">Manage deals inside each business workspace.</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-2 text-[20px] leading-none">Transactions · {fmtMonth(month)}</h3>
        <TransactionList limit={25} items={[...data.transactions].filter((t) => t.txn_date >= month && t.txn_date <= monthEnd(month)).reverse()} />
      </Card>

      <Sheet open={add} onClose={() => setAdd(false)} title="Record transaction" wide><TransactionForm onDone={() => setAdd(false)} /></Sheet>
      <Sheet open={newBiz} onClose={() => setNewBiz(false)} title="Add business"><BusinessForm onDone={() => setNewBiz(false)} /></Sheet>
      <Sheet open={goalEdit} onClose={() => setGoalEdit(false)} title="Business goal"><GoalSettings onDone={() => setGoalEdit(false)} /></Sheet>
    </div>
  );
}

function Receivables({ open }: { open: { txn: Transaction; due: number }[] }) {
  const { data } = useStore();
  const [pay, setPay] = useState<Transaction | null>(null);
  return (
    <>
      <RecordList limit={8} items={open.map(({ txn, due }) => ({
        id: txn.id, primary: `${data.customers.find((c) => c.id === txn.customer_id)?.name ?? txn.description ?? "Sale"} · ${money(due)} due`,
        secondary: `${fmtShort(txn.txn_date)} · ${data.businesses.find((b) => b.id === txn.business_id)?.name ?? ""} · sale ${money(txn.amount)}`,
        right: <button className="text-[12px] font-semibold text-gold" onClick={() => setPay(txn)}>Record payment</button>,
      }))} empty="Nothing outstanding." />
      <Sheet open={!!pay} onClose={() => setPay(null)} title="Record payment">{pay && <PaymentForm txn={pay} onDone={() => setPay(null)} />}</Sheet>
    </>
  );
}

export function GoalSettings({ onDone }: { onDone?: () => void }) {
  const { data, saveSingle, today } = useStore();
  const { busy, run } = useSubmit();
  const s = data.businessSettings;
  const [metric, setMetric] = useState<GoalMetric>(s?.goal_metric ?? "revenue");
  const [amount, setAmount] = useState(String(s?.goal_amount ?? 10000));
  const [rev, setRev] = useState(s?.baseline_revenue != null ? String(s.baseline_revenue) : "");
  const [exp, setExp] = useState(s?.baseline_expenses != null ? String(s.baseline_expenses) : "");
  return (
    <div className="space-y-4">
      <Field group label="The goal measures" hint="Revenue milestones follow this definition. Changing it re-evaluates them.">
        <Segmented value={metric} onChange={setMetric} className="w-full" options={[{ value: "revenue", label: "Revenue" }, { value: "cash", label: "Cash collected" }, { value: "profit", label: "Net profit" }]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly goal"><NumberInput value={amount} onChange={setAmount} suffix="$" /></Field>
        <Field label="Deadline"><Input value={fmtDate(s?.goal_deadline ?? MISSION_END)} disabled /></Field>
        <Field label="Baseline monthly revenue"><NumberInput value={rev} onChange={setRev} suffix="$" /></Field>
        <Field label="Baseline monthly expenses"><NumberInput value={exp} onChange={setExp} suffix="$" /></Field>
      </div>
      <Button busy={busy} className="w-full" onClick={() => run(async () => {
        if (!(num(amount) > 0)) throw new Error("The goal must be more than $0.");
        await saveSingle("businessSettings", {
          goal_metric: metric, goal_amount: num(amount),
          baseline_revenue: rev === "" ? null : num(rev), baseline_expenses: exp === "" ? null : num(exp),
          baseline_confirmed_on: rev === "" && exp === "" ? null : s?.baseline_confirmed_on ?? today,
        });
        onDone?.();
        return "Goal saved.";
      })}>Save goal</Button>
    </div>
  );
}

export function BusinessForm({ initial, onDone }: { initial?: import("@/lib/types").Business; onDone?: () => void }) {
  const { data, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "other");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [target, setTarget] = useState(initial?.monthly_target != null ? String(initial.monthly_target) : "");
  return (
    <div className="space-y-4">
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="Type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="service">Service</option><option value="education">Education / courses</option><option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} className="min-h-[64px]" /></Field>
      <Field label="Monthly target (optional)" hint="Its share of the overall goal."><NumberInput value={target} onChange={setTarget} suffix="$" /></Field>
      <Button busy={busy} className="w-full" onClick={() => run(async () => {
        if (!name.trim()) throw new Error("Give the business a name.");
        const row = { name: name.trim(), kind, description: desc.trim() || null, monthly_target: target ? num(target) : null };
        if (initial) await update("businesses", initial.id, row);
        else await insert("businesses", { ...row, sort_order: data.businesses.length });
        onDone?.();
        return initial ? "Business updated." : "Business added.";
      })}>{initial ? "Save" : "Add business"}</Button>
    </div>
  );
}

type AssumptionKey = keyof ForecastAssumptions;

function Forecast() {
  const { data, today, saveSingle } = useStore();
  const { busy, run } = useSubmit();
  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const metric = data.businessSettings?.goal_metric ?? "revenue";
  const goal = num(data.businessSettings?.goal_amount) || 10000;
  const defaults = forecastDefaults(l, data.customers, data.offers, today, data.businessSettings?.baseline_expenses ?? null);
  const saved = data.businessSettings?.forecast ?? {};
  // Boxes hold exactly what was typed (so "2.05" or a blank box can be typed). A blank
  // box, or one never changed, follows your data; saved values override it.
  const [draft, setDraft] = useState<Partial<Record<AssumptionKey, string>>>({});
  const [reset, setReset] = useState(false);
  const overrides: ForecastAssumptions = { ...(reset ? {} : saved) };
  for (const [k, v] of Object.entries(draft) as [AssumptionKey, string][]) {
    if (v.trim() === "") delete overrides[k];
    else overrides[k] = num(v);
  }
  const a = { ...defaults, ...overrides } as Required<ForecastAssumptions>;
  const dirty = reset || Object.keys(draft).length > 0;
  const [open, setOpen] = useState(false);
  const lastMonth = monthFinance(l, addMonths(monthStart(today), -1));
  const startRecurring = lastMonth.recurring || monthFinance(l, today).recurring;
  const months = Math.max(1, (Number(MISSION_END.slice(0, 4)) * 12 + Number(MISSION_END.slice(5, 7))) - (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))) + 1);
  const rows = forecast(startRecurring, a, monthStart(today), months, metric === "cash" ? "revenue" : metric);
  const hit = rows.find((r) => r.metric >= goal);
  const last = rows[rows.length - 1];
  const field = (k: AssumptionKey, label: string, suffix: string) => (
    <Field label={label} hint={`From your data: ${defaults[k]}`}>
      <NumberInput value={draft[k] ?? String(a[k])} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} suffix={suffix} min="0" placeholder={String(defaults[k])} />
    </Field>
  );
  const save = () => run(async () => {
    if (Object.values(overrides).some((v) => !(num(v) >= 0))) throw new Error("Forecast numbers can't be negative.");
    if (num(overrides.churnPct) > 100) throw new Error("Monthly churn can't be more than 100%.");
    await saveSingle("businessSettings", { forecast: overrides });
    setDraft({});
    setReset(false);
    return "Assumptions saved.";
  });
  return (
    <ChartCard title="Forecast (estimate)" sub={`Starts from ${money(startRecurring)} of recurring revenue. Editable assumptions — arithmetic, not a promise.`}
      action={<Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? "Hide assumptions" : "Edit assumptions"}</Button>}>
      {open && (
        <div className="mb-5 rounded-2xl border border-hair p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {field("newRecurringPerMonth", "New recurring customers / month", "#")}
            {field("recurringPrice", "Avg recurring price", "$/mo")}
            {field("churnPct", "Monthly churn", "%")}
            {field("oneTimeSalesPerMonth", "One-time sales / month", "#")}
            {field("oneTimeAvg", "Avg one-time sale", "$")}
            {field("monthlyExpenses", "Monthly expenses", "$")}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" busy={busy} onClick={save}>Save assumptions</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft({}); setReset(true); }}>Reset to data</Button>
            {dirty && <span className="text-[11.5px] text-faint">Not saved yet</span>}
          </div>
        </div>
      )}
      <Chart data={rows.map((r) => ({ date: r.month, metric: r.metric }))} x="date" height={220} fmt={(v) => money(v)} yWidth={60} xFmt={monthTick}
        series={[{ key: "metric", label: `Estimated ${metric === "profit" ? "profit" : "revenue"}`, color: GOLD, dashed: true }]} refs={[{ y: goal, label: "Goal" }]} />
      <p className={cx("mt-3 text-[13px]", hit ? "text-bone" : "text-mute")}>
        {hit ? `On these assumptions the estimate reaches ${money(goal)} in ${fmtMonth(hit.month)}.`
          : `On these assumptions the estimate reaches ${money(last.metric)} by ${fmtMonth(last.month)} — a gap of ${money(goal - last.metric)}. Change the inputs to see what closing it would take.`}
      </p>
      {metric === "cash" && <p className="mt-1 text-[11.5px] text-faint">Cash timing isn't modelled; the estimate shows revenue.</p>}
    </ChartCard>
  );
}
