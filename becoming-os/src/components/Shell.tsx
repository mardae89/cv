import {
  Award, BarChart3, Bell, Briefcase, CheckSquare, Home, LineChart, Map, Menu, NotebookPen,
  Plus, Settings, Users, Activity,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "@/data/store";
import { fmtDate } from "@/lib/dates";
import { CelebrationHost } from "./Celebration";
import { cx, Sheet } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  business?: boolean;
}

const ic = "h-[18px] w-[18px]";
const NAV: NavItem[] = [
  { to: "/", label: "Today", icon: <Home className={ic} /> },
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

export function Shell() {
  const { data, notifications, today } = useStore();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const unread = notifications.filter((n) => !n.read_at).length;
  const items = NAV.filter((n) => !n.business || data.profile.business_enabled);
  const bottom = data.profile.business_enabled
    ? ["/", "/progress", "/log", "/business"]
    : ["/", "/progress", "/log", "/train"];

  return (
    <div className="min-h-screen lg:flex">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hair px-4 py-6 lg:flex">
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
        <NavLink to="/notifications" className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-mute hover:text-bone">
          <Bell className={ic} /> Notifications
          {unread > 0 && <span className="ml-auto rounded-full bg-gold px-1.5 text-[11px] font-bold text-ink">{unread}</span>}
        </NavLink>
        <div className="mt-4 border-t border-hair px-3 pt-4 text-[11px] leading-relaxed text-faint">
          {data.profile.display_name || "Signed in"}<br />{fmtDate(today)}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-hair bg-ink/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur lg:hidden">
          <Wordmark />
          <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative p-2 text-mute">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold" />}
          </Link>
        </div>

        {data.profile.demo_mode && (
          <div className="border-b border-gold/30 bg-gold-wash px-4 py-2 text-center text-[12px] text-gold">
            DEMO ACCOUNT — sample data only, simulated date {fmtDate(today)}.{" "}
            <Link to="/settings#demo" className="underline underline-offset-2">Reset</Link>
          </div>
        )}

        <main key={loc.pathname} className="mx-auto max-w-page px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
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
                {n.icon}{n.label}
              </NavLink>
            );
          })}
          <button onClick={() => setMore(true)} className="flex w-16 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium text-mute">
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
