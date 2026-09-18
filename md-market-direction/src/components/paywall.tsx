"use client";

import Link from "next/link";
import { TIERS, type Tier } from "@/lib/config/tiers";
import { GoldButton } from "./primitives";
import { Icon } from "./icons";

/**
 * The upgrade screen. Never hostile: it shows exactly what the feature does and
 * what it costs, and always leaves a way back to the free product.
 */
export function Paywall({
  requiredTier = "pro",
  featureName,
  bullets,
}: {
  requiredTier?: Tier | string;
  featureName?: string;
  bullets?: string[];
}) {
  const tier = TIERS[(requiredTier as Tier) in TIERS ? (requiredTier as Tier) : "pro"];
  const list = bullets ?? tier.bullets;

  return (
    <div className="panel mx-auto max-w-2xl px-6 py-10 text-center sm:px-10 sm:py-14">
      <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center border border-gold/40 text-gold">
        <Icon.crown />
      </div>
      <h2 className="display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
        Unlock the Full Market Intelligence Engine
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-mute">
        {featureName ? `${featureName} is included with ${tier.name}.` : `This feature is included with ${tier.name}.`}{" "}
        {tier.tagline}
      </p>

      <ul className="mx-auto mt-7 max-w-sm space-y-2.5 text-left">
        {list.map((b) => (
          <li key={b} className="flex items-start gap-3 text-sm text-bone">
            <span className="mt-1 text-gold">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link href="/subscription">
          <GoldButton>
            Start {tier.name} — ${tier.priceMonthly}/mo
          </GoldButton>
        </Link>
        <Link href="/dashboard" className="text-xs uppercase tracking-widest text-faint hover:text-mute">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
