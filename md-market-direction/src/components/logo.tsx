export function Logo({ size = 28, showWord = true }: { size?: number; showWord?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <rect x="0.75" y="0.75" width="38.5" height="38.5" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" />
        <path d="M9 28V12l6.5 9L22 12v16" fill="none" stroke="var(--color-bone)" strokeWidth="2.4" strokeLinejoin="miter" />
        <path d="M26 12h3.5c3 0 4.5 2.4 4.5 8s-1.5 8-4.5 8H26z" fill="none" stroke="var(--color-gold)" strokeWidth="2.4" />
      </svg>
      {showWord ? (
        <div className="leading-none">
          <div className="display text-sm font-extrabold uppercase tracking-[0.18em] text-bone">MD</div>
          <div className="display text-[9px] font-semibold uppercase tracking-[0.28em] text-gold">Direction</div>
        </div>
      ) : null}
    </div>
  );
}
