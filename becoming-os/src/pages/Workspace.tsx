import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFeedback } from "@/components/feedback";
import { useSubmit } from "@/components/forms/body";
import { ActivityLogger, DealForm, STAGES, TransactionForm } from "@/components/forms/business";
import { RecordList } from "@/components/RecordList";
import { Button, Card, Field, Input, Meter, NumberInput, PageHeader, Segmented, Select, Sheet, Stat, Textarea } from "@/components/ui";
import { useStore } from "@/data/store";
import { customerStats, monthFinance, pipelineStats, type Ledger } from "@/lib/calc/business";
import { fmtMonth, fmtShort, monthEnd, monthStart, weekStart } from "@/lib/dates";
import { errorMessage, money, num, pct } from "@/lib/format";
import type { ActivityMetric, Customer, Deal, DealStage, Offer } from "@/lib/types";
import { BusinessForm } from "./Business";
import { TransactionList } from "./Log";

export default function Workspace() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, today, update, remove } = useStore();
  const { confirm, toast } = useFeedback();
  const [edit, setEdit] = useState(false);
  const [record, setRecord] = useState(false);
  const b = data.businesses.find((x) => x.id === id);
  if (!b) return <div><Link to="/business" className="link">← Business</Link><p className="mt-6 text-mute">That business doesn't exist.</p></div>;

  const l: Ledger = { transactions: data.transactions, payments: data.payments };
  const f = { businessId: b.id };
  const m = monthFinance(l, today, f);
  const cs = customerStats(l, data.customers, monthStart(today), monthEnd(today), f);
  const pipe = pipelineStats(data.deals, undefined, undefined, f);

  const del = async () => {
    const n = data.transactions.filter((t) => t.business_id === b.id).length;
    const ok = await confirm({
      title: `Delete ${b.name}?`,
      body: `This permanently deletes the workspace and ${n} transaction(s), plus its offers, customers, deals and activity logs. Archive it instead to keep the history.`,
      confirmLabel: "Delete permanently", destructive: true, typeToConfirm: "DELETE",
    });
    if (!ok) return;
    try {
      await remove("businesses", b.id);
      toast("Business deleted.");
      nav("/business");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/business" className="inline-flex items-center gap-1 text-[13px] text-mute hover:text-bone"><ArrowLeft className="h-4 w-4" /> Business</Link>
      <PageHeader eyebrow={`Workspace${b.active ? "" : " · archived"}`} title={b.name} sub={b.description ?? undefined}
        action={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="secondary" onClick={() => update("businesses", b.id, { active: !b.active }).catch((e) => toast(errorMessage(e), "error"))}>{b.active ? "Archive" : "Restore"}</Button>
          <Button onClick={() => setRecord(true)} icon={<Plus className="h-4 w-4" />}>Record</Button>
        </div>} />

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label={`Revenue · ${fmtMonth(today, false)}`} value={money(m.revenue)} sub={b.monthly_target ? `target ${money(b.monthly_target)}` : undefined} accent />
          <Stat label="Cash collected" value={money(m.cashIn)} />
          <Stat label="Expenses" value={money(m.expenses)} />
          <Stat label="Net profit" value={money(m.profit)} />
          <Stat label="Recurring" value={money(m.recurring)} />
          <Stat label="Customers" value={cs.activeNow} sub={`${cs.newCustomers} new this month`} />
          <Stat label="Churn" value={cs.churnPct !== null ? pct(cs.churnPct, 1) : "—"} />
          <Stat label="Win rate" value={pipe.winRate !== null ? pct(pipe.winRate) : "—"} sub={`${pipe.open} open deals`} />
        </div>
        {b.monthly_target ? <Meter className="mt-5" value={m.revenue} max={num(b.monthly_target)} right={pct((m.revenue / num(b.monthly_target)) * 100)} label="Monthly target" /> : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-[24px] leading-none">Today's activity</h2>
          <ActivityLogger businessId={b.id} date={today} />
        </Card>
        <MetricsCard businessId={b.id} />
      </div>

      <Pipeline businessId={b.id} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Offers businessId={b.id} />
        <Customers businessId={b.id} />
      </div>

      <Card>
        <h2 className="mb-2 text-[24px] leading-none">Transactions</h2>
        <TransactionList items={[...data.transactions].filter((t) => t.business_id === b.id).reverse()} limit={30} />
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" size="sm" onClick={del}>Delete workspace</Button>
      </div>

      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit business"><BusinessForm initial={b} onDone={() => setEdit(false)} /></Sheet>
      <Sheet open={record} onClose={() => setRecord(false)} title="Record transaction" wide><TransactionForm businessId={b.id} onDone={() => setRecord(false)} /></Sheet>
    </div>
  );
}

function MetricsCard({ businessId }: { businessId: string }) {
  const { data, today, remove } = useStore();
  const [edit, setEdit] = useState<ActivityMetric | "new" | null>(null);
  const ws = weekStart(today);
  const metrics = data.metrics.filter((m) => m.business_id === businessId);
  const weekCount = (id: string) => data.activityLogs.filter((a) => a.metric_id === id && a.log_date >= ws && a.log_date <= today).reduce((s, a) => s + a.count, 0);
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[24px] leading-none">This week vs targets</h2>
        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Metric</Button>
      </div>
      <div className="space-y-3">
        {metrics.filter((m) => m.active).map((m) => {
          const n = weekCount(m.id);
          const target = m.weekly_target ?? (m.daily_target ? m.daily_target * 5 : null);
          return (
            <button key={m.id} className="block w-full text-left" onClick={() => setEdit(m)}>
              {target ? <Meter thin value={n} max={target} label={<span className="text-bone">{m.label}</span>} right={`${n} / ${target}`} />
                : <div className="flex justify-between text-[12px]"><span className="text-bone">{m.label}</span><span className="num text-mute">{n} · set a target</span></div>}
            </button>
          );
        })}
      </div>
      {metrics.some((m) => !m.active) && <p className="mt-3 text-[11.5px] text-faint">{metrics.filter((m) => !m.active).length} archived metric(s).</p>}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New activity metric" : "Edit metric"}>
        {edit && <MetricForm businessId={businessId} initial={edit === "new" ? undefined : edit} onDone={() => setEdit(null)}
          onDelete={edit !== "new" ? async () => { await remove("metrics", edit.id); setEdit(null); } : undefined} />}
      </Sheet>
    </Card>
  );
}

function MetricForm({ businessId, initial, onDone, onDelete }: { businessId: string; initial?: ActivityMetric; onDone: () => void; onDelete?: () => Promise<void> }) {
  const { data, insert, update } = useStore();
  const { confirm } = useFeedback();
  const { busy, run } = useSubmit();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [kind, setKind] = useState<ActivityMetric["kind"]>(initial?.kind ?? "outreach");
  const [daily, setDaily] = useState(initial?.daily_target != null ? String(initial.daily_target) : "");
  const [weekly, setWeekly] = useState(initial?.weekly_target != null ? String(initial.weekly_target) : "");
  return (
    <div className="space-y-4">
      <Field label="Name"><Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Cold emails" /></Field>
      <Field group label="Type">
        <Segmented value={kind} onChange={setKind} className="w-full" size="sm" options={[
          { value: "outreach", label: "Outreach" }, { value: "content", label: "Content" }, { value: "sales", label: "Sales" }, { value: "audience", label: "Audience" }]} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Daily target"><NumberInput value={daily} onChange={setDaily} step="1" placeholder="optional" /></Field>
        <Field label="Weekly target"><NumberInput value={weekly} onChange={setWeekly} step="1" placeholder="optional" /></Field>
      </div>
      <Button busy={busy} className="w-full" onClick={() => run(async () => {
        if (!label.trim()) throw new Error("Name the metric.");
        const row = { label: label.trim(), kind, daily_target: daily ? Math.round(num(daily)) : null, weekly_target: weekly ? Math.round(num(weekly)) : null };
        if (initial) await update("metrics", initial.id, row);
        else await insert("metrics", { ...row, business_id: businessId, sort_order: data.metrics.length });
        onDone();
        return "Saved.";
      })}>Save</Button>
      {initial && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => run(async () => { await update("metrics", initial.id, { active: !initial.active }); onDone(); return initial.active ? "Archived." : "Restored."; })}>
            {initial.active ? "Archive" : "Restore"}
          </Button>
          {onDelete && <Button variant="danger" size="sm" onClick={async () => {
            if (await confirm({ title: "Delete metric?", body: "Its logged history is deleted too. Archive keeps the history.", confirmLabel: "Delete", destructive: true })) run(async () => { await onDelete(); return "Deleted."; });
          }}>Delete</Button>}
        </div>
      )}
    </div>
  );
}

function Pipeline({ businessId }: { businessId: string }) {
  const { data, today, update, remove } = useStore();
  const { toast } = useFeedback();
  const [edit, setEdit] = useState<Deal | "new" | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const deals = data.deals.filter((d) => d.business_id === businessId);
  const stages = STAGES.filter((s) => showClosed || (s.value !== "won" && s.value !== "lost"));
  const move = (d: Deal, stage: DealStage) => update("deals", d.id, {
    stage, closed_on: stage === "won" || stage === "lost" ? today : null,
  }).then(() => stage === "won" && toast("Won — record the sale when it's invoiced or paid.", "info")).catch((e) => toast(errorMessage(e), "error"));
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[24px] leading-none">Sales pipeline</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowClosed(!showClosed)}>{showClosed ? "Hide closed" : "Show won/lost"}</Button>
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Deal</Button>
        </div>
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <div className="flex gap-3" style={{ minWidth: stages.length * 220 }}>
          {stages.map((s) => {
            const items = deals.filter((d) => d.stage === s.value);
            return (
              <div key={s.value} className="w-[220px] shrink-0 rounded-2xl bg-raised/60 p-3">
                <div className="mb-2 flex justify-between"><span className="eyebrow">{s.label}</span><span className="num text-[11px] text-faint">{items.length}</span></div>
                <div className="space-y-2">
                  {items.map((d) => (
                    <div key={d.id} className="rounded-xl border border-hair bg-panel p-3">
                      <button className="block w-full text-left" onClick={() => setEdit(d)}>
                        <div className="truncate text-[13.5px] text-bone">{d.name}</div>
                        <div className="text-[11.5px] text-faint">{d.value ? money(d.value) : "No value"} · {fmtShort(d.created_on)}</div>
                      </button>
                      <Select aria-label={`Move ${d.name}`} className="mt-2 py-1.5 text-[12px]" value={d.stage} onChange={(e) => move(d, e.target.value as DealStage)}>
                        {STAGES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </Select>
                    </div>
                  ))}
                  {!items.length && <div className="py-3 text-center text-[11.5px] text-faint">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New deal" : "Edit deal"}>
        {edit && <>
          <DealForm businessId={businessId} initial={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />
          {edit !== "new" && <Button variant="danger" size="sm" className="mt-3" onClick={() => remove("deals", edit.id).then(() => setEdit(null)).catch((e) => toast(errorMessage(e), "error"))}>Delete deal</Button>}
        </>}
      </Sheet>
    </Card>
  );
}

function Offers({ businessId }: { businessId: string }) {
  const { data, remove } = useStore();
  const [edit, setEdit] = useState<Offer | "new" | null>(null);
  const offers = data.offers.filter((o) => o.business_id === businessId);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[24px] leading-none">Offers</h2>
        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Offer</Button>
      </div>
      <p className="mb-2 text-[11.5px] text-faint">Prices are editable defaults used for “sales needed” estimates — not expected sales.</p>
      <RecordList items={offers.map((o) => ({
        id: o.id, primary: `${o.name}${o.active ? "" : " (archived)"}`,
        secondary: [o.billing === "monthly" ? "monthly" : o.billing === "installment" ? "installments" : "one-time", o.term_months && `${o.term_months} months`].filter(Boolean).join(" · "),
        right: o.price != null ? `${money(o.price)}${o.billing === "monthly" ? "/mo" : ""}` : <span className="text-faint">set price</span>,
        onEdit: () => setEdit(o), onDelete: () => remove("offers", o.id), deleteLabel: "this offer",
        deleteWarning: "Sales linked to it keep their amounts but lose the offer link.",
      }))} empty="No offers yet." />
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New offer" : "Edit offer"}>
        {edit && <OfferForm businessId={businessId} initial={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </Card>
  );
}

function OfferForm({ businessId, initial, onDone }: { businessId: string; initial?: Offer; onDone: () => void }) {
  const { insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [billing, setBilling] = useState<Offer["billing"]>(initial?.billing ?? "one_time");
  const [term, setTerm] = useState(initial?.term_months != null ? String(initial.term_months) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  return (
    <div className="space-y-4">
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price"><NumberInput value={price} onChange={setPrice} suffix="$" /></Field>
        <Field label="Billing">
          <Select value={billing} onChange={(e) => setBilling(e.target.value as Offer["billing"])}>
            <option value="one_time">One-time</option><option value="monthly">Monthly</option><option value="installment">Installments</option>
          </Select>
        </Field>
        <Field label="Term (months)"><NumberInput value={term} onChange={setTerm} step="1" placeholder="optional" /></Field>
        <Field label="Status">
          <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}><option value="1">Active</option><option value="0">Archived</option></Select>
        </Field>
      </div>
      <Button busy={busy} className="w-full" onClick={() => run(async () => {
        if (!name.trim()) throw new Error("Name the offer.");
        const row = { name: name.trim(), price: price === "" ? null : num(price), billing, term_months: term ? Math.round(num(term)) : null, active };
        if (initial) await update("offers", initial.id, row);
        else await insert("offers", { ...row, business_id: businessId });
        onDone();
        return "Offer saved.";
      })}>Save offer</Button>
    </div>
  );
}

function Customers({ businessId }: { businessId: string }) {
  const { data, remove } = useStore();
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const list = data.customers.filter((c) => c.business_id === businessId);
  const revenue = (id: string) => data.transactions.filter((t) => t.customer_id === id && t.kind === "sale").reduce((s, t) => s + num(t.amount), 0);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[24px] leading-none">Customers</h2>
        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Customer</Button>
      </div>
      <RecordList limit={25} items={list.map((c) => ({
        id: c.id, primary: c.name,
        secondary: [c.status, c.started_on && `since ${fmtShort(c.started_on)}`, c.churned_on && `churned ${fmtShort(c.churned_on)}`, c.source].filter(Boolean).join(" · "),
        right: money(revenue(c.id)), onEdit: () => setEdit(c), onDelete: () => remove("customers", c.id), deleteLabel: "this customer",
        deleteWarning: "Their sales stay recorded but are unlinked from a customer.",
      }))} empty="Customers appear here when you link them to sales." />
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New customer" : "Edit customer"}>
        {edit && <CustomerForm businessId={businessId} initial={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </Card>
  );
}

function CustomerForm({ businessId, initial, onDone }: { businessId: string; initial?: Customer; onDone: () => void }) {
  const { today, insert, update } = useStore();
  const { busy, run } = useSubmit();
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState<Customer["status"]>(initial?.status ?? "active");
  const [started, setStarted] = useState(initial?.started_on ?? today);
  const [churned, setChurned] = useState(initial?.churned_on ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <div className="space-y-4">
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={status} onChange={(e) => { const v = e.target.value as Customer["status"]; setStatus(v); if (v === "churned" && !churned) setChurned(today); }}>
            <option value="active">Active</option><option value="paused">Paused</option><option value="churned">Churned</option>
          </Select>
        </Field>
        <Field label="Source"><Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} /></Field>
        <Field label="Customer since"><Input type="date" value={started} max={today} onChange={(e) => setStarted(e.target.value)} /></Field>
        {status === "churned" && <Field label="Churned on"><Input type="date" value={churned} max={today} onChange={(e) => setChurned(e.target.value)} /></Field>}
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="min-h-[64px]" /></Field>
      <Button busy={busy} className="w-full" onClick={() => run(async () => {
        if (!name.trim()) throw new Error("Enter a name.");
        if (status === "churned" && churned && started && churned < started) throw new Error("Churn date can't be before the start date.");
        const row = { name: name.trim(), status, started_on: started || null, churned_on: status === "churned" ? churned || today : null, source: source.trim() || null, notes: notes.trim() || null };
        if (initial) await update("customers", initial.id, row);
        else await insert("customers", { ...row, business_id: businessId });
        onDone();
        return "Customer saved.";
      })}>Save customer</Button>
    </div>
  );
}
