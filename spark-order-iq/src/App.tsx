import { useEffect, useMemo, useState } from "react";
import { AddEarningsSheet, type EarningsSeed } from "./components/AddEarningsSheet";
import { Nav, type Tab } from "./components/Nav";
import { dailyProgress } from "./lib/stats";
import type { OfferDraft } from "./lib/types";
import { Analyze } from "./screens/Analyze";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { SettingsScreen } from "./screens/Settings";
import { Stats } from "./screens/Stats";
import { useStore } from "./state/store";

export default function App() {
  const { settings, orders } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [seed, setSeed] = useState<OfferDraft | null>(null);
  const [earningsSeed, setEarningsSeed] = useState<EarningsSeed | null>(null);
  const [earningsOpen, setEarningsOpen] = useState(false);

  // Today's numbers are needed by both the dashboard and the scoring engine.
  const progress = useMemo(() => dailyProgress(orders, settings), [orders, settings]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduced-motion", settings.reducedMotion);
  }, [settings.reducedMotion]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const openAnalyze = (draft: OfferDraft | null = null) => {
    setSeed(draft);
    setTab("analyze");
  };

  const openEarnings = (next: EarningsSeed | null = null) => {
    setEarningsSeed(next);
    setEarningsOpen(true);
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4">
      {tab === "home" ? (
        <Home progress={progress} onAnalyze={() => openAnalyze()} onAddEarnings={() => openEarnings()} onSeeStats={() => setTab("stats")} />
      ) : null}
      {tab === "analyze" ? (
        <Analyze
          progress={progress}
          seed={seed}
          onSeedConsumed={() => setSeed(null)}
          onLogOrder={(next) => openEarnings(next)}
          onOpenSettings={() => setTab("settings")}
        />
      ) : null}
      {tab === "history" ? <History onAddEarnings={() => openEarnings()} onAnalyze={() => openAnalyze()} /> : null}
      {tab === "stats" ? <Stats /> : null}
      {tab === "settings" ? <SettingsScreen /> : null}

      <AddEarningsSheet
        open={earningsOpen}
        seed={earningsSeed}
        onClose={() => {
          setEarningsOpen(false);
          setEarningsSeed(null);
        }}
        onSaved={() => {
          setEarningsOpen(false);
          setEarningsSeed(null);
          setTab("home");
        }}
      />

      <Nav tab={tab} onChange={setTab} />
    </div>
  );
}
