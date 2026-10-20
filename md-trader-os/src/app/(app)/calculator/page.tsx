"use client";

import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { Quote } from "@/lib/types";
import { Eyebrow, Panel, SectionHeading } from "@/components/primitives";
import { Field, Segmented, Stat, TextInput, fmtMoney, num } from "@/components/os";
import { getAsset, pipSize, pipUnit, TRADABLE_ASSETS } from "@/lib/data/universe";
import { usePlan } from "@/lib/os/store";
import { expectedWorstStreak, streakProbability } from "@/lib/os/analytics";
import { fmtPrice } from "@/lib/utils/format";
import { readQuery } from "@/lib/route";

/* ------------------------------ instrument specs ------------------------------ */

/**
 * CFD / spot contract sizes — units of the base per 1.00 lot. Forex is the
 * universal 100,000. The rest are the most common retail sizes, and they DO
 * vary by broker, which is why the field stays editable.
 */
function defaultContract(symbol: string): number {
  const a = getAsset(symbol);
  if (!a) return 100_000;
  if (a.assetClass === "forex") return 100_000;
  switch (a.symbol) {
    case "XAU/USD": return 100;
    case "XAG/USD": return 5_000;
    case "WTI":
    case "BRENT": return 1_000;
    case "NATGAS": return 10_000;
    case "COPPER": return 25_000;
    default: return 1; // index CFDs: one unit of the index per lot at most brokers
  }
}

/** The currency the instrument's price — and so its P/L — is denominated in. */
function quoteCurrency(symbol: string): string {
  const a = getAsset(symbol);
  if (a?.currencies?.[1]) return a.currencies[1];
  switch (a?.symbol) {
    case "GER40": return "EUR";
    case "UK100": return "GBP";
    case "HK50": return "HKD";
    default: return "USD";
  }
}

/** Exchange-traded futures: dollars (or euros, pounds) per one full point of price. */
const FUTURES: { code: string; name: string; symbol: string; multiplier: number; currency: string; tick: number }[] = [
  { code: "NQ", name: "E-mini Nasdaq-100", symbol: "NAS100", multiplier: 20, currency: "USD", tick: 0.25 },
  { code: "MNQ", name: "Micro E-mini Nasdaq-100", symbol: "NAS100", multiplier: 2, currency: "USD", tick: 0.25 },
  { code: "ES", name: "E-mini S&P 500", symbol: "SPX500", multiplier: 50, currency: "USD", tick: 0.25 },
  { code: "MES", name: "Micro E-mini S&P 500", symbol: "SPX500", multiplier: 5, currency: "USD", tick: 0.25 },
  { code: "YM", name: "E-mini Dow", symbol: "US30", multiplier: 5, currency: "USD", tick: 1 },
  { code: "MYM", name: "Micro E-mini Dow", symbol: "US30", multiplier: 0.5, currency: "USD", tick: 1 },
  { code: "RTY", name: "E-mini Russell 2000", symbol: "US2000", multiplier: 50, currency: "USD", tick: 0.1 },
  { code: "M2K", name: "Micro E-mini Russell 2000", symbol: "US2000", multiplier: 5, currency: "USD", tick: 0.1 },
  { code: "FDAX", name: "DAX future", symbol: "GER40", multiplier: 25, currency: "EUR", tick: 1 },
  { code: "FDXM", name: "Mini-DAX future", symbol: "GER40", multiplier: 5, currency: "EUR", tick: 1 },
  { code: "NKD", name: "Nikkei 225 (USD)", symbol: "JPN225", multiplier: 5, currency: "USD", tick: 5 },
  { code: "GC", name: "Gold", symbol: "XAU/USD", multiplier: 100, currency: "USD", tick: 0.1 },
  { code: "MGC", name: "Micro Gold", symbol: "XAU/USD", multiplier: 10, currency: "USD", tick: 0.1 },
  { code: "SI", name: "Silver", symbol: "XAG/USD", multiplier: 5_000, currency: "USD", tick: 0.005 },
  { code: "SIL", name: "Micro Silver (1,000 oz)", symbol: "XAG/USD", multiplier: 1_000, currency: "USD", tick: 0.005 },
  { code: "CL", name: "Crude Oil (WTI)", symbol: "WTI", multiplier: 1_000, currency: "USD", tick: 0.01 },
  { code: "MCL", name: "Micro Crude Oil", symbol: "WTI", multiplier: 100, currency: "USD", tick: 0.01 },
  { code: "NG", name: "Natural Gas", symbol: "NATGAS", multiplier: 10_000, currency: "USD", tick: 0.001 },
  { code: "HG", name: "Copper", symbol: "COPPER", multiplier: 25_000, currency: "USD", tick: 0.0005 },
];

const RATE_SYMBOLS = ["EUR/USD", "GBP/USD", "AUD/USD", "NZD/USD", "USD/CAD", "USD/CHF", "USD/JPY"];
/** The Hong Kong dollar is pegged in a 7.75–7.85 band; the midpoint is close enough for sizing. */
const USD_PER_HKD = 1 / 7.8;

function usdPerUnit(quotes: Quote[]): Record<string, number> {
  const px = (s: string) => quotes.find((q) => q.symbol.toUpperCase() === s)?.price;
  const out: Record<string, number> = { USD: 1, HKD: USD_PER_HKD };
  for (const ccy of ["EUR", "GBP", "AUD", "NZD"]) {
    const p = px(`${ccy}/USD`);
    if (p) out[ccy] = p;
  }
  for (const ccy of ["CAD", "CHF", "JPY"]) {
    const p = px(`USD/${ccy}`);
    if (p) out[ccy] = 1 / p;
  }
  return out;
}

export default function CalculatorPage() {
  const [plan, , planReady] = usePlan();
  const [mode, setMode] = useState<"cfd" | "futures">("cfd");
  const [symbol, setSymbol] = useState("EUR/USD");
  const [future, setFuture] = useState("MNQ");
  const [account, setAccount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [riskPct, setRiskPct] = useState("1");
  const [stop, setStop] = useState("20");
  const [entry, setEntry] = useState("");
  const [contract, setContract] = useState(String(defaultContract("EUR/USD")));

  useEffect(() => {
    if (!planReady) return;
    if (plan.accountSize) setAccount(String(plan.accountSize));
    setCurrency(plan.accountCurrency);
    setRiskPct(String(plan.riskPerTradePct));
    const q = readQuery();
    const sym = q.get("symbol");
    if (sym && getAsset(sym)) {
      setSymbol(getAsset(sym)!.symbol);
      setContract(String(defaultContract(sym)));
    }
    if (q.get("stop")) setStop(q.get("stop")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planReady]);

  const spec = FUTURES.find((f) => f.code === future)!;
  const priced = mode === "cfd" ? symbol : spec.symbol;
  const quotes = useApi<{ quotes: Quote[]; demo: boolean }>(
    `/api/quotes?symbols=${encodeURIComponent([...RATE_SYMBOLS, priced].join(","))}`,
    [priced],
  );
  const rates = useMemo(() => usdPerUnit(quotes.data?.quotes ?? []), [quotes.data]);
  const price = quotes.data?.quotes.find((q) => q.symbol.toUpperCase() === priced.toUpperCase())?.price ?? null;

  const acct = num(account);
  const pct = num(riskPct);
  const riskMoney = acct != null && pct != null ? (acct * pct) / 100 : null;
  const stopUnits = num(stop);
  const pip = pipSize(symbol);
  const unit = pipUnit(symbol);
  const toAccount = (ccy: string) => (rates[ccy] && rates[currency] ? rates[ccy] / rates[currency] : null);

  /* ----------------------------------- CFD ----------------------------------- */
  const contractSize = num(contract) ?? defaultContract(symbol);
  const qCcy = quoteCurrency(symbol);
  const pipValueQuote = contractSize * pip; // per 1.00 lot, in the quote currency
  const conv = toAccount(qCcy);
  const pipValueAcct = conv != null ? pipValueQuote * conv : null;
  const lotsExact = riskMoney != null && stopUnits && pipValueAcct ? riskMoney / (stopUnits * pipValueAcct) : null;
  const lots = lotsExact != null ? Math.floor(lotsExact * 100) / 100 : null;
  const actualRisk = lots != null && stopUnits && pipValueAcct ? lots * stopUnits * pipValueAcct : null;

  /* --------------------------------- futures --------------------------------- */
  const fConv = toAccount(spec.currency);
  const perContract = stopUnits && fConv != null ? stopUnits * spec.multiplier * fConv : null;
  const contracts = riskMoney != null && perContract ? Math.floor(riskMoney / perContract) : null;
  const fActual = contracts != null && perContract ? contracts * perContract : null;

  const sizeOk = mode === "cfd" ? lots != null && lots > 0 : contracts != null && contracts > 0;
  const e = num(entry);
  const stopDistancePrice = stopUnits != null ? (mode === "cfd" ? stopUnits * pip : stopUnits) : null;
  const precision = getAsset(priced)?.precision ?? 5;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading
        title="Risk Calculator"
        subtitle="Decide the loss first. Let the stop decide the size. Every trade then risks the same, whatever the market."
      />

      <div className="max-w-sm">
        <Segmented value={mode} onChange={setMode} options={[{ value: "cfd", label: "Forex & CFDs (lots)" }, { value: "futures", label: "Futures (contracts)" }]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel className="space-y-4 p-5">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Account size"><TextInput value={account} onChange={setAccount} inputMode="decimal" placeholder="10000" /></Field>
            <Field label="Currency">
              <select value={currency} onChange={(ev) => setCurrency(ev.target.value)} className="w-full px-3 py-2 text-sm">
                {["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY", "NZD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Risk per trade %" hint={riskMoney != null ? `= ${fmtMoney(riskMoney, currency, false)} at the stop` : undefined}>
            <TextInput value={riskPct} onChange={setRiskPct} inputMode="decimal" />
          </Field>

          {mode === "cfd" ? (
            <>
              <Field label="Market">
                <select
                  value={symbol}
                  onChange={(ev) => { setSymbol(ev.target.value); setContract(String(defaultContract(ev.target.value))); }}
                  className="w-full px-3 py-2 text-sm"
                >
                  {Array.from(new Set(TRADABLE_ASSETS.map((a) => a.group))).map((g) => (
                    <optgroup key={g} label={g}>
                      {TRADABLE_ASSETS.filter((a) => a.group === g).map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Stop (${unit})`}><TextInput value={stop} onChange={setStop} inputMode="decimal" /></Field>
                <Field
                  label="Contract size / lot"
                  hint={getAsset(symbol)?.assetClass === "forex" ? "Standard lot." : "Check your broker's spec — this varies."}
                >
                  <TextInput value={contract} onChange={setContract} inputMode="decimal" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Contract">
                <select value={future} onChange={(ev) => setFuture(ev.target.value)} className="w-full px-3 py-2 text-sm">
                  {FUTURES.map((f) => <option key={f.code} value={f.code}>{f.code} — {f.name}</option>)}
                </select>
              </Field>
              <Field label="Stop (points of price)" hint={`One point = ${fmtMoney(spec.multiplier, spec.currency, false)} per contract · tick ${spec.tick}`}>
                <TextInput value={stop} onChange={setStop} inputMode="decimal" />
              </Field>
            </>
          )}
          <Field label="Entry price (optional)" hint="Adds the stop and target prices to the result.">
            <TextInput value={entry} onChange={setEntry} inputMode="decimal" placeholder={price != null ? fmtPrice(price, precision) : ""} />
          </Field>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="gold-line" />
          <div className="space-y-5 p-5">
            {mode === "cfd" ? (
              <>
                <div>
                  <Eyebrow>Position size</Eyebrow>
                  <div className={`ticker display mt-1 text-5xl font-extrabold tracking-tight ${sizeOk ? "text-gold" : "text-mute"}`}>
                    {lots != null ? lots.toFixed(2) : "—"} <span className="text-lg text-mute">lots</span>
                  </div>
                  {lots != null ? (
                    <div className="mt-1 text-xs text-faint">
                      {Math.round(lots * contractSize).toLocaleString()} units · {(lots * 10).toFixed(1)} mini · {(lots * 100).toFixed(0)} micro
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-hairline-soft pt-4">
                  <Stat label={`Value per ${unit.slice(0, -1)} · 1 lot`} value={pipValueAcct != null ? fmtMoney(pipValueAcct, currency, false) : "—"} />
                  <Stat label="Risk at this size" value={actualRisk != null ? fmtMoney(actualRisk, currency, false) : "—"} />
                </div>
                {lots === 0 && lotsExact != null ? (
                  <p className="border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-gold">
                    The correct size is below 0.01 lots. The stop is too wide for this account at this risk — skip the trade or find a tighter zone.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <Eyebrow>Position size</Eyebrow>
                  <div className={`ticker display mt-1 text-5xl font-extrabold tracking-tight ${sizeOk ? "text-gold" : "text-mute"}`}>
                    {contracts ?? "—"} <span className="text-lg text-mute">{spec.code}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-hairline-soft pt-4">
                  <Stat label="Risk per contract" value={perContract != null ? fmtMoney(perContract, currency, false) : "—"} />
                  <Stat label="Risk at this size" value={fActual != null ? fmtMoney(fActual, currency, false) : "—"} />
                </div>
                {contracts === 0 && perContract ? (
                  <p className="border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-gold">
                    One {spec.code} risks more than your limit at this stop.
                    {FUTURES.some((f) => f.symbol === spec.symbol && f.multiplier < spec.multiplier) ? " Try the micro contract." : " Skip the trade or tighten the zone."}
                  </p>
                ) : null}
              </>
            )}

            {e != null && stopDistancePrice ? (
              <div className="border-t border-hairline-soft pt-4">
                <Eyebrow className="mb-2">Levels for a long · short</Eyebrow>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span className="text-faint" />
                  <span className="text-bull">Long</span>
                  <span className="text-bear">Short</span>
                  <span className="text-faint">Stop</span>
                  <span className="ticker">{fmtPrice(e - stopDistancePrice, precision)}</span>
                  <span className="ticker">{fmtPrice(e + stopDistancePrice, precision)}</span>
                  <span className="text-faint">Target {plan.minRR}R</span>
                  <span className="ticker">{fmtPrice(e + stopDistancePrice * plan.minRR, precision)}</span>
                  <span className="ticker">{fmtPrice(e - stopDistancePrice * plan.minRR, precision)}</span>
                </div>
              </div>
            ) : null}

            <p className="text-[11px] text-faint">
              Size is rounded down, never up.{" "}
              {quotes.data?.demo ? "Currency conversion is using demo prices on this deployment — confirm the pip value with your broker." : "Currency conversion uses current prices."}
            </p>
          </div>
        </Panel>
      </div>

      <StreakCalculator riskPct={num(riskPct) ?? 1} />
    </div>
  );
}

function StreakCalculator({ riskPct }: { riskPct: number }) {
  const [winRate, setWinRate] = useState("45");
  const [trades, setTrades] = useState("40");
  const w = Math.min(99, Math.max(1, num(winRate) ?? 45)) / 100;
  const n = Math.min(1000, Math.max(5, Math.round(num(trades) ?? 40)));
  const q = 1 - w;
  const worst = expectedWorstStreak(n, q);
  const rows = [3, 4, 5, 6, 7, 8, 10].map((k) => ({ k, p: streakProbability(n, k, q) }));
  const dd = (1 - Math.pow(1 - riskPct / 100, worst)) * 100;

  return (
    <Panel className="p-5">
      <Eyebrow className="mb-1">Losing-streak calculator</Eyebrow>
      <p className="mb-4 text-xs text-faint">Know what normal looks like, so a normal streak does not convince you the system is broken.</p>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <Field label="Win rate %"><TextInput value={winRate} onChange={setWinRate} inputMode="decimal" /></Field>
          <Field label="Number of trades"><TextInput value={trades} onChange={setTrades} inputMode="numeric" /></Field>
          <div className="border-t border-hairline-soft pt-3">
            <Stat label="Losing streak to expect" value={`${worst} in a row`} tone="text-gold" sub={`At least even odds of seeing it in ${n} trades`} />
            <p className="mt-2 text-xs text-mute">
              At {riskPct}% risk, {worst} losses in a row is a drawdown of about <span className="ticker text-bone">{dd.toFixed(1)}%</span>.
            </p>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-[110px_1fr_56px] gap-x-3 gap-y-2 text-xs">
            {rows.map((r) => (
              <div key={r.k} className="contents">
                <span className="text-mute">{r.k}+ losses in a row</span>
                <div className="flex items-center"><div className="h-1.5 w-full bg-hairline-soft"><div className="h-full bg-gold" style={{ width: `${r.p * 100}%` }} /></div></div>
                <span className="ticker text-right">{(r.p * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-faint">Chance of seeing at least one streak that long, assuming each trade is independent.</p>
        </div>
      </div>
    </Panel>
  );
}
