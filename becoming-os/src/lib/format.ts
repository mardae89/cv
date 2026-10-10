export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(n: number | null | undefined, cents = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return cents ? usd2.format(v) : usd0.format(v);
}

/** $12.4K style for tight spaces. */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${round(a / 1_000_000, 1)}M`;
  if (a >= 10_000) return `${sign}$${round(a / 1000, 0)}K`;
  if (a >= 1000) return `${sign}$${round(a / 1000, 1)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function lb(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${round(n, dp).toFixed(dp)} lb`;
}

export function signed(n: number, dp = 1, unit = ""): string {
  const r = round(n, dp);
  const s = r > 0 ? "+" : r < 0 ? "−" : "±";
  return `${s}${Math.abs(r).toFixed(dp)}${unit}`;
}

export function pct(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${round(n, dp).toFixed(dp)}%`;
}

export function miles(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${round(n, 2)} mi`;
}

export function pace(minPerMile: number | null): string {
  if (minPerMile === null || !Number.isFinite(minPerMile) || minPerMile <= 0) return "—";
  const m = Math.floor(minPerMile);
  const s = Math.round((minPerMile - m) * 60);
  return s === 60 ? `${m + 1}:00 /mi` : `${m}:${String(s).padStart(2, "0")} /mi`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong.";
  if (typeof e === "string") return e;
  const anyE = e as { message?: string; details?: string; hint?: string; code?: string };
  const msg = anyE.message || "Something went wrong.";
  if (anyE.code === "23505") return "That entry already exists. Edit the existing one instead.";
  if (anyE.code === "42501") return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
  return msg;
}
