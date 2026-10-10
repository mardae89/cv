import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { FeedbackProvider } from "./components/feedback";
import { Shell } from "./components/Shell";
import { Button, Spinner } from "./components/ui";
import { AuthProvider, useAuth } from "./data/auth";
import { DataProvider, useStore } from "./data/store";
import { supabaseConfigured } from "./data/supabase";
import { AuthPage, ResetPasswordPage } from "./pages/Auth";
import { SetupNeeded } from "./pages/SetupNeeded";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, recovering } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Starting" />;
  if (recovering) return <Navigate to="/reset-password" replace />;
  if (!user) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

/** Sends a brand-new account to onboarding once; every step there is skippable. */
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

export function App() {
  if (!supabaseConfigured) return <SetupNeeded />;
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <FeedbackProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route element={
                <RequireAuth>
                  <DataProvider fallback={<Spinner label="Loading your record" />} error={(m, r) => <LoadError msg={m} retry={r} />}>
                    <Outlet />
                  </DataProvider>
                </RequireAuth>
              }>
                <Route path="onboarding" element={<div className="px-4 pb-16 pt-[max(env(safe-area-inset-top),32px)] sm:px-6">{page(<Onboarding />)}</div>} />
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
              </Route>
            </Routes>
          </FeedbackProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
