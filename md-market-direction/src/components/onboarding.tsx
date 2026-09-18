"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/hooks";
import { MODE_TIMEFRAMES } from "@/lib/config/scoring";
import type { TradingMode } from "@/lib/types";
import { Logo } from "./logo";
import { Eyebrow, GhostButton, GoldButton, Panel } from "./primitives";

const MARKET_GROUPS = [
  { group: "Forex Majors", label: "Forex" },
  { group: "Stocks", label: "Stocks" },
  { group: "Crypto", label: "Crypto" },
  { group: "Metals", label: "Gold & Silver" },
  { group: "US Indices", label: "Indices" },
  { group: "Commodities", label: "Commodities" },
];

const STARTER_LISTS: Record<string, string[]> = {
  "Forex Majors": ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY"],
  Stocks: ["NVDA", "AAPL", "TSLA", "MSFT"],
  Crypto: ["BTC/USD", "ETH/USD", "SOL/USD"],
  Metals: ["XAU/USD", "XAG/USD"],
  "US Indices": ["SPX", "NDX", "DJI"],
  Commodities: ["WTI", "COPPER"],
};

export function OnboardingFlow({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [markets, setMarkets] = useState<string[]>(["Forex Majors", "Metals", "US Indices"]);
  const [mode, setMode] = useState<TradingMode>("day");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const suggested = Array.from(new Set(markets.flatMap((g) => STARTER_LISTS[g] ?? [])));

  async function finish() {
    setBusy(true);
    try {
      await postJson("/api/user", { preferences: { mode, markets }, onboarded: true, acceptDisclaimer: true }, "PATCH");
      if (watchlist.length) {
        await postJson("/api/watchlists", { name: "My Markets", symbols: watchlist });
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      title: "Welcome to MD Market Direction",
      subtitle: "Your global market intelligence command center.",
      body: (
        <div className="space-y-4 text-sm text-mute">
          <p>
            Instead of jumping between charts, news sites, calendars and scanners, you get one transparent directional read per market —
            and the evidence behind it.
          </p>
          <div className="border border-gold/30 bg-gold/5 p-4 text-xs text-gold">
            The MD Direction Score measures how strongly current evidence aligns. It is not a probability, and nothing in this product is
            financial advice.
          </div>
        </div>
      ),
    },
    {
      title: "Choose your markets",
      subtitle: "You can change this at any time in Settings.",
      body: (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MARKET_GROUPS.map((m) => {
            const on = markets.includes(m.group);
            return (
              <button
                key={m.group}
                onClick={() => setMarkets(on ? markets.filter((g) => g !== m.group) : [...markets, m.group])}
                className={`border px-4 py-5 font-display text-xs font-semibold uppercase tracking-widest transition ${
                  on ? "border-gold bg-gold/10 text-gold" : "border-hairline text-mute hover:border-gold/50"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "Choose your style",
      subtitle: "This decides which timeframes carry the most weight in your scores.",
      body: (
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(MODE_TIMEFRAMES) as TradingMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`border px-4 py-4 text-left transition ${
                mode === m ? "border-gold bg-gold/10" : "border-hairline hover:border-gold/50"
              }`}
            >
              <div className="display text-sm font-bold uppercase tracking-widest">{MODE_TIMEFRAMES[m].label}</div>
              <div className="mt-1 text-xs text-mute">{MODE_TIMEFRAMES[m].blurb}</div>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Build your first watchlist",
      subtitle: "Pick the markets you want on your dashboard.",
      body: (
        <div className="flex flex-wrap gap-2">
          {suggested.map((s) => {
            const on = watchlist.includes(s);
            return (
              <button
                key={s}
                onClick={() => setWatchlist(on ? watchlist.filter((x) => x !== s) : [...watchlist, s])}
                className={`border px-3 py-2 font-display text-xs font-semibold uppercase tracking-widest transition ${
                  on ? "border-gold bg-gold/10 text-gold" : "border-hairline text-mute hover:border-gold/50"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "Your market dashboard is ready",
      subtitle: `Welcome aboard${name ? `, ${name}` : ""}.`,
      body: (
        <div className="space-y-3 text-sm text-mute">
          <p>You are set up for <span className="text-gold">{MODE_TIMEFRAMES[mode].label}</span> across {markets.length} market groups{watchlist.length ? `, with ${watchlist.length} markets on your watchlist` : ""}.</p>
          <p>Open any market and press <span className="display text-gold">WHY?</span> to see exactly what is driving its score.</p>
        </div>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-4 py-12">
      <div className="w-full max-w-xl">
        <Logo size={30} />
        <div className="mt-6 flex gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className={`h-0.5 flex-1 ${i <= step ? "bg-gold" : "bg-hairline"}`} />
          ))}
        </div>

        <Panel className="mt-6 p-7">
          <Eyebrow>Step {step + 1} of {steps.length}</Eyebrow>
          <h1 className="display mt-2 text-2xl font-extrabold uppercase tracking-tight">{current.title}</h1>
          <p className="mt-1.5 text-sm text-mute">{current.subtitle}</p>
          <div className="mt-6">{current.body}</div>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="text-xs uppercase tracking-widest text-faint disabled:opacity-30 hover:text-mute"
            >
              Back
            </button>
            {step === steps.length - 1 ? (
              <GoldButton onClick={finish} disabled={busy}>{busy ? "Setting up…" : "Open my dashboard"}</GoldButton>
            ) : (
              <GhostButton onClick={() => setStep((s) => s + 1)}>Continue</GhostButton>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
