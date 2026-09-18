import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { publicMode } from "@/lib/auth/public";
import { LandingPreview } from "@/components/landing-preview";
import { Logo } from "@/components/logo";
import { TIERS, TIER_ORDER } from "@/lib/config/tiers";
import { Icon } from "@/components/icons";

export default async function LandingPage() {
  const user = await currentUser();
  if (user) redirect(user.onboarded ? "/dashboard" : "/onboarding");
  // On an open instance the marketing page is a wall in front of a product the
  // visitor is already allowed to use.
  if (publicMode()) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-void">
      {/* ---------------------------------- NAV ---------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-hairline-soft bg-void/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-4">
            <Link href="#pricing" className="hidden text-xs uppercase tracking-widest text-mute hover:text-bone sm:block">Pricing</Link>
            <Link href="#how" className="hidden text-xs uppercase tracking-widest text-mute hover:text-bone sm:block">How it works</Link>
            <Link href="/login" className="text-xs uppercase tracking-widest text-mute hover:text-bone">Sign in</Link>
            <Link href="/signup" className="bg-gold px-4 py-2 font-display text-[11px] font-bold uppercase tracking-widest text-void hover:bg-gold-bright">
              Start analyzing
            </Link>
          </nav>
        </div>
      </header>

      {/* --------------------------------- HERO ---------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <div className="eyebrow mb-5 text-gold">Global Market Intelligence</div>
            <h1 className="display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
              Know the<br />Direction.
            </h1>
            <p className="display mt-3 text-2xl font-semibold text-gold sm:text-3xl">Understand the Why.</p>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-mute">
              AI-powered market intelligence for stocks, forex, crypto, gold, indices, and commodities. One transparent
              directional bias per market — with the evidence that produced it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="bg-gold px-7 py-3.5 font-display text-xs font-bold uppercase tracking-widest text-void transition hover:bg-gold-bright">
                Start analyzing
              </Link>
              <Link href="/login" className="border border-hairline px-7 py-3.5 font-display text-xs font-semibold uppercase tracking-widest text-mute transition hover:border-gold hover:text-gold">
                Explore markets
              </Link>
            </div>
            <p className="mt-5 text-xs text-faint">
              Free to start. No card required. Directional analysis — not financial advice.
            </p>
          </div>

          <div className="lg:pl-4">
            <LandingPreview />
          </div>
        </div>
      </section>

      {/* -------------------------------- PROBLEM -------------------------------- */}
      <section className="border-y border-hairline-soft bg-ink">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="eyebrow mb-4">The problem</div>
            <h2 className="display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
              Markets move because of hundreds of interconnected variables
            </h2>
            <p className="mt-4 text-mute">
              To form one opinion on one market, a trader is expected to jump between charts, indicators, news sites, economic
              calendars, correlated markets and scanners — then hold all of it in their head, for every market they follow.
            </p>
            <ul className="mt-5 grid grid-cols-2 gap-2 text-sm text-faint">
              {["Charting platforms", "News websites", "Economic calendars", "Indicator stacks", "Correlation tables", "Market scanners"].map((s) => (
                <li key={s} className="border border-hairline-soft px-3 py-2">{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-4 text-gold">The solution</div>
            <h2 className="display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
              MD Market Direction brings it together
            </h2>
            <p className="mt-4 text-mute">
              The engine reads price structure, momentum, news, macro, cross-market relationships and event risk for every market,
              then produces one number and one explanation you can check line by line.
            </p>
            <div className="mt-6 border border-gold/30 bg-gold/5 p-5">
              <div className="eyebrow mb-2 text-gold">The output</div>
              <p className="display text-lg font-bold uppercase tracking-tight">
                Direction + Score + Evidence + Why + Risks
              </p>
              <p className="mt-2 text-sm text-mute">
                Never a hidden black box. Every point in the score is attributable to a specific observation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ HOW IT WORKS ----------------------------- */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="eyebrow mb-4">How it works</div>
        <div className="grid gap-px bg-hairline-soft sm:grid-cols-3">
          {[
            { n: "01", t: "Analyze", d: "Price structure across six timeframes, momentum, live news classified by theme, macro conditions, cross-market confirmation and the event calendar." },
            { n: "02", t: "Score", d: "Seven weighted evidence categories combine into the MD Direction Score — 0 to 100, where 50 means no directional evidence at all." },
            { n: "03", t: "Explain", d: "Every score opens up into the observations behind it, in plain English, plus exactly what would change the read." },
          ].map((s) => (
            <div key={s.n} className="bg-void p-7">
              <div className="display text-3xl font-extrabold text-gold-dim">{s.n}</div>
              <h3 className="display mt-3 text-lg font-bold uppercase tracking-wide">{s.t}</h3>
              <p className="mt-2 text-sm text-mute">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ MULTI MARKET ----------------------------- */}
      <section className="border-y border-hairline-soft bg-ink py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="eyebrow mb-5 text-center">One engine, every market</div>
          <div className="flex flex-wrap justify-center gap-2">
            {["Forex", "Stocks", "Crypto", "Gold", "Silver", "US Indices", "International Indices", "ETFs", "Commodities", "Bonds & Rates"].map((m) => (
              <span key={m} className="border border-hairline px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-widest text-mute">
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------- FEATURES ------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-px bg-hairline-soft sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Icon.dashboard, t: "MD Direction Score", d: "A 0–100 measure of how strongly the available evidence lines up. Explicitly not a probability — and never presented as one." },
            { icon: Icon.markets, t: "Market Structure", d: "Higher highs, higher lows, breaks of structure and changes of character, detected on every timeframe from 5M to weekly." },
            { icon: Icon.news, t: "AI News Intelligence", d: "Stories are classified by theme, then mapped to the markets that theme actually touches — not scored by counting positive words." },
            { icon: Icon.scanner, t: "Market Radar", d: "Every market ranked by strength of alignment, with filters for structure, momentum, news and event risk." },
            { icon: Icon.crossMarket, t: "Cross-Market Intelligence", d: "Dollar, yields, gold, equities, oil and crypto — the relationships that explain why a market is moving." },
            { icon: Icon.alerts, t: "Alerts That Mean Something", d: "Alert on a score, a direction change, a 50 MA cross, a structure shift, or five factors aligning at once." },
          ].map((f) => (
            <div key={f.t} className="bg-void p-7">
              <div className="mb-4 flex h-9 w-9 items-center justify-center border border-gold/30 text-gold">
                <f.icon />
              </div>
              <h3 className="display text-base font-bold uppercase tracking-wide">{f.t}</h3>
              <p className="mt-2 text-sm text-mute">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------- PRICING -------------------------------- */}
      <section id="pricing" className="border-t border-hairline-soft bg-ink py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="eyebrow mb-2">Pricing</div>
          <h2 className="display text-2xl font-bold uppercase tracking-tight sm:text-3xl">Start free. Upgrade when it earns it.</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {TIER_ORDER.map((id) => {
              const t = TIERS[id];
              return (
                <div key={id} className={`panel flex flex-col p-7 ${id === "pro" ? "border-gold/40" : ""}`}>
                  {id === "pro" ? <div className="gold-line -mx-7 -mt-7 mb-6" /> : null}
                  <div className="eyebrow">{t.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="display text-4xl font-extrabold">${t.priceMonthly}</span>
                    <span className="text-xs text-faint">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-mute">{t.tagline}</p>
                  <ul className="mt-6 flex-1 space-y-2">
                    {t.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 text-gold">✓</span>
                        <span className="text-bone">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-7 block px-5 py-3 text-center font-display text-xs font-bold uppercase tracking-widest transition ${
                      id === "free"
                        ? "border border-hairline text-mute hover:border-gold hover:text-gold"
                        : "bg-gold text-void hover:bg-gold-bright"
                    }`}
                  >
                    {id === "free" ? "Start free" : `Start ${t.name}`}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------- FAQ ---------------------------------- */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="eyebrow mb-6">FAQ</div>
        <div className="divide-y divide-hairline-soft border-y border-hairline-soft">
          {[
            {
              q: "Is the MD Direction Score a prediction?",
              a: "No. It measures how strongly the currently available evidence lines up in one direction. A score of 87 means strong bullish alignment right now — it is not an 87% chance of anything, and the product never phrases it that way.",
            },
            {
              q: "Can I see why a score is what it is?",
              a: "Always. Every score breaks down into seven weighted categories, and every category opens into the specific observations behind it — which moving average, which structure break, which headline, which macro factor.",
            },
            {
              q: "What happens when timeframes disagree?",
              a: "The engine detects the conflict, labels the market MIXED instead of strongly directional, pulls the score toward neutral, and tells you in plain English which timeframes are on which side.",
            },
            {
              q: "Where does the data come from?",
              a: "Through a provider abstraction layer, so licensed market data, news and calendar vendors can be swapped without changing the engine. Without credentials the app runs in a clearly-labelled demo mode — demo data is never presented as live.",
            },
            {
              q: "Is this financial advice?",
              a: "No. MD Market Direction provides market analysis and educational information. You are responsible for your own trading and investment decisions.",
            },
          ].map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="display text-sm font-semibold uppercase tracking-wide">{f.q}</span>
                <span className="text-gold group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-mute">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------------------------- CTA ---------------------------------- */}
      <section className="border-t border-hairline-soft bg-ink py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="display text-3xl font-extrabold uppercase leading-tight tracking-tight sm:text-4xl">
            What&apos;s the market telling you today?
          </h2>
          <p className="mt-4 text-mute">Open one screen instead of twelve.</p>
          <Link href="/signup" className="mt-8 inline-block bg-gold px-9 py-4 font-display text-xs font-bold uppercase tracking-widest text-void transition hover:bg-gold-bright">
            Start analyzing
          </Link>
        </div>
      </section>

      <footer className="border-t border-hairline-soft px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Logo />
          <p className="mt-5 max-w-3xl text-[11px] leading-relaxed text-faint">
            MD Market Direction provides market analysis and educational information. Directional scores are algorithmic assessments of
            available market data and are not guarantees of future performance or investment advice. Markets can move unexpectedly, and users
            are responsible for their own trading and investment decisions.
          </p>
          <p className="mt-4 text-[11px] text-faint">© {new Date().getFullYear()} MD Market Direction</p>
        </div>
      </footer>
    </div>
  );
}
