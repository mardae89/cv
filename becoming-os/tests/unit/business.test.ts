import { describe, expect, it } from "vitest";
import {
  customerStats, forecast, goalStatus, monthFinance, periodFinance, pipelineStats, receivables, salesToClose,
} from "../../src/lib/calc/business";
import { evaluate } from "../../src/lib/calc/milestones";
import { checkTransaction } from "../../src/lib/calc/validation";
import type { Customer, Offer, Payment } from "../../src/lib/types";
import { id, makeData, sale, txn } from "./fixtures";

const pay = (transaction_id: string, paid_on: string, amount: number): Payment => ({
  id: id(), user_id: "u1", transaction_id, paid_on, amount, method: null,
});

describe("finance separation", () => {
  const s1 = sale("2026-10-15", 1500, { customer_id: "c1" });
  const s2 = sale("2026-10-28", 197, { customer_id: "c2" });
  const ledger = {
    transactions: [
      s1, s2,
      txn("refund", "2026-10-30", 197),
      txn("expense", "2026-10-20", 300, { expense_category: "software" }),
      txn("gig_income", "2026-10-21", 400),
      txn("personal_income", "2026-10-22", 2000),
      txn("transfer", "2026-10-23", 5000),
    ],
    payments: [pay(s1.id, "2026-10-15", 500), pay(s1.id, "2026-11-15", 1000), pay(s2.id, "2026-10-28", 197)],
  };

  it("keeps revenue earned, cash collected, expenses and profit apart", () => {
    const oct = monthFinance(ledger, "2026-10-01");
    expect(oct.grossSales).toBe(1697);
    expect(oct.refunds).toBe(197);
    expect(oct.revenue).toBe(1500);
    expect(oct.cashIn).toBe(697);
    expect(oct.cash).toBe(500);
    expect(oct.expenses).toBe(300);
    expect(oct.profit).toBe(1200);
    const nov = monthFinance(ledger, "2026-11-01");
    expect(nov.revenue).toBe(0);
    expect(nov.cash).toBe(1000);
  });

  it("never counts gig income, personal income or transfers as business revenue", () => {
    const oct = monthFinance(ledger, "2026-10-01");
    expect(oct.gigIncome).toBe(400);
    expect(oct.personalIncome).toBe(2000);
    expect(oct.transfers).toBe(5000);
    expect(oct.revenue + oct.cash + oct.profit).toBe(1500 + 500 + 1200);
  });

  it("tracks receivables as earned minus collected", () => {
    expect(receivables(ledger, "2026-10-31").total).toBe(1000);
    expect(receivables(ledger, "2026-11-30").total).toBe(0);
  });

  it("filters by business", () => {
    const other = sale("2026-10-05", 999, { business_id: "b2" });
    const l = { ...ledger, transactions: [...ledger.transactions, other] };
    expect(periodFinance(l, "2026-10-01", "2026-10-31", { businessId: "b2" }).revenue).toBe(999);
    expect(periodFinance(l, "2026-10-01", "2026-10-31", { businessId: "b1" }).revenue).toBe(1500);
  });

  it("reports goal status for the configured metric", () => {
    expect(goalStatus(ledger, { goal_metric: "revenue", goal_amount: 10000 }, "2026-10-31")).toMatchObject({ value: 1500, remaining: 8500, nextThousand: 2000, toNextThousand: 500 });
    expect(goalStatus(ledger, { goal_metric: "cash", goal_amount: 10000 }, "2026-10-31").value).toBe(500);
    expect(goalStatus(ledger, { goal_metric: "profit", goal_amount: 10000 }, "2026-10-31").value).toBe(1200);
  });

  it("counts sales needed per offer price", () => {
    const offers: Offer[] = [
      { id: "o1", user_id: "u1", business_id: "b1", name: "Course", price: 197, billing: "one_time", term_months: null, active: true },
      { id: "o2", user_id: "u1", business_id: "b1", name: "Mentorship", price: 1500, billing: "installment", term_months: 2, active: true },
      { id: "o3", user_id: "u1", business_id: "b1", name: "Unpriced", price: null, billing: "one_time", term_months: null, active: true },
    ];
    expect(salesToClose(8500, offers).map((x) => x.count)).toEqual([44, 6]);
  });

  it("flags a likely typo amount", () => {
    expect(checkTransaction(50000, "sale", "b1", []).ok).toBe(false);
    expect(checkTransaction(9000, "sale", "b1", [sale("2026-10-01", 197)]).ok).toBe(false);
    expect(checkTransaction(197, "sale", "b1", [sale("2026-10-01", 197)]).ok).toBe(true);
  });
});

describe("customers and pipeline", () => {
  it("computes new, churned and retention", () => {
    const customers: Customer[] = [
      { id: "c1", user_id: "u1", business_id: "b1", name: "A", status: "active", source: null, started_on: null, churned_on: null, notes: null },
      { id: "c2", user_id: "u1", business_id: "b1", name: "B", status: "churned", source: null, started_on: null, churned_on: "2026-11-20", notes: null },
    ];
    const l = { transactions: [sale("2026-10-02", 49, { customer_id: "c1" }), sale("2026-10-03", 49, { customer_id: "c2" }), sale("2026-11-02", 49, { customer_id: "c1" })], payments: [] };
    expect(customerStats(l, customers, "2026-10-01", "2026-10-31").newCustomers).toBe(2);
    const nov = customerStats(l, customers, "2026-11-01", "2026-11-30");
    expect(nov).toMatchObject({ newCustomers: 0, churned: 1, activeAtStart: 2, churnPct: 50, retentionPct: 50 });
  });

  it("computes win rate from closed deals", () => {
    const base = { user_id: "u1", business_id: "b1", contact: null, value: 1000, offer_id: null, source: null, created_on: "2026-10-01", notes: null };
    const p = pipelineStats([
      { ...base, id: "d1", name: "A", stage: "won", closed_on: "2026-10-10" },
      { ...base, id: "d2", name: "B", stage: "lost", closed_on: "2026-10-11" },
      { ...base, id: "d3", name: "C", stage: "won", closed_on: "2026-10-12" },
      { ...base, id: "d4", name: "D", stage: "proposal", closed_on: null },
    ]);
    expect(p).toMatchObject({ won: 2, lost: 1, open: 1, openValue: 1000 });
    expect(p.winRate).toBeCloseTo(66.7, 1);
  });

  it("forecasts by compounding recurring revenue with churn", () => {
    const rows = forecast(1000, { newRecurringPerMonth: 10, recurringPrice: 49, churnPct: 10, oneTimeSalesPerMonth: 2, oneTimeAvg: 197, monthlyExpenses: 200 }, "2026-11-01", 2, "revenue");
    expect(rows[0].recurring).toBe(1390); // 1000×0.9 + 490
    expect(rows[1].recurring).toBe(1741); // 1390×0.9 + 490
    expect(rows[0].revenue).toBe(1784);
    expect(rows[0].profit).toBe(1584);
  });
});

describe("revenue milestones", () => {
  const settings = { user_id: "u1", goal_metric: "revenue" as const, goal_amount: 10000, goal_deadline: "2027-05-24", baseline_revenue: 0, baseline_expenses: 0, baseline_confirmed_on: null, forecast: {} };

  it("unlocks $1K–$10K on the day month-to-date revenue crosses each threshold", () => {
    const data = makeData({
      businessSettings: settings,
      transactions: [sale("2026-11-03", 600), sale("2026-11-09", 500), sale("2026-11-20", 1950)],
    });
    const ms = evaluate(data, "2026-11-30").milestones;
    expect(ms.find((m) => m.key === "biz.revenue.1000")!.achievedOn).toBe("2026-11-09");
    expect(ms.find((m) => m.key === "biz.revenue.2000")!.achievedOn).toBe("2026-11-20");
    expect(ms.find((m) => m.key === "biz.revenue.3000")!.achievedOn).toBe("2026-11-20");
    expect(ms.find((m) => m.key === "biz.revenue.4000")!.achievedOn).toBeNull();
    expect(ms.find((m) => m.key === "biz.first_sale")!.achievedOn).toBe("2026-11-03");
  });

  it("does not let two separate months add up to one milestone", () => {
    const data = makeData({ businessSettings: settings, transactions: [sale("2026-10-31", 600), sale("2026-11-01", 600)] });
    expect(evaluate(data, "2026-11-30").milestones.find((m) => m.key === "biz.revenue.1000")!.achievedOn).toBeNull();
  });

  it("distinguishes one $10K month from three in a row", () => {
    const data = makeData({ businessSettings: settings, transactions: [sale("2027-02-10", 10000), sale("2027-03-10", 10500)] });
    let ms = evaluate(data, "2027-03-31").milestones;
    expect(ms.find((m) => m.key === "biz.revenue.10000")!.achievedOn).toBe("2027-02-10");
    expect(ms.find((m) => m.key === "biz.revenue.sustained")!.achievedOn).toBeNull();
    data.transactions.push(sale("2027-04-05", 4000), sale("2027-04-22", 6000));
    ms = evaluate(data, "2027-04-30").milestones;
    expect(ms.find((m) => m.key === "biz.revenue.sustained")!.achievedOn).toBe("2027-04-22");
  });

  it("follows the selected goal metric", () => {
    const s = sale("2026-11-05", 3000);
    const data = makeData({
      businessSettings: { ...settings, goal_metric: "cash" },
      transactions: [s],
      payments: [{ id: "p1", user_id: "u1", transaction_id: s.id, paid_on: "2026-11-25", amount: 1000, method: null }],
    });
    const ms = evaluate(data, "2026-11-30").milestones;
    expect(ms.find((m) => m.key === "biz.cash.1000")!.achievedOn).toBe("2026-11-25");
    expect(ms.find((m) => m.key === "biz.cash.2000")!.achievedOn).toBeNull();
    expect(ms.some((m) => m.key.startsWith("biz.revenue."))).toBe(false);
  });

  it("awards first profitable month only after the month is complete", () => {
    const data = makeData({ businessSettings: settings, transactions: [sale("2026-11-05", 500), txn("expense", "2026-11-06", 100)] });
    expect(evaluate(data, "2026-11-20").milestones.find((m) => m.key === "biz.first_profitable")!.achievedOn).toBeNull();
    expect(evaluate(data, "2026-12-01").milestones.find((m) => m.key === "biz.first_profitable")!.achievedOn).toBe("2026-11-30");
  });

  it("recalculates when a sale is edited or deleted", () => {
    const big = sale("2026-11-05", 2500);
    const data = makeData({ businessSettings: settings, transactions: [big] });
    expect(evaluate(data, "2026-11-30").milestones.find((m) => m.key === "biz.revenue.2000")!.achievedOn).toBe("2026-11-05");
    big.amount = 250;
    expect(evaluate(data, "2026-11-30").milestones.find((m) => m.key === "biz.revenue.2000")!.achievedOn).toBeNull();
  });
});
