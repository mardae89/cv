"use client";

import { useRouter } from "next/navigation";
import { canGoBack } from "@/lib/route";

/** Back to wherever the trader came from, or to the page's parent if nowhere. */
export function useGoBack(fallback: string) {
  const router = useRouter();
  return () => (canGoBack() ? router.back() : router.push(fallback));
}

/**
 * `desktopOnly` hides it on phones, where the sticky header already carries
 * a Back button.
 */
export function BackButton({
  fallback,
  label = "Back",
  desktopOnly = false,
  className = "",
}: {
  fallback: string;
  label?: string;
  desktopOnly?: boolean;
  className?: string;
}) {
  const back = useGoBack(fallback);
  return (
    <button
      type="button"
      onClick={back}
      className={`focus-gold ${desktopOnly ? "hidden lg:inline-flex" : "inline-flex"} items-center gap-1.5 border border-hairline px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-mute transition hover:border-gold hover:text-gold ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {label}
    </button>
  );
}
