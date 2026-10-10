import { useState, type FormEvent } from "react";
import { validateRow } from "@/data/schema";
import { useStore } from "@/data/store";
import { paidAmount } from "@/lib/calc/business";
import { checkTransaction } from "@/lib/calc/validation";
import { fmtShort } from "@/lib/dates";
import { errorMessage, money, num } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/templates";
import type { ActivityMetric, Customer, Deal, DealStage, Offer, Transaction, TxnKind } from "@/lib/types";
import { useFeedback } from "../feedback";
import { Button, Field, Input, Notice, NumberInput, Select, Stepper, Textarea, Toggle } from "../ui";
import { useSubmit } from "./body";

export const KIND_LABEL: Record<TxnKind, string> = {
  sale: "Sale (revenue)",
  expense: "Business expense",
  refund: "Refund",
  gig_income: "Gig income (not business)",
  personal_income: "Personal income (not business)",
  transfer: "Transfer between my accounts",
};

const BUSINESS_KINDS: TxnKind[] = ["sale", "expense", "refund"];

export function TransactionForm({ initial, businessId, onDone }: { initial?: Transaction; businessId?: string; onDone?: () => void }) {
  const { data, today, insert, update } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const active = data.businesses.filter((b) => b.active);
  const [kind, setKind] = useState<TxnKind>(initial?.kind ?? "sale");
  const [biz, setBiz] = useState(initial?.business_id ?? businessId ?? active[0]?.id ?? "");
  const [date, setDate] = useState(initial?.txn_date ?? today);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const alreadyPaid = initial ? paidAmount(data.payments, initial.id) : 0;
  const [cash, setCash] = useState(initial ? "" : "");
  const [cashTouched, setCashTouched] = useState(false);
  const [cashDate, setCashDate] = useState(today);
  const [offerId, setOfferId] = useState(initial?.offer_id ?? "");
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [newCustomer, setNewCustomer] = useState("");
  const [recurring, setRecurring] = useState(initial?.recurring ?? false);
  const [lead, setLead] = useState(initial?.lead_source ?? "");
  const [category, setCategory] = useState(initial?.expense_category ?? "software");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const isBiz = BUSINESS_KINDS.includes(kind);
  const offers = data.offers.filter((o) => o.business_id === biz && o.active);
  const customers = data.customers.filter((c) => c.business_id === biz);
  const cashValue = cashTouched ? cash : initial ? "" : amount;

  const pickOffer = (id: string) => {
    setOfferId(id);
    const o = data.offers.find((x) => x.id === id);
    if (o?.price && !amount) setAmount(String(o.price));
    if (o) setRecurring(o.billing === "monthly");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const amt = num(amount);
      if (!(amt > 0)) throw new Error("Enter an amount greater than zero.");
      if (isBiz && !biz) throw new Error("Choose which business this belongs to — or add a business first.");
      if (date > today) throw new Error("Record transactions on or before today. Expected future sales belong in the pipeline.");
      const collected = kind === "sale" ? num(cashValue) : 0;
      if (kind === "sale" && collected < 0) throw new Error("Cash collected can't be negative.");
      if (kind === "sale" && collected + alreadyPaid > amt + 0.004) throw new Error(`Cash collected can't exceed the sale amount (${money(amt)}).`);
      if (kind === "sale" && collected > 0 && cashDate < date) throw new Error("Cash can't be received before the sale date. Record a deposit as its own sale if needed.");

      const c = checkTransaction(amt, kind, isBiz ? biz : null, data.transactions, initial?.id);
      if (!c.ok && !(await confirm({ title: "Double-check this amount", body: c.reasons.join(" "), confirmLabel: "It's correct — save" }))) return;
      const dup = data.transactions.find((t) => t.id !== initial?.id && t.kind === kind && t.txn_date === date &&
        num(t.amount) === amt && (t.business_id ?? "") === (isBiz ? biz : ""));
      if (dup && !initial && !(await confirm({ title: "Possible duplicate", body: `A ${kind} of ${money(amt)} on this date is already recorded.`, confirmLabel: "Record it again" }))) return;

      const row = {
        kind, business_id: isBiz ? biz : null, txn_date: date, amount: amt,
        description: description.trim() || null, notes: notes.trim() || null,
        customer_id: kind === "sale" || kind === "refund" ? customerId || null : null,
        offer_id: kind === "sale" || kind === "refund" ? offerId || null : null,
        recurring: kind === "sale" && recurring,
        lead_source: kind === "sale" ? lead.trim() || null : null,
        expense_category: kind === "expense" ? category : null,
      };
      const payment = kind === "sale" && collected > 0 ? { paid_on: cashDate, amount: collected } : null;
      // Check the records before the first write, so a bad value can't leave half a sale saved.
      validateRow("transactions", row);
      if (payment) validateRow("payments", { ...payment, transaction_id: initial?.id ?? "new" });

      if (kind === "sale" && !customerId && newCustomer.trim()) {
        const [created] = await insert<Customer>("customers", { business_id: biz, name: newCustomer.trim(), started_on: date, source: lead.trim() || null });
        row.customer_id = created.id;
      }
      let id = initial?.id;
      if (initial) await update("transactions", initial.id, row);
      else id = (await insert<Transaction>("transactions", row))[0].id;
      if (payment) await insert("payments", { ...payment, transaction_id: id });
      if (!initial) {
        setAmount("");
        setCash("");
        setCashTouched(false);
        setDescription("");
        setNotes("");
        setNewCustomer("");
        setCustomerId("");
      }
      onDone?.();
      return initial ? "Transaction updated." : kind === "sale" ? `Sale recorded${collected > 0 ? `, ${money(collected)} collected` : " (no cash collected yet)"}.` : "Recorded.";
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Transaction form">
      <Field label="Type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as TxnKind)}>
          {(Object.keys(KIND_LABEL) as TxnKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
      </Field>
      {!isBiz && (
        <Notice>{kind === "transfer"
          ? "Transfers between your own accounts are kept for your records and never count as revenue, cash collected or income."
          : "Recorded separately from business revenue and profit. It never counts toward the business goal."}</Notice>
      )}
      {isBiz && (
        active.length ? (
          <Field label="Business">
            <Select value={biz} onChange={(e) => { setBiz(e.target.value); setOfferId(""); setCustomerId(""); }}>
              {active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        ) : <Notice tone="alert">Add a business workspace first (Business → Add business).</Notice>
      )}
      {kind === "sale" && offers.length > 0 && (
        <Field label="Offer">
          <Select value={offerId} onChange={(e) => pickOffer(e.target.value)}>
            <option value="">— None —</option>
            {offers.map((o: Offer) => <option key={o.id} value={o.id}>{o.name}{o.price ? ` · ${money(o.price)}` : ""}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === "sale" ? "Revenue earned" : "Amount"}><NumberInput value={amount} onChange={setAmount} suffix="$" /></Field>
        <Field label={kind === "sale" ? "Date earned" : "Date"}><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {kind === "sale" && (
        <div className="rounded-2xl border border-hair p-4">
          <div className="mb-3 text-[12px] text-mute">
            Cash collected is tracked separately from revenue earned.
            {initial && alreadyPaid > 0 && <> Already collected: <span className="text-bone">{money(alreadyPaid)}</span>.</>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={initial ? "Record a new payment" : "Cash collected now"} hint={initial ? "Leave blank if nothing new came in." : "0 if invoiced / unpaid."}>
              <NumberInput value={cashValue} onChange={(v) => { setCashTouched(true); setCash(v); }} suffix="$" />
            </Field>
            <Field label="Received on"><Input type="date" value={cashDate} max={today} onChange={(e) => setCashDate(e.target.value)} /></Field>
          </div>
        </div>
      )}
      {(kind === "sale" || kind === "refund") && isBiz && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— None / new —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {kind === "sale" && !customerId && (
            <Field label="New customer"><Input value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} maxLength={120} placeholder="Name (optional)" /></Field>
          )}
        </div>
      )}
      {kind === "sale" && (
        <>
          <Toggle checked={recurring} onChange={setRecurring} label="Recurring revenue" sub="Membership or retainer billed again next month. Counts toward monthly recurring revenue." />
          <Field label="Lead source"><Input value={lead} onChange={(e) => setLead(e.target.value)} maxLength={80} placeholder="e.g. LinkedIn, YouTube, referral" /></Field>
        </>
      )}
      {kind === "expense" && (
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="optional" /></Field>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="min-h-[64px]" placeholder="optional" /></Field>
      <Button type="submit" busy={busy} className="w-full" disabled={isBiz && !active.length}>{initial ? "Save changes" : "Record"}</Button>
    </form>
  );
}

export function PaymentForm({ txn, onDone }: { txn: Transaction; onDone?: () => void }) {
  const { data, today, insert } = useStore();
  const { busy, run } = useSubmit();
  const paid = paidAmount(data.payments, txn.id);
  const due = Math.max(0, num(txn.amount) - paid);
  const [amount, setAmount] = useState(String(due));
  const [date, setDate] = useState(today);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const a = num(amount);
      if (!(a > 0)) throw new Error("Enter an amount greater than zero.");
      if (a > due + 0.004) throw new Error(`Only ${money(due)} is outstanding on this sale.`);
      if (date < txn.txn_date) throw new Error("Payment can't be before the sale date.");
      await insert("payments", { transaction_id: txn.id, paid_on: date, amount: a });
      onDone?.();
      return `${money(a)} collected.`;
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[13px] text-mute">Sale of {money(txn.amount)} on {fmtShort(txn.txn_date)} · collected {money(paid)} · outstanding {money(due)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount received"><NumberInput value={amount} onChange={setAmount} suffix="$" /></Field>
        <Field label="Date received"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Button type="submit" busy={busy} className="w-full">Record payment</Button>
    </form>
  );
}

export const STAGES: { value: DealStage; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "conversation", label: "Sales conversation" },
  { value: "proposal", label: "Proposal" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export function DealForm({ initial, businessId, onDone }: { initial?: Deal; businessId?: string; onDone?: () => void }) {
  const { data, today, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [biz, setBiz] = useState(initial?.business_id ?? businessId ?? data.businesses.find((b) => b.active)?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [stage, setStage] = useState<DealStage>(initial?.stage ?? "lead");
  const [value, setValue] = useState(initial?.value != null ? String(initial.value) : "");
  const [offerId, setOfferId] = useState(initial?.offer_id ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!name.trim()) throw new Error("Give the deal a name (company or person).");
      if (!biz) throw new Error("Choose a business.");
      const closed = stage === "won" || stage === "lost";
      const row = {
        business_id: biz, name: name.trim(), contact: contact.trim() || null, stage, value: value ? num(value) : null,
        offer_id: offerId || null, source: source.trim() || null, notes: notes.trim() || null,
        closed_on: closed ? (initial?.closed_on && (initial.stage === "won" || initial.stage === "lost") ? initial.closed_on : today) : null,
        ...(initial ? {} : { created_on: today }),
      };
      if (initial) await update("deals", initial.id, row);
      else await insert("deals", row);
      onDone?.();
      return stage === "won" ? "Deal won — record the sale when it's invoiced or paid." : "Pipeline updated.";
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business">
          <Select value={biz} onChange={(e) => setBiz(e.target.value)}>
            {data.businesses.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Company / person"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
        <Field label="Contact"><Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} placeholder="optional" /></Field>
        <Field label="Potential value"><NumberInput value={value} onChange={setValue} suffix="$" /></Field>
        <Field label="Lead source"><Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} placeholder="optional" /></Field>
      </div>
      <Field label="Offer">
        <Select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
          <option value="">—</option>
          {data.offers.filter((o) => o.business_id === biz).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-[64px]" /></Field>
      <p className="text-[11.5px] text-faint">Pipeline value is a possibility, not revenue. It never counts toward revenue, cash or the goal.</p>
      <Button type="submit" busy={busy} className="w-full">{initial ? "Save deal" : "Add to pipeline"}</Button>
    </form>
  );
}

/** Today's counts for each activity metric, saved per metric per day. */
export function ActivityLogger({ businessId, date }: { businessId?: string; date: string }) {
  const { data, upsert, remove } = useStore();
  const { toast } = useFeedback();
  const metrics = data.metrics.filter((m) => m.active && (!businessId || m.business_id === businessId));
  const [pending, setPending] = useState<Record<string, number>>({});
  if (!metrics.length) return <p className="text-[13px] text-faint">No activity metrics yet. Add them in a business workspace.</p>;
  const current = (m: ActivityMetric) => pending[m.id] ?? data.activityLogs.find((a) => a.metric_id === m.id && a.log_date === date)?.count ?? 0;
  const save = async (m: ActivityMetric, v: number) => {
    setPending((p) => ({ ...p, [m.id]: v }));
    try {
      const existing = data.activityLogs.find((a) => a.metric_id === m.id && a.log_date === date);
      if (v === 0 && existing) await remove("activityLogs", existing.id);
      else if (v > 0) await upsert("activityLogs", { metric_id: m.id, log_date: date, count: v }, "metric_id,log_date");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPending((p) => {
        const { [m.id]: _drop, ...rest } = p;
        void _drop;
        return rest;
      });
    }
  };
  const byBiz = data.businesses.filter((b) => metrics.some((m) => m.business_id === b.id));
  return (
    <div className="space-y-5">
      {byBiz.map((b) => (
        <div key={b.id}>
          {!businessId && <div className="eyebrow mb-2">{b.name}</div>}
          <ul className="divide-y divide-hair">
            {metrics.filter((m) => m.business_id === b.id).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[14px] text-bone">{m.label}</div>
                  <div className="text-[11.5px] text-faint">{m.daily_target ? `Target ${m.daily_target}/day` : m.weekly_target ? `Target ${m.weekly_target}/week` : "No target set"}</div>
                </div>
                <Stepper value={current(m)} onChange={(v) => save(m, v)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
