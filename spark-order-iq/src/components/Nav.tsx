export type Tab = "home" | "analyze" | "history" | "stats" | "settings";

const ICONS: Record<Tab, string> = {
  home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  analyze: "M12 2 7 12h4l-1.5 8L17 9h-4l1.4-7z",
  history: "M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7v4l5-5-5-5z M11 7h2v6h-4v-2h2z",
  stats: "M4 20h3v-7H4zM10.5 20h3V4h-3zM17 20h3v-11h-3z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m9.3 4a7.3 7.3 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L16.4 2h-4l-.4 2.6c-.7.3-1.4.7-2 1.2l-2.4-1-2 3.4 2 1.6a7.3 7.3 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2",
};

const LABELS: Record<Tab, string> = {
  home: "Home",
  analyze: "Analyze",
  history: "History",
  stats: "Stats",
  settings: "Settings",
};

const ORDER: Tab[] = ["home", "history", "analyze", "stats", "settings"];

export function Nav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-ink/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-end justify-around px-2 pt-2 pb-2">
        {ORDER.map((key) => {
          const active = tab === key;
          if (key === "analyze") {
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-label="Analyze an offer"
                aria-current={active ? "page" : undefined}
                className="-mt-7 flex flex-col items-center gap-1"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-ground shadow-lg transition-colors ${
                    active ? "bg-gold" : "bg-gold/90"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-8 w-8 fill-ink">
                    <path d={ICONS.analyze} />
                  </svg>
                </span>
                <span className={`text-[10px] font-bold tracking-wide ${active ? "text-gold" : "text-mute"}`}>
                  ANALYZE
                </span>
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-current={active ? "page" : undefined}
              className="flex w-16 flex-col items-center gap-1 py-1"
            >
              <svg viewBox="0 0 24 24" className={`h-6 w-6 ${active ? "fill-gold" : "fill-mute"}`}>
                <path d={ICONS[key]} />
              </svg>
              <span className={`text-[10px] font-semibold ${active ? "text-gold" : "text-mute"}`}>{LABELS[key]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
