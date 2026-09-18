import { NextResponse } from "next/server";
import type { TradingMode } from "@/lib/types";
import type { User } from "@/lib/db/schema";

const MODES: TradingMode[] = ["scalper", "day", "swing", "md-momentum"];

export function resolveMode(value: string | null | undefined, user: User | null): TradingMode {
  if (value && MODES.includes(value as TradingMode)) return value as TradingMode;
  return user?.preferences.mode ?? "swing";
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Standard cache headers for expensive, slow-moving reads. */
export const CACHE_SHORT = { "Cache-Control": "private, max-age=15, stale-while-revalidate=45" };
export const CACHE_MEDIUM = { "Cache-Control": "private, max-age=60, stale-while-revalidate=180" };
