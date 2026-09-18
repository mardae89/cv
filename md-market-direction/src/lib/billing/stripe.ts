import type { Tier } from "@/lib/config/tiers";
import { TIERS } from "@/lib/config/tiers";

/**
 * BILLING ABSTRACTION.
 *
 * With STRIPE_SECRET_KEY configured this creates a real Stripe Checkout Session.
 * Without it, the app runs a clearly-labelled demo upgrade so the whole
 * subscription flow (paywall → upgrade → entitlement) is testable end to end.
 * Entitlements are always written server-side.
 */
export interface CheckoutResult {
  mode: "stripe" | "demo";
  url: string | null;
  message: string;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function priceIdFor(tier: Tier): string | null {
  const envKey = TIERS[tier].stripePriceEnv;
  if (!envKey) return null;
  return process.env[envKey] ?? null;
}

export async function createCheckoutSession(params: {
  tier: Tier;
  userId: string;
  email: string;
  origin: string;
}): Promise<CheckoutResult> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = priceIdFor(params.tier);

  if (!secret || !price) {
    return {
      mode: "demo",
      url: null,
      message: !secret
        ? "Stripe is not configured on this instance. The upgrade has been applied in demo mode so the full product is testable."
        : `No price ID configured for the ${TIERS[params.tier].name} plan (${TIERS[params.tier].stripePriceEnv}). Applied in demo mode.`,
    };
  }

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", price);
  form.set("line_items[0][quantity]", "1");
  form.set("customer_email", params.email);
  form.set("client_reference_id", params.userId);
  form.set("success_url", `${params.origin}/subscription?checkout=success`);
  form.set("cancel_url", `${params.origin}/subscription?checkout=cancelled`);
  form.set("metadata[userId]", params.userId);
  form.set("metadata[tier]", params.tier);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Stripe checkout failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { url?: string };
  return { mode: "stripe", url: json.url ?? null, message: "Redirecting to secure Stripe checkout." };
}
