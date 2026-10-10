import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FeedbackProvider } from "./components/feedback";
import { Shell } from "./components/Shell";
import { Button, Spinner } from "./components/ui";
import { detectHost, isFramed, type Host } from "./data/host";
import { DataProvider, useStore } from "./data/store";
import { errorMessage } from "./lib/format";
import { Today } from "./pages/Today";

const Log = lazy(() => import("./pages/Log"));
const Progress = lazy(() => import("./pages/Progress"));
const Train = lazy(() => import("./pages/Train"));
const Business = lazy(() => import("./pages/Business"));
const Workspace = lazy(() => import("./pages/Workspace"));
const Habits = lazy(() => import("./pages/Habits"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Roadmap = lazy(() => import("./pages/Roadmap"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Charts = lazy(() => import("./pages/Charts"));
const Together = lazy(() => import("./pages/Together"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

/** Sends a brand-new person to onboarding once; every step there is skippable. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const loc = useLocation();
  if (!data.profile.onboarding_done && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function LoadError({ msg, retry }: { msg: string; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[34px]">Couldn't load your data</h1>
      <p className="mt-2 text-[14px] text-mute">{msg}</p>
      <Button className="mt-6" onClick={retry}>Try again</Button>
    </div>
  );
}

const page = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

function AppRoutes({ host }: { host: Host }) {
  return (
    <FeedbackProvider>
      <DataProvider host={host} fallback={<Spinner label="Loading your record" />} error={(m, r) => <LoadError msg={m} retry={r} />}>
        <Routes>
          <Route path="onboarding" element={<div className="px-4 pb-16 pt-8 sm:px-6">{page(<Onboarding />)}</div>} />
          <Route element={<OnboardingGate><Shell /></OnboardingGate>}>
            <Route index element={<Today />} />
            <Route path="log" element={page(<Log />)} />
            <Route path="progress" element={page(<Progress />)} />
            <Route path="train" element={page(<Train />)} />
            <Route path="business" element={page(<Business />)} />
            <Route path="business/:id" element={page(<Workspace />)} />
            <Route path="habits" element={page(<Habits />)} />
            <Route path="reviews" element={page(<Reviews />)} />
            <Route path="roadmap" element={page(<Roadmap />)} />
            <Route path="achievements" element={page(<Achievements />)} />
            <Route path="charts" element={page(<Charts />)} />
            <Route path="together" element={page(<Together />)} />
            <Route path="notifications" element={page(<Notifications />)} />
            <Route path="settings" element={page(<Settings />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DataProvider>
    </FeedbackProvider>
  );
}

export function App() {
  const [host, setHost] = useState<Host | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    detectHost()
      .then((h) => alive && setHost(h))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) return <LoadError msg={error} retry={() => setAttempt((a) => a + 1)} />;
  if (!host) return <Spinner label="Opening" />;
  // Inside the claude.ai page the address bar isn't ours, so routes live in memory.
  return isFramed()
    ? <MemoryRouter><AppRoutes host={host} /></MemoryRouter>
    : <HashRouter><AppRoutes host={host} /></HashRouter>;
}
