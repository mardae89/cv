import { NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";
import { currentUser, gate } from "./session";
import type { Feature } from "@/lib/config/tiers";
import { anonymousViewer, isPublicFeature, publicMode } from "./public";
import { singleton } from "@/lib/utils/cache";

/** Simple in-process rate limiter for expensive endpoints (AI, scans, backtests). */
const buckets = singleton("rateBuckets", () => new Map<string, { count: number; resetAt: number }>());

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
  const user = await currentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  return { user };
}

export async function requireFeature(
  feature: Feature,
): Promise<{ user: User } | { response: NextResponse }> {
  // In public mode, read-only intelligence is open. Write paths and metered
  // features still fall through to the normal account check below.
  if (publicMode() && isPublicFeature(feature)) {
    const user = await currentUser();
    return { user: user ?? anonymousViewer() };
  }
  const auth = await requireUser();
  if ("response" in auth) return auth;
  const g = gate(auth.user, feature);
  if (!g.allowed) {
    return {
      response: NextResponse.json(
        { error: "upgrade_required", feature, requiredTier: g.needed, message: `This feature requires ${g.neededName}.` },
        { status: 402 },
      ),
    };
  }
  return { user: auth.user };
}

export async function requireAdmin(): Promise<{ user: User } | { response: NextResponse }> {
  const auth = await requireUser();
  if ("response" in auth) return auth;
  if (auth.user.role !== "admin") {
    return { response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { user: auth.user };
}
