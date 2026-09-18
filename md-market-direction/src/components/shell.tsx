"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Logo } from "./logo";
import { useApi } from "@/lib/hooks";
import type { Tier } from "@/lib/config/tiers";

interface NavItem {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  minTier?: Tier;
}

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Icon.dashboard },
  { href: "/markets", label: "Markets", icon: Icon.markets },
  { href: "/scanner", label: "Scanner", icon: Icon.scanner },
  { href: "/news", label: "News Intelligence", icon: Icon.news, minTier: "pro" },
  { href: "/calendar", label: "Economic Calendar", icon: Icon.calendar },
];

const PERSONAL: NavItem[] = [
  { href: "/watchlists", label: "Watchlists", icon: Icon.watchlist },
  { href: "/alerts", label: "Alerts", icon: Icon.alerts },
  { href: "/journal", label: "Journal", icon: Icon.journal, minTier: "pro" },
];

const INTELLIGENCE: NavItem[] = [
  { href: "/analyst", label: "AI Analyst", icon: Icon.ai, minTier: "pro" },
  { href: "/momentum", label: "MD Momentum", icon: Icon.momentum, minTier: "elite" },
  { href: "/cross-market", label: "Cross-Market Map", icon: Icon.crossMarket, minTier: "elite" },
  { href: "/backtest", label: "Backtesting", icon: Icon.backtest, minTier: "elite" },
];

const MOBILE: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Icon.dashboard },
  { href: "/markets", label: "Markets", icon: Icon.markets },
  { href: "/scanner", label: "Scanner", icon: Icon.scanner },
  { href: "/alerts", label: "Alerts", icon: Icon.alerts },
  { href: "/settings", label: "Profile", icon: Icon.user },
];

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  tier: Tier;
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-void">
      <DemoBanner />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline-soft bg-ink lg:flex">
          <div className="border-b border-hairline-soft px-5 py-5">
            <Link href="/dashboard"><Logo /></Link>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <NavGroup title="Markets" items={PRIMARY} pathname={pathname} tier={user.tier} />
            <NavGroup title="My Desk" items={PERSONAL} pathname={pathname} tier={user.tier} />
            <NavGroup title="Intelligence" items={INTELLIGENCE} pathname={pathname} tier={user.tier} />
            <NavGroup
              title="Account"
              items={[
                { href: "/settings", label: "Settings", icon: Icon.settings },
                { href: "/subscription", label: "Subscription", icon: Icon.crown },
                ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", icon: Icon.admin }] : []),
              ]}
              pathname={pathname}
              tier={user.tier}
            />
          </nav>
          <div className="border-t border-hairline-soft px-5 py-4">
            <div className="truncate text-xs text-mute">{user.email}</div>
            <div className="mt-1 flex items-center justify-between">
              <TierChip tier={user.tier} />
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-hairline-soft bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
            <Link href="/dashboard"><Logo size={24} /></Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              className="border border-hairline p-2 text-mute"
            >
              {menuOpen ? <Icon.close /> : <Icon.menu />}
            </button>
          </header>

          {menuOpen ? (
            <div className="border-b border-hairline-soft bg-ink px-3 py-4 lg:hidden">
              <NavGroup title="Markets" items={PRIMARY} pathname={pathname} tier={user.tier} />
              <NavGroup title="My Desk" items={PERSONAL} pathname={pathname} tier={user.tier} />
              <NavGroup title="Intelligence" items={INTELLIGENCE} pathname={pathname} tier={user.tier} />
              <NavGroup
                title="Account"
                items={[
                  { href: "/settings", label: "Settings", icon: Icon.settings },
                  { href: "/subscription", label: "Subscription", icon: Icon.crown },
                  ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", icon: Icon.admin }] : []),
                ]}
                pathname={pathname}
                tier={user.tier}
              />
              <LogoutButton className="mt-2 w-full" />
            </div>
          ) : null}

          <main className="min-h-screen px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
          <Disclaimer />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hairline bg-ink/97 backdrop-blur lg:hidden">
        {MOBILE.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-widest ${
                active ? "text-gold" : "text-faint"
              }`}
            >
              <item.icon />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  tier,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  tier: Tier;
}) {
  const order: Tier[] = ["free", "pro", "elite"];
  return (
    <div className="mb-5">
      <div className="eyebrow px-2 pb-2">{title}</div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const locked = item.minTier ? order.indexOf(tier) < order.indexOf(item.minTier) : false;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`group flex items-center gap-3 px-2 py-2 text-sm transition ${
                  active ? "bg-panel-2 text-gold" : "text-mute hover:bg-panel hover:text-bone"
                }`}
              >
                <span className={active ? "text-gold" : "text-faint group-hover:text-mute"}>
                  <item.icon />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {locked ? <span className="text-[9px] uppercase tracking-widest text-gold-dim">Pro</span> : null}
                {active ? <span className="h-4 w-0.5 bg-gold" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TierChip({ tier }: { tier: Tier }) {
  const map: Record<Tier, string> = {
    free: "border-hairline text-mute",
    pro: "border-gold/50 text-gold",
    elite: "border-gold text-gold-bright",
  };
  return (
    <span className={`border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest ${map[tier]}`}>
      {tier}
    </span>
  );
}

function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className={`text-[10px] uppercase tracking-widest text-faint hover:text-bear ${className}`}
    >
      Sign out
    </button>
  );
}

/** Demo mode must never be mistaken for live market data. */
export function DemoBanner() {
  const { data } = useApi<{ demoMode: boolean; demoSources: string[] }>("/api/status");
  if (!data?.demoMode) return null;
  return (
    <div className="sticky top-0 z-50 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center">
      <p className="display text-[10px] font-bold uppercase tracking-[0.2em] text-gold sm:text-[11px]">
        Demo mode — {data.demoSources.join(", ")} are generated sample data. Connect live data to enable real-time analysis.
      </p>
    </div>
  );
}

export function Disclaimer() {
  return (
    <footer className="mt-10 border-t border-hairline-soft px-4 py-6 text-center sm:px-6 lg:px-8">
      <p className="mx-auto max-w-3xl text-[11px] leading-relaxed text-faint">
        MD Market Direction provides market analysis and educational information. Directional scores are algorithmic
        assessments of available market data and are not guarantees of future performance or investment advice. Markets can
        move unexpectedly, and users are responsible for their own trading and investment decisions.
      </p>
    </footer>
  );
}
