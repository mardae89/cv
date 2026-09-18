/** Minimal geometric icon set — thin strokes, no rounded cartoon shapes. */
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icon = {
  dashboard: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M3 13h6V3H3zM15 21h6V11h-6zM3 21h6v-4H3zM15 7h6V3h-6z" /></svg>
  ),
  markets: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M3 20h18M6 16V9M11 16V5M16 16v-5M21 16v-8" /></svg>
  ),
  scanner: (p: { className?: string }) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 7v8M7 11h8" /></svg>
  ),
  news: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M4 5h12v14H4zM16 9h4v8a2 2 0 0 1-4 0zM7 9h6M7 13h6M7 16h4" /></svg>
  ),
  calendar: (p: { className?: string }) => (
    <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
  ),
  alerts: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 0 0 4 0" /></svg>
  ),
  watchlist: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M5 3h14v18l-7-4-7 4z" /></svg>
  ),
  ai: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /></svg>
  ),
  momentum: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M3 17l5-6 4 3 4-6 5 4" /><path d="M17 6h4v4" /></svg>
  ),
  crossMarket: (p: { className?: string }) => (
    <svg {...base} {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8.5 6h7M7 8l4 7.5M17 8l-4 7.5" /></svg>
  ),
  backtest: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /><circle cx="7" cy="15" r="1" /></svg>
  ),
  journal: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M5 3h14v18H5zM9 3v18" /><path d="M12 8h4M12 12h4M12 16h4" /></svg>
  ),
  settings: (p: { className?: string }) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></svg>
  ),
  crown: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M3 18h18M4 8l4 4 4-7 4 7 4-4-2 10H6z" /></svg>
  ),
  admin: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>
  ),
  user: (p: { className?: string }) => (
    <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
  ),
  arrow: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  ),
  close: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  menu: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  ),
  bolt: (p: { className?: string }) => (
    <svg {...base} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
  ),
};
