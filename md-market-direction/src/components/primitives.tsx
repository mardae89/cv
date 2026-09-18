import type { ReactNode } from "react";
import type { Direction, EvidenceQuality, Impact } from "@/lib/types";

/* ----------------------------------- text ---------------------------------- */

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function Panel({
  children,
  className = "",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return <div className={`${flat ? "panel-flat" : "panel"} ${className}`}>{children}</div>;
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="display text-lg font-bold uppercase tracking-wide text-bone sm:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-mute">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- direction -------------------------------- */

export function directionColor(direction: Direction | string): string {
  switch (direction) {
    case "bullish": return "text-bull";
    case "bearish": return "text-bear";
    case "mixed": return "text-flat";
    default: return "text-mute";
  }
}

export function directionDot(direction: Direction | string): string {
  switch (direction) {
    case "bullish": return "bg-bull";
    case "bearish": return "bg-bear";
    case "mixed": return "bg-flat";
    default: return "bg-faint";
  }
}

export function DirectionBadge({ direction, small = false }: { direction: Direction | string; small?: boolean }) {
  const label = direction === "mixed" ? "MIXED" : direction.toUpperCase();
  const color =
    direction === "bullish"
      ? "border-bull/40 text-bull bg-bull/10"
      : direction === "bearish"
        ? "border-bear/40 text-bear bg-bear/10"
        : direction === "mixed"
          ? "border-flat/40 text-flat bg-flat/10"
          : "border-hairline text-mute bg-panel-2";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-display font-semibold uppercase tracking-widest ${color} ${small ? "text-[10px]" : "text-xs"}`}
    >
      <span className={`h-1.5 w-1.5 ${directionDot(direction)}`} />
      {label}
    </span>
  );
}

export function StatusDot({ state }: { state: "good" | "bad" | "warn" | "idle" }) {
  const cls =
    state === "good" ? "bg-bull" : state === "bad" ? "bg-bear" : state === "warn" ? "bg-gold" : "bg-faint";
  return <span className={`inline-block h-2 w-2 ${cls}`} />;
}

export function ImpactTag({ impact }: { impact: Impact | "none" }) {
  const map: Record<string, string> = {
    high: "border-bear/40 text-bear bg-bear/10",
    medium: "border-gold/40 text-gold bg-gold/10",
    low: "border-hairline text-mute",
    none: "border-hairline text-faint",
  };
  return (
    <span className={`border px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest ${map[impact]}`}>
      {impact}
    </span>
  );
}

export function QualityTag({ quality }: { quality: EvidenceQuality }) {
  const map: Record<EvidenceQuality, string> = {
    high: "text-bull border-bull/40",
    medium: "text-gold border-gold/40",
    low: "text-bear border-bear/40",
  };
  return (
    <span className={`border px-1.5 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest ${map[quality]}`}>
      Evidence {quality}
    </span>
  );
}

/* ---------------------------------- states ---------------------------------- */

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="panel-flat flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-2 h-px w-10 bg-gold" />
      <h3 className="display text-base font-semibold uppercase tracking-wide">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-mute">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-bear/30 bg-bear/5 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="display text-sm font-semibold uppercase tracking-wide text-bear">Data unavailable</div>
          <p className="mt-1 text-sm text-mute">{message}</p>
        </div>
        {onRetry ? (
          <button onClick={onRetry} className="border border-hairline px-3 py-1.5 text-xs uppercase tracking-widest text-mute hover:border-gold hover:text-gold">
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- buttons ---------------------------------- */

export function GoldButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`focus-gold inline-flex items-center justify-center gap-2 bg-gold px-5 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-void transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`focus-gold inline-flex items-center justify-center gap-2 border border-hairline px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-mute transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
