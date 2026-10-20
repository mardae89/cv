export function fmtPrice(value: number | null | undefined, precision = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function fmtSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function fmtCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

export function timeAgo(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return "—";
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function untilLabel(timestamp: number, now = Date.now()): string {
  const ms = timestamp - now;
  if (ms <= 0) return "released";
  const h = ms / 3_600_000;
  if (h < 1) return `in ${Math.round(h * 60)} min`;
  if (h < 48) return `in ${Math.round(h)} h`;
  return `in ${Math.round(h / 24)} days`;
}

export function fmtTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }) + " UTC";
}

export function fmtDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}
