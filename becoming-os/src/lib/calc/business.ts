// Business finance. Four quantities are kept apart on purpose:
//   revenue  — sales earned on their txn_date, net of refunds
//   cash     — payments actually received on their paid_on date, net of refunds
//   expenses — business costs on their txn_date
//   profit   — revenue − expenses (earned basis)
// Gig income, personal income and transfers between your own accounts never
// count toward any business figure.
import { addMonths, dateRange, daysInMonth, diffDays, monthEnd, monthKey, monthStart } from "../dates";
import { num, round } from "../format";
import type {
  Business, BusinessSettings, Customer, Deal, ForecastAssumptions, GoalMetric, ISODate, Offer,
  Payment, Transaction,
} from "../types";

export interface Ledger {
  transactions: Transaction[];
  payments: Payment[];
  customers?: Customer[];
}

export interface Filter {
  businessId?: string | null;
}

function inBiz(t: Transaction, f?: Filter): boolean {
  return !f?.businessId || t.business_id === f.businessId;
}

export interface PeriodFinance {
  from: ISODate;
  to: ISODate;
  grossSales: number;
  refunds: number;
  revenue: number;
  cashIn: number;
  cash: number;
  expenses: number;
  profit: number;
  cashProfit: number;
  recurring: number;
  oneTime: number;
  salesCount: number;
  payingCustomers: number;
  unlinkedSales: number;
  arpc: number | null;
  gigIncome: number;
  personalIncome: number;
  transfers: number;
}

export function periodFinance(l: Ledger, from: ISODate, to: ISODate, f?: Filter): PeriodFinance {
  let grossSales = 0, refunds = 0, expenses = 0, recurring = 0, salesCount = 0, unlinkedSales = 0;
  let gigIncome = 0, personalIncome = 0, transfers = 0;
  const customers = new Set<string>();
  const saleIds = new Set<string>();
  for (const t of l.transactions) {
    if (t.kind === "sale" && inBiz(t, f)) saleIds.add(t.id);
    if (t.txn_date < from || t.txn_date > to) continue;
    const a = num(t.amount);
    switch (t.kind) {
      case "sale":
        if (!inBiz(t, f)) break;
        grossSales += a;
        salesCount += 1;
        if (t.recurring) recurring += a;
        if (t.customer_id) customers.add(t.customer_id);
        else unlinkedSales += 1;
        break;
      case "refund":
        if (inBiz(t, f)) refunds += a;
        break;
      case "expense":
        if (inBiz(t, f)) expenses += a;
        break;
      case "gig_income":
        if (!f?.businessId) gigIncome += a;
        break;
      case "personal_income":
        if (!f?.businessId) personalIncome += a;
        break;
      case "transfer":
        if (!f?.businessId) transfers += a;
        break;
    }
  }
  let cashIn = 0;
  for (const p of l.payments) {
    if (p.paid_on < from || p.paid_on > to) continue;
    if (saleIds.has(p.transaction_id)) cashIn += num(p.amount);
  }
  const revenue = grossSales - refunds;
  const cash = cashIn - refunds;
  return {
    from, to,
    grossSales: round(grossSales, 2),
    refunds: round(refunds, 2),
    revenue: round(revenue, 2),
    cashIn: round(cashIn, 2),
    cash: round(cash, 2),
    expenses: round(expenses, 2),
    profit: round(revenue - expenses, 2),
    cashProfit: round(cash - expenses, 2),
    recurring: round(recurring, 2),
    oneTime: round(grossSales - recurring, 2),
    salesCount,
    payingCustomers: customers.size,
    unlinkedSales,
    arpc: customers.size ? round(revenue / customers.size, 2) : null,
    gigIncome: round(gigIncome, 2),
    personalIncome: round(personalIncome, 2),
    transfers: round(transfers, 2),
  };
}

export function monthFinance(l: Ledger, month: ISODate, f?: Filter): PeriodFinance {
  return periodFinance(l, monthStart(month), monthEnd(month), f);
}

export function metricValue(p: PeriodFinance, metric: GoalMetric): number {
  return metric === "cash" ? p.cash : metric === "profit" ? p.profit : p.revenue;
}

export const METRIC_LABEL: Record<GoalMetric, string> = {
  revenue: "Revenue earned",
  cash: "Cash collected",
  profit: "Net profit",
};

/** Per-day change in the goal metric, for month-to-date running totals. */
export function dailyMetricDeltas(l: Ledger, metric: GoalMetric): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  const add = (d: ISODate, v: number) => m.set(d, (m.get(d) ?? 0) + v);
  const saleIds = new Set(l.transactions.filter((t) => t.kind === "sale").map((t) => t.id));
  for (const t of l.transactions) {
    const a = num(t.amount);
    if (t.kind === "sale" && metric !== "cash") add(t.txn_date, a);
    if (t.kind === "refund") add(t.txn_date, -a);
    if (t.kind === "expense" && metric === "profit") add(t.txn_date, -a);
  }
  if (metric === "cash") {
    for (const p of l.payments) if (saleIds.has(p.transaction_id)) add(p.paid_on, num(p.amount));
  }
  return m;
}

/** Month-to-date running totals: [{date, mtd}] for each day that has activity. */
export function mtdSeries(deltas: Map<ISODate, number>): { date: ISODate; mtd: number }[] {
  const days = [...deltas.keys()].sort();
  const out: { date: ISODate; mtd: number }[] = [];
  let month = "";
  let run = 0;
  for (const d of days) {
    if (monthKey(d) !== month) {
      month = monthKey(d);
      run = 0;
    }
    run += deltas.get(d)!;
    out.push({ date: d, mtd: round(run, 2) });
  }
  return out;
}

/** First date on which a month-to-date total reached `threshold`. */
export function firstMtdCrossing(series: { date: ISODate; mtd: number }[], threshold: number): ISODate | null {
  for (const p of series) if (p.mtd >= threshold - 0.004) return p.date;
  return null;
}

export function monthTotals(l: Ledger, metric: GoalMetric): Map<string, number> {
  const out = new Map<string, number>();
  for (const [d, v] of dailyMetricDeltas(l, metric)) {
    out.set(monthKey(d), round((out.get(monthKey(d)) ?? 0) + v, 2));
  }
  return out;
}

/** Outstanding receivables as of a date: earned sales minus cash received. */
export function receivables(l: Ledger, asOf: ISODate, f?: Filter): { total: number; open: { txn: Transaction; due: number }[] } {
  const paid = new Map<string, number>();
  for (const p of l.payments) {
    if (p.paid_on <= asOf) paid.set(p.transaction_id, (paid.get(p.transaction_id) ?? 0) + num(p.amount));
  }
  const open: { txn: Transaction; due: number }[] = [];
  let total = 0;
  for (const t of l.transactions) {
    if (t.kind !== "sale" || t.txn_date > asOf || !inBiz(t, f)) continue;
    const due = round(num(t.amount) - (paid.get(t.id) ?? 0), 2);
    if (due > 0.004) {
      open.push({ txn: t, due });
      total += due;
    }
  }
  return { total: round(total, 2), open: open.sort((a, b) => (a.txn.txn_date < b.txn.txn_date ? -1 : 1)) };
}

export function paidAmount(payments: Payment[], txnId: string): number {
  return round(payments.filter((p) => p.transaction_id === txnId).reduce((a, p) => a + num(p.amount), 0), 2);
}

/** Date of each customer's first sale. */
export function firstSaleByCustomer(l: Ledger, f?: Filter): Map<string, ISODate> {
  const m = new Map<string, ISODate>();
  for (const t of l.transactions) {
    if (t.kind !== "sale" || !t.customer_id || !inBiz(t, f)) continue;
    const prev = m.get(t.customer_id);
    if (!prev || t.txn_date < prev) m.set(t.customer_id, t.txn_date);
  }
  return m;
}

export interface CustomerStats {
  newCustomers: number;
  churned: number;
  activeAtStart: number;
  churnPct: number | null;
  retentionPct: number | null;
  activeNow: number;
}

export function customerStats(l: Ledger, customers: Customer[], from: ISODate, to: ISODate, f?: Filter): CustomerStats {
  const first = firstSaleByCustomer(l, f);
  const list = customers.filter((c) => !f?.businessId || c.business_id === f.businessId);
  const started = (c: Customer): ISODate | null => {
    const s = first.get(c.id) ?? null;
    if (c.started_on && (!s || c.started_on < s)) return c.started_on;
    return s;
  };
  let newCustomers = 0;
  for (const d of first.values()) if (d >= from && d <= to) newCustomers += 1;
  let churned = 0, activeAtStart = 0, activeNow = 0;
  for (const c of list) {
    const s = started(c);
    if (c.churned_on && c.churned_on >= from && c.churned_on <= to) churned += 1;
    if (s && s < from && (!c.churned_on || c.churned_on >= from)) activeAtStart += 1;
    if (s && s <= to && (!c.churned_on || c.churned_on > to) && c.status !== "churned") activeNow += 1;
  }
  const churnPct = activeAtStart ? round((churned / activeAtStart) * 100, 1) : null;
  return {
    newCustomers, churned, activeAtStart, activeNow,
    churnPct,
    retentionPct: churnPct === null ? null : round(100 - churnPct, 1),
  };
}

export interface PipelineStats {
  open: number;
  openValue: number;
  byStage: Record<Deal["stage"], number>;
  won: number;
  lost: number;
  winRate: number | null;
  wonValue: number;
}

export function pipelineStats(deals: Deal[], from?: ISODate, to?: ISODate, f?: Filter): PipelineStats {
  const byStage = { lead: 0, contacted: 0, conversation: 0, proposal: 0, won: 0, lost: 0 };
  let open = 0, openValue = 0, won = 0, lost = 0, wonValue = 0;
  for (const d of deals) {
    if (f?.businessId && d.business_id !== f.businessId) continue;
    const closedInRange = d.closed_on && (!from || d.closed_on >= from) && (!to || d.closed_on <= to);
    if (d.stage === "won" || d.stage === "lost") {
      if (from && !closedInRange) continue;
      byStage[d.stage] += 1;
      if (d.stage === "won") {
        won += 1;
        wonValue += num(d.value);
      } else lost += 1;
    } else {
      byStage[d.stage] += 1;
      open += 1;
      openValue += num(d.value);
    }
  }
  return {
    open, openValue: round(openValue, 2), byStage, won, lost,
    winRate: won + lost ? round((won / (won + lost)) * 100, 1) : null,
    wonValue: round(wonValue, 2),
  };
}

export function revenueByBusiness(l: Ledger, businesses: Business[], from: ISODate, to: ISODate) {
  return businesses.map((b) => ({ business: b, ...periodFinance(l, from, to, { businessId: b.id }) }));
}

export function revenueByOffer(l: Ledger, offers: Offer[], from: ISODate, to: ISODate, f?: Filter) {
  const m = new Map<string, number>();
  for (const t of l.transactions) {
    if (t.kind !== "sale" || t.txn_date < from || t.txn_date > to || !inBiz(t, f)) continue;
    const k = t.offer_id ?? "none";
    m.set(k, (m.get(k) ?? 0) + num(t.amount));
  }
  return [...m.entries()]
    .map(([id, amount]) => ({
      id,
      name: id === "none" ? "No offer linked" : offers.find((o) => o.id === id)?.name ?? "Deleted offer",
      amount: round(amount, 2),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function expensesByCategory(l: Ledger, from: ISODate, to: ISODate, f?: Filter) {
  const m = new Map<string, number>();
  for (const t of l.transactions) {
    if (t.kind !== "expense" || t.txn_date < from || t.txn_date > to || !inBiz(t, f)) continue;
    const k = t.expense_category ?? "other";
    m.set(k, (m.get(k) ?? 0) + num(t.amount));
  }
  return [...m.entries()].map(([category, amount]) => ({ category, amount: round(amount, 2) }))
    .sort((a, b) => b.amount - a.amount);
}

export interface GoalStatus {
  metric: GoalMetric;
  goal: number;
  value: number;
  pct: number;
  remaining: number;
  nextThousand: number;
  toNextThousand: number;
  /** Straight-line month-end estimate from the month-to-date pace. */
  runRate: number | null;
}

export function goalStatus(l: Ledger, settings: Pick<BusinessSettings, "goal_metric" | "goal_amount">, today: ISODate): GoalStatus {
  const metric = settings.goal_metric;
  const goal = num(settings.goal_amount) || 10000;
  const p = monthFinance(l, today);
  const value = metricValue(p, metric);
  const nextThousand = Math.floor(Math.max(value, 0) / 1000 + 1e-9) * 1000 + 1000;
  const elapsed = diffDays(monthStart(today), today) + 1;
  return {
    metric, goal, value,
    pct: Math.min(100, Math.max(0, (value / goal) * 100)),
    remaining: Math.max(0, round(goal - value, 2)),
    nextThousand,
    toNextThousand: round(nextThousand - value, 2),
    runRate: elapsed >= 7 ? round((value / elapsed) * daysInMonth(today), 0) : null,
  };
}

/** How many sales of each offer would close a gap (by editable prices). */
export function salesToClose(gap: number, offers: Offer[]) {
  return offers
    .filter((o) => o.active && num(o.price) > 0)
    .map((o) => ({ offer: o, count: Math.ceil(gap / num(o.price)) }));
}

// ───────────────────────────────────────────────────────────── forecast ──

export interface ForecastRow {
  month: ISODate;
  recurring: number;
  oneTime: number;
  revenue: number;
  expenses: number;
  profit: number;
  metric: number;
}

/** Defaults for the forecast, derived from the last three complete months. */
export function forecastDefaults(l: Ledger, customers: Customer[], offers: Offer[], today: ISODate, baselineExpenses: number | null): Required<ForecastAssumptions> {
  const thisMonth = monthStart(today);
  const months = [addMonths(thisMonth, -3), addMonths(thisMonth, -2), addMonths(thisMonth, -1)];
  const first = firstSaleByCustomer(l);
  let newRecurring = 0, oneTimeCount = 0, oneTimeSum = 0, recurringSum = 0, recurringCount = 0, exp = 0, monthsWithData = 0;
  const churns: number[] = [];
  for (const m of months) {
    const p = monthFinance(l, m);
    if (p.salesCount || p.expenses) monthsWithData += 1;
    exp += p.expenses;
    for (const t of l.transactions) {
      if (t.kind !== "sale" || monthStart(t.txn_date) !== m) continue;
      if (t.recurring) {
        recurringSum += num(t.amount);
        recurringCount += 1;
        if (t.customer_id && monthStart(first.get(t.customer_id) ?? "") === m) newRecurring += 1;
      } else {
        oneTimeCount += 1;
        oneTimeSum += num(t.amount);
      }
    }
    const cs = customerStats(l, customers, m, monthEnd(m));
    if (cs.churnPct !== null) churns.push(cs.churnPct);
  }
  const n = Math.max(1, monthsWithData);
  const monthlyOffer = offers.find((o) => o.billing === "monthly" && num(o.price) > 0);
  return {
    newRecurringPerMonth: round(newRecurring / n, 1),
    recurringPrice: recurringCount ? round(recurringSum / recurringCount, 2) : num(monthlyOffer?.price),
    churnPct: churns.length ? round(churns.reduce((a, b) => a + b, 0) / churns.length, 1) : 5,
    oneTimeSalesPerMonth: round(oneTimeCount / n, 1),
    oneTimeAvg: oneTimeCount ? round(oneTimeSum / oneTimeCount, 2) : 0,
    monthlyExpenses: monthsWithData ? round(exp / n, 2) : num(baselineExpenses),
  };
}

/**
 * Month-by-month estimate. Recurring revenue compounds: next month keeps
 * (1 − churn) of this month's recurring revenue and adds new subscribers.
 * This is arithmetic on assumptions, not a prediction.
 */
export function forecast(
  startRecurring: number, a: Required<ForecastAssumptions>, fromMonth: ISODate, months: number, metric: GoalMetric,
): ForecastRow[] {
  const rows: ForecastRow[] = [];
  let recurring = startRecurring;
  for (let i = 0; i < months; i++) {
    recurring = recurring * (1 - a.churnPct / 100) + a.newRecurringPerMonth * a.recurringPrice;
    const oneTime = a.oneTimeSalesPerMonth * a.oneTimeAvg;
    const revenue = recurring + oneTime;
    const profit = revenue - a.monthlyExpenses;
    rows.push({
      month: addMonths(fromMonth, i),
      recurring: round(recurring, 0),
      oneTime: round(oneTime, 0),
      revenue: round(revenue, 0),
      expenses: round(a.monthlyExpenses, 0),
      profit: round(profit, 0),
      // Cash ≈ revenue in a forecast; timing differences aren't modelled.
      metric: round(metric === "profit" ? profit : revenue, 0),
    });
  }
  return rows;
}

export function monthlyHistory(l: Ledger, from: ISODate, to: ISODate, f?: Filter) {
  const out: (PeriodFinance & { month: ISODate })[] = [];
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push({ month: m, ...monthFinance(l, m, f) });
  return out;
}

export function dailyRevenue(l: Ledger, from: ISODate, to: ISODate, f?: Filter) {
  return dateRange(from, to).map((d) => {
    const p = periodFinance(l, d, d, f);
    return { date: d, revenue: p.revenue, cash: p.cash, expenses: p.expenses };
  });
}
