import { Suspense, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/shell";
import { anonymousViewer } from "@/lib/auth/public";
import { installApi } from "./api";
import { installRouter, startAt, useLocation } from "./router";

import AdminPage from "@/app/(app)/admin/page";
import AlertsPage from "@/app/(app)/alerts/page";
import AnalystPage from "@/app/(app)/analyst/page";
import BacktestPage from "@/app/(app)/backtest/page";
import CalculatorPage from "@/app/(app)/calculator/page";
import CalendarPage from "@/app/(app)/calendar/page";
import CrossMarketPage from "@/app/(app)/cross-market/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import JournalPage from "@/app/(app)/journal/page";
import MarketsPage from "@/app/(app)/markets/page";
import MarketDetailPage from "@/app/(app)/markets/[symbol]/page";
import MindsetPage from "@/app/(app)/mindset/page";
import MomentumPage from "@/app/(app)/momentum/page";
import PlanPage from "@/app/(app)/plan/page";
import ResetPage from "@/app/(app)/reset/page";
import ReviewPage from "@/app/(app)/review/page";
import ScannerPage from "@/app/(app)/scanner/page";
import SettingsPage from "@/app/(app)/settings/page";
import SubscriptionPage from "@/app/(app)/subscription/page";
import TodayPage from "@/app/(app)/today/page";
import VisionPage from "@/app/(app)/vision/page";
import WatchlistsPage from "@/app/(app)/watchlists/page";
import WickCatcherPage from "@/app/(app)/wick-catcher/page";

/**
 * MD TRADER OS — SINGLE-FILE PREVIEW.
 *
 * The deployed app's own pages, shell and engine, mounted without a server so
 * the whole thing can be opened from one file. Market data is the app's demo
 * generator; the trader's own data lives in this browser, as it does live.
 */

const PAGES: Record<string, ComponentType> = {
  "/admin": AdminPage,
  "/alerts": AlertsPage,
  "/analyst": AnalystPage,
  "/backtest": BacktestPage,
  "/calculator": CalculatorPage,
  "/calendar": CalendarPage,
  "/cross-market": CrossMarketPage,
  "/dashboard": DashboardPage,
  "/journal": JournalPage,
  "/markets": MarketsPage,
  "/mindset": MindsetPage,
  "/momentum": MomentumPage,
  "/plan": PlanPage,
  "/reset": ResetPage,
  "/review": ReviewPage,
  "/scanner": ScannerPage,
  "/settings": SettingsPage,
  "/subscription": SubscriptionPage,
  "/today": TodayPage,
  "/vision": VisionPage,
  "/watchlists": WatchlistsPage,
  "/wick-catcher": WickCatcherPage,
};

/**
 * The market page reads its symbol with React's use(params). A thenable that
 * is already marked fulfilled is read synchronously, and caching one per
 * symbol keeps it the same object across renders, so nothing suspends.
 */
const params = new Map<string, Promise<{ symbol: string }>>();
function paramsFor(symbol: string) {
  let p = params.get(symbol);
  if (!p) {
    const value = { symbol };
    p = Object.assign(Promise.resolve(value), { status: "fulfilled", value });
    params.set(symbol, p);
  }
  return p;
}

function App() {
  const { path, search } = useLocation();
  const viewer = anonymousViewer();
  const detail = path.match(/^\/markets\/(.+)$/);
  const Page = PAGES[path] ?? DashboardPage;
  // Keyed by the full location, so following a link to the same page with a
  // new ?symbol= mounts it fresh and it reads the new query.
  const key = `${path}?${search}`;
  return (
    <AppShell user={{ id: viewer.id, name: viewer.name, email: viewer.email, role: viewer.role, tier: viewer.tier }}>
      <Suspense fallback={null}>
        {detail ? <MarketDetailPage key={key} params={paramsFor(detail[1])} /> : <Page key={key} />}
      </Suspense>
    </AppShell>
  );
}

installApi();
installRouter();
startAt(window.location.hash);
document.body.className = "min-h-screen bg-void text-bone antialiased";
createRoot(document.getElementById("root")!).render(<App />);
