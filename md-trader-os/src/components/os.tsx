"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Eyebrow } from "./primitives";
import { Icon } from "./icons";
import type { Quote } from "@/lib/os/content";
import type { Tilt } from "@/lib/os/analytics";

/* ---------------------------------- format ---------------------------------- */

export function fmtR(r: number | null | undefined, digits = 2): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${r >= 0 ? "+" : ""}${r.toFixed(digits)}R`;
}

/** Money in the account currency. `signed` puts + on gains, for results. */
export function fmtMoney(v: number | null | undefined, currency = "USD", signed = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  try {
    return v.toLocaleString("en-US", {
      style: "currency", currency, maximumFractionDigits: 2, signDisplay: signed ? "exceptZero" : "auto",
    });
  } catch {
    return `${signed && v > 0 ? "+" : ""}${v.toFixed(2)} ${currency}`;
  }
}

export function toneOf(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "text-mute";
  return v > 0 ? "text-bull" : "text-bear";
}

/** Parses an input box: blank is null, junk is null, numbers are numbers. */
export function num(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* ----------------------------------- modal ---------------------------------- */

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-void/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`panel max-h-[90vh] w-full overflow-y-auto ${wide ? "max-w-3xl" : "max-w-xl"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline-soft bg-panel px-5 py-3">
          <h3 className="display text-sm font-bold uppercase tracking-widest">{title}</h3>
          <button onClick={onClose} className="text-mute hover:text-bone" aria-label="Close"><Icon.close /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------------- inputs --------------------------------- */

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <Eyebrow className="mb-1">{label}</Eyebrow>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value, onChange, placeholder, type = "text", inputMode, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text";
  className?: string;
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-3 py-2 text-sm ${className}`}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-y px-3 py-2 text-sm leading-relaxed"
    />
  );
}

export function SelectInput<T extends string>({
  value, onChange, options, className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (T | { value: T; label: string })[];
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={`w-full px-3 py-2 text-sm ${className}`}>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

/** A 1–5 scale with words at the ends, so the number means the same thing every day. */
export function RatingPicker({
  value, onChange, low, high, invert = false,
}: {
  value: number | null;
  onChange: (v: number) => void;
  low: string;
  high: string;
  /** True when a HIGH number is the bad end (stress). */
  invert?: boolean;
}) {
  return (
    <div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          const good = invert ? n <= 2 : n >= 4;
          const bad = invert ? n >= 4 : n <= 2;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-9 flex-1 border font-display text-xs font-bold transition ${
                on
                  ? good ? "border-bull bg-bull/15 text-bull" : bad ? "border-bear bg-bear/15 text-bear" : "border-gold bg-gold/15 text-gold"
                  : "border-hairline text-mute hover:border-gold/60"
              }`}
              aria-pressed={on}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest text-faint">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function Chips<T extends string>({
  options, selected, onToggle, tone = "gold",
}: {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  tone?: "gold" | "bear";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={`border px-2.5 py-1 text-xs transition ${
              on
                ? tone === "bear" ? "border-bear/60 bg-bear/15 text-bear" : "border-gold/60 bg-gold/15 text-gold"
                : "border-hairline text-mute hover:border-gold/50 hover:text-bone"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap border border-hairline">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
            value === o.value ? "bg-gold text-void" : "text-mute hover:text-gold"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- display --------------------------------- */

export function Stat({ label, value, tone = "text-bone", sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className={`ticker display mt-1 truncate text-xl font-bold ${tone}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}

export function Bar({ value, tone = "gold" }: { value: number; tone?: "gold" | "bull" | "bear" | "flat" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = tone === "bull" ? "bg-bull" : tone === "bear" ? "bg-bear" : tone === "flat" ? "bg-flat" : "bg-gold";
  return (
    <div className="h-1.5 w-full bg-hairline-soft">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function QuoteCard({ quote, onNext, compact = false }: { quote: Quote; onNext?: () => void; compact?: boolean }) {
  return (
    <figure className={`relative border-l-2 border-gold bg-ink ${compact ? "px-4 py-3" : "px-5 py-5"}`}>
      <blockquote className={`display font-semibold leading-snug tracking-tight text-bone ${compact ? "text-sm" : "text-lg sm:text-xl"}`}>
        “{quote.text}”
      </blockquote>
      <figcaption className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-widest text-faint">
        <span>{quote.author ? `— ${quote.author}` : "MD Trader OS"}</span>
        {onNext ? (
          <button onClick={onNext} className="text-gold hover:underline">Another</button>
        ) : null}
      </figcaption>
    </figure>
  );
}

export function TiltMeter({ tilt }: { tilt: Tilt }) {
  const tone = tilt.state === "tilted" ? "bear" : tilt.state === "caution" ? "flat" : "bull";
  const text = tilt.state === "tilted" ? "text-bear" : tilt.state === "caution" ? "text-flat" : "text-bull";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Tilt meter</Eyebrow>
        <span className={`ticker display text-sm font-bold ${text}`}>{tilt.level}/100</span>
      </div>
      <div className="mt-2"><Bar value={tilt.level / 100} tone={tone} /></div>
      <p className={`mt-2 display text-sm font-bold uppercase tracking-wide ${text}`}>{tilt.label}</p>
      {tilt.reasons.length ? (
        <ul className="mt-2 space-y-1">
          {tilt.reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 text-xs text-mute">
              <span className={`mt-1.5 h-1 w-1 shrink-0 ${tone === "bear" ? "bg-bear" : tone === "flat" ? "bg-flat" : "bg-bull"}`} />
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-faint">Nothing in today&apos;s journal or check-in is raising it.</p>
      )}
    </div>
  );
}

/** A note that the data on this page lives in this browser only. */
export function LocalNote() {
  return (
    <p className="text-[11px] text-faint">
      Saved on this device only — there is no sign-in. Back it up from Settings to keep a copy or move it to another device.
    </p>
  );
}

/**
 * A destructive action that asks twice, in place. The first tap arms it and
 * says what will happen; the second, within a few seconds, does it. Browser
 * confirm() dialogs are blocked in some embedded views and are clumsy on a
 * phone, so nothing in the app relies on them.
 */
export function ConfirmButton({
  label, confirmLabel, onConfirm, className = "",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
      className={`border px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
        armed ? "border-bear bg-bear/15 text-bear" : "border-hairline text-faint hover:border-bear/60 hover:text-bear"
      } ${className}`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

