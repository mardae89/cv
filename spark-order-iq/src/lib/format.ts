/** Display helpers. Every formatter tolerates null so screens stay simple. */

export const money = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${n.toFixed(digits)}`;

export const moneyShort = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${Math.round(n)}`;

export const num = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(digits);

export const int = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : String(Math.round(n));

export const perMile = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}/mi`;

export const hourly = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}/hr`;

export const minutes = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const m = Math.round(n);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
};

export const percent = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`;

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayKey(now = new Date()): string {
  return dayKey(now.toISOString());
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Compact day label for chart rows, where the column is narrow. */
export function shortDay(iso: string, now = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return "Today";
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: "short" })} ${d.getDate()}`;
}

export function relativeDay(iso: string, now = new Date()): string {
  const key = dayKey(iso);
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
