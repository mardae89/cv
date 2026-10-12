import {
  Award, BarChart3, Bell, Briefcase, CheckSquare, Home, LineChart, Map, Menu, NotebookPen,
  Plus, Settings, Users, Activity, X, Zap, Clapperboard, Radar, Sun, Moon,
} from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Link, NavLink } from "@/components/AppLink";
import { useStore } from "@/data/store";
import { fmtDate } from "@/lib/dates";
import { CelebrationHost } from "./Celebration";
import { WhyBanner } from "./power";
import { useTheme } from "@/lib/theme";
import { cx, Sheet } from "./ui";

interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  icon: ReactNode;
  business?: boolean;
}

const ic = "h-[18px] w-[18px]";
const NAV: NavItem[] = [
  { to: "/", label: "Today", icon: <Home className={ic} /> },
  { to: "/power", label: "Power List", icon: <Zap className={ic} /> },
  { to: "/content", label: "Content Bank", short: "Content", icon: <Clapperboard className={ic} /> },
  { to: "/traffic", label: "Traffic", icon: <Radar className={ic} /> },
  { to: "/log", label: "Log", icon: <Plus className={ic} /> },
  { to: "/progress", label: "Body", icon: <LineChart className={ic} /> },
  { to: "/train", label: "Train", icon: <Activity className={ic} /> },
  { to: "/business", label: "Business", icon: <Briefcase className={ic} />, business: true },
  { to: "/habits", label: "Habits", icon: <CheckSquare className={ic} /> },
  { to: "/reviews", label: "Reviews", icon: <NotebookPen className={ic} /> },
  { to: "/roadmap", label: "Roadmap", icon: <Map className={ic} /> },
  { to: "/achievements", label: "Milestones", icon: <Award className={ic} /> },
  { to: "/charts", label: "Charts", icon: <BarChart3 className={ic} /> },
  { to: "/together", label: "Together", icon: <Users className={ic} /> },
  { to: "/settings", label: "Settings", icon: <Settings className={ic} /> },
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("flex items-baseline gap-2", className)} aria-label="BECOMING OS home">
      <span className="font-display text-[22px] font-semibold tracking-[0.18em] text-bone">BECOMING</span>
      <span className="text-[10px] font-bold tracking-[0.3em] text-gold">OS</span>
    </Link>
  );
}

const NOTICE_KEY = "becoming.dismissedNotice";

function dismissedNotice(): string | null {
  try {
    return sessionStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
}

/** A failed save, kept on screen until a retry succeeds. Never blocks the page. */
function SaveError() {
  const { saveStatus } = useStore();
  const err = saveStatus.error;
  return (
    <div role="status">
      {err && (
        <div className="border-b border-alert/40 bg-panel px-4 py-2 text-center text-[12px] text-alert">
          <span className="font-semibold">Not saved yet.</span> {err}
          {saveStatus.retrying ? " Retrying automatically — keep this page open until this clears." : " Your next change will try again."}
        </div>
      )}
      {!err && saveStatus.sync && (
        <div className="border-b border-line bg-raised px-4 py-2 text-center text-[12px] text-mute">{saveStatus.sync}</div>
      )}
    </div>
  );
}

/** Why records are kept where they are (e.g. view-only access), dismissible for this visit. */
function HostNotice() {
  const { host } = useStore();
  const [dismissed, setDismissed] = useState(dismissedNotice);
  if (!host.notice || dismissed === host.notice) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(NOTICE_KEY, host.notice!);
    } catch {
      // storage blocked: hide it for this view only
    }
    setDismissed(host.notice);
  };
  return (
    <div className="flex items-start gap-3 border-b border-line bg-raised px-4 py-2.5 text-[12px] text-mute">
      <p className="mx-auto max-w-page flex-1">{host.notice}</p>
      <button onClick={dismiss} aria-label="Dismiss notice" className="-m-1 shrink-0 p-1 text-faint hover:text-bone"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** One tap between Day and Night. */
function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { theme, setChoice } = useTheme();
  const light = theme === "light";
  return (
    <button type="button" onClick={() => setChoice(light ? "night" : "day")} aria-label={light ? "Switch to Night theme" : "Switch to Day theme"}
      title={light ? "Night theme" : "Day theme"}
      className={cx("inline-flex items-center rounded-xl text-mute transition hover:bg-raised hover:text-bone",
        withLabel ? "w-full gap-3 px-3 py-2.5 text-[14px]" : "h-10 w-10 justify-center", className)}>
      {light ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      {withLabel && (light ? "Night theme" : "Day theme")}
    </button>
  );
}

export function Shell() {
  const { data, notifications, today, host, saveStatus } = useStore();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const unread = notifications.filter((n) => !n.read_at).length;
  const items = NAV.filter((n) => !n.business || data.profile.business_enabled);
  // The daily drivers sit in the tab bar; everything else is one tap away under More.
  const bottom = ["/", "/power", "/log", "/content"];
  // Pages reached through More light it up, so you can see where you are.
  const onMorePage = !bottom.some((to) => to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to));
  // A new page starts at its top, not at the previous page's scroll position.
  // (Runs before page effects, so a page can still scroll to a #section.)
  // Braces matter: inside the Claude desktop app scrollTo returns a value, which
  // React would then try to call as this effect's cleanup.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* desktop rail */}
      <aside className="sticky top-[env(safe-area-inset-top,0px)] hidden h-screen w-60 shrink-0 flex-col border-r border-hair px-4 py-6 lg:flex">
        <Wordmark className="mb-8 px-2" />
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition",
                isActive ? "bg-raised text-bone" : "text-mute hover:text-bone")}>
              {({ isActive }) => <><span className={isActive ? "text-gold" : ""}>{n.icon}</span>{n.label}</>}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/notifications" className={({ isActive }) => cx("mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition",
          isActive ? "bg-raised text-bone" : "text-mute hover:text-bone")}>
          <Bell className={ic} /> Notifications
          {unread > 0 && <span className="ml-auto rounded-full bg-gold px-1.5 text-[11px] font-bold text-ink">{unread}</span>}
        </NavLink>
        <ThemeToggle withLabel className="mt-1" />
        <div className="mt-4 border-t border-hair px-3 pt-4 text-[11px] leading-relaxed text-faint">
          {data.profile.display_name && <>{data.profile.display_name}<br /></>}{fmtDate(today)}<br />
          {saveStatus.pending ? "Saving…" : host.mode === "shared-page" ? "Saved on this page" : "Saved in this browser only"}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Sticks below the top safe-area inset (the page host pads for it); the
            ::before strip covers that inset so content doesn't show through. */}
        <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 before:absolute before:inset-x-0 before:bottom-full before:h-[env(safe-area-inset-top,0px)] before:bg-ink">
          {/* mobile top bar */}
          <div className="flex items-center justify-between border-b border-hair bg-ink/90 px-4 py-3 backdrop-blur lg:hidden">
            <Wordmark />
            <div className="flex items-center">
            <ThemeToggle />
            <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative p-2 text-mute">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold" />}
            </Link>
            </div>
          </div>
          <SaveError />
        </div>

        <HostNotice />

        {data.profile.demo_mode && (
          <div className="border-b border-gold/30 bg-gold-wash px-4 py-2 text-center text-[12px] text-gold">
            DEMO ACCOUNT — sample data only, simulated date {fmtDate(today)}.{" "}
            <Link to="/settings#demo" className="underline underline-offset-2">Reset</Link>
          </div>
        )}

        <main key={loc.pathname} className="mx-auto max-w-page px-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          {/* Today and the Power List show the full reminder; every other page keeps a slim one. */}
          {loc.pathname !== "/" && loc.pathname !== "/power" && <div className="mb-5"><WhyBanner compact /></div>}
          <Outlet />
        </main>
      </div>

      {/* mobile tab bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-ink/95 backdrop-blur lg:hidden" aria-label="Primary">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {bottom.map((to) => {
            const n = NAV.find((x) => x.to === to)!;
            if (to === "/log") {
              return (
                <NavLink key={to} to={to} aria-label="Log" className="-mt-5 flex flex-col items-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-lg shadow-black/50">
                    <Plus className="h-6 w-6" />
                  </span>
                </NavLink>
              );
            }
            return (
              <NavLink key={to} to={to} end={to === "/"}
                className={({ isActive }) => cx("flex w-16 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium",
                  isActive ? "text-gold" : "text-mute")}>
                {n.icon}{n.short ?? n.label}
              </NavLink>
            );
          })}
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-current={onMorePage ? "page" : undefined}
            className={cx("flex w-16 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium", onMorePage ? "text-gold" : "text-mute")}>
            <Menu className={ic} />More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Everything">
        <div className="grid grid-cols-3 gap-2">
          {[...items.filter((n) => !bottom.includes(n.to)), { to: "/notifications", label: "Alerts", icon: <Bell className={ic} /> }].map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setMore(false)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-hair bg-raised px-2 py-4 text-[12px] text-bone">
              <span className="text-gold">{n.icon}</span>{n.label}
            </Link>
          ))}
        </div>
      </Sheet>

      <CelebrationHost />
    </div>
  );
}
