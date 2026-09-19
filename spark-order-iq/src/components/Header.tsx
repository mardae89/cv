import type { ReactNode } from "react";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gold font-black text-ink"
      style={{ width: size, height: size, fontSize: size * 0.38, letterSpacing: "-0.02em" }}
    >
      SOI
    </span>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 px-1 pt-4 pb-4">
      <Logo />
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-black tracking-[0.12em] leading-none">{title}</h1>
        {subtitle ? <p className="text-xs text-mute mt-1 truncate">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}
