import { NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";
import { singleton } from "@/lib/utils/cache";
import { viewer } from "./public";

/**
 * ACCESS.
 *
 * This app has no sign-in. Every route is open, and every feature is unlocked.
 * These helpers remain as the single place a future access model would attach,
 * but today they all resolve the same open viewer.
 */
const buckets = singleton("rateBuckets", () => new Map<string, { count: number; resetAt: number }>());

/** Still enforced: it protects the instance from abuse, not the user from access. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetIn: windowMs };
  }
  bucket.count += 1;
  return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetIn: bucket.resetAt - now };
}

export async function requireUser(): Promise<{ user: User } | { response: NextResponse }> {
  return { user: await viewer() };
}

export async function requireFeature(): Promise<{ user: User } | { response: NextResponse }> {
  return { user: await viewer() };
}

export async function requireAdmin(): Promise<{ user: User } | { response: NextResponse }> {
  return { user: await viewer() };
}
