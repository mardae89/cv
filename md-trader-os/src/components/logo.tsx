import Image from "next/image";

/**
 * The brand mark. Supplied as artwork on a black field; the ground is stripped
 * to alpha so it sits on the app's near-black without showing a box edge.
 */
export function Logo({ size = 28, showWord = true }: { size?: number; showWord?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/logo-mark.png"
        alt="MD Trader OS"
        width={Math.round(size * 1.46)}
        height={size}
        priority
        style={{ height: size, width: "auto" }}
      />
      {showWord ? (
        <div className="leading-none">
          <div className="display text-[11px] font-extrabold uppercase tracking-[0.2em] text-bone">Trader</div>
          <div className="display mt-0.5 text-[9px] font-semibold uppercase tracking-[0.28em] text-gold">OS · Forex &amp; Futures</div>
        </div>
      ) : null}
    </div>
  );
}
