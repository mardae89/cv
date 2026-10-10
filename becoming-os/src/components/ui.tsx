import { Loader2, X } from "lucide-react";
import {
  cloneElement, forwardRef, isValidElement, useEffect, useId, type ButtonHTMLAttributes, type ReactElement, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { DAY_LETTERS } from "@/lib/dates";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

// ─────────────────────────────────────────────────────────────── buttons ──
type Variant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; busy?: boolean; size?: "sm" | "md" | "lg"; icon?: ReactNode;
}>(function Button({ variant = "primary", busy, size = "md", icon, className, children, disabled, ...rest }, ref) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none select-none";
  const sizes = { sm: "h-9 px-3 text-[13px]", md: "h-11 px-4 text-[14px]", lg: "h-[52px] px-6 text-[15px]" };
  const variants: Record<Variant, string> = {
    primary: "bg-gold text-ink hover:bg-gold-hi",
    secondary: "border border-line bg-raised text-bone hover:border-gold/50",
    ghost: "text-mute hover:text-bone hover:bg-raised",
    danger: "border border-alert/40 text-alert hover:bg-alert/10",
  };
  return (
    <button ref={ref} disabled={disabled || busy} className={cx(base, sizes[size], variants[variant], className)} {...rest}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label}
      className={cx("inline-flex h-10 w-10 items-center justify-center rounded-xl text-mute transition hover:bg-raised hover:text-bone", className)}
      {...rest}>
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────── layout ──
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card p-5", className)} {...rest}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("eyebrow", className)}>{children}</div>;
}

export function SectionHeader({ eyebrow, title, action, className }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-4 flex items-end justify-between gap-3", className)}>
      <div>
        {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
        <h2 className="text-[26px] leading-none text-bone">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2 text-gold">{eyebrow}</Eyebrow>}
        <h1 className="text-[40px] leading-[0.95] text-bone sm:text-[48px]">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-[14px] text-mute">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({ label, value, sub, accent, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; accent?: boolean; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="eyebrow mb-1.5 truncate">{label}</div>
      <div className={cx("num text-[22px] font-semibold leading-tight", accent ? "text-gold" : "text-bone")}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-mute">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "gold" | "alert" | "calm"; className?: string }) {
  const tones = {
    neutral: "border-line text-mute",
    gold: "border-gold/40 text-gold bg-gold-wash",
    alert: "border-alert/40 text-alert",
    calm: "border-calm/40 text-calm",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 text-gold/80">{icon}</div>}
      <div className="font-display text-[22px] text-bone">{title}</div>
      {children && <p className="mt-1.5 max-w-sm text-[13px] text-mute">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-mute" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-gold" /> <span className="text-[13px]">{label}…</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-raised", className)} />;
}

export function Notice({ tone = "neutral", title, children, action }: { tone?: "neutral" | "gold" | "alert"; title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const tones = { neutral: "border-line", gold: "border-gold/40 bg-gold-wash", alert: "border-alert/40 bg-alert/5" };
  return (
    <div className={cx("rounded-2xl border p-4 text-[13px]", tones[tone])} role={tone === "alert" ? "alert" : undefined}>
      {title && <div className={cx("mb-1 font-semibold", tone === "alert" ? "text-alert" : tone === "gold" ? "text-gold" : "text-bone")}>{title}</div>}
      <div className="text-mute">{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── forms ──
/**
 * A labelled control. A single component child (Input, NumberInput, Select,
 * Textarea) gets a proper <label for>, with the hint attached as its
 * description rather than folded into its name. Use `group` when the children
 * are several buttons rather than one input.
 */
export function Field({ label, hint, error, children, className, group }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; group?: boolean }) {
  const id = useId();
  const note = (hint && !error) || error ? `${id}-note` : undefined;
  const foot = (
    <>
      {hint && !error && <span id={note} className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
      {error && <span id={note} className="mt-1 block text-[12px] text-alert" role="alert">{error}</span>}
    </>
  );
  const labelCls = "mb-1.5 block text-[12px] font-medium text-mute";
  if (group) {
    return (
      <div role="group" aria-labelledby={`${id}-label`} className={cx("block", className)}>
        <span id={`${id}-label`} className={labelCls}>{label}</span>
        {children}
        {foot}
      </div>
    );
  }
  if (isValidElement(children) && typeof children.type !== "string") {
    const child = children as ReactElement<{ id?: string; "aria-describedby"?: string }>;
    const cid = child.props.id ?? `${id}-control`;
    return (
      <div className={cx("block", className)}>
        <label htmlFor={cid} className={labelCls}>{label}</label>
        {cloneElement(child, { id: cid, "aria-describedby": note })}
        {foot}
      </div>
    );
  }
  return (
    <div className={cx("block", className)}>
      <label className="block"><span className={labelCls}>{label}</span>{children}</label>
      {foot}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx("input", className)} {...rest} />;
});

export function NumberInput({ value, onChange, step = "any", suffix, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string; onChange: (v: string) => void; suffix?: string;
}) {
  return (
    <div className="relative">
      <input inputMode="decimal" type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)}
        className={cx("input num", suffix && "pr-12")} {...rest} />
      {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">{suffix}</span>}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("input appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9", className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23a09fa6' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }}
    {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("input min-h-[96px] resize-y leading-relaxed", className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="text-[14px] text-bone">{label}</div>
        {sub && <div className="text-[12px] text-mute">{sub}</div>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx("relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-40",
          checked ? "border-gold bg-gold/90" : "border-line bg-raised")}>
        <span className={cx("absolute top-0.5 h-[22px] w-[22px] rounded-full transition-all",
          checked ? "left-[22px] bg-ink" : "left-0.5 bg-mute")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cx("inline-flex rounded-xl border border-line bg-raised p-1", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("flex-1 whitespace-nowrap rounded-lg font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-bone text-ink" : "text-mute hover:text-bone")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  return (
    <div className="flex gap-1.5" role="group" aria-label="Days of the week">
      {DAY_LETTERS.map((l, d) => (
        <button key={d} type="button" aria-pressed={value.includes(d)} onClick={() => toggle(d)}
          aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]}
          className={cx("h-10 w-10 rounded-full border text-[13px] font-semibold transition",
            value.includes(d) ? "border-gold bg-gold text-ink" : "border-line text-mute hover:text-bone")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Scale({ value, onChange, min = 1, max = 5, low, high, label }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; low?: string; high?: string; label: string;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-mute">
        <span>{label}</span>
        {value !== null && <button type="button" className="text-[11px] text-faint hover:text-mute" onClick={() => onChange(null)}>clear</button>}
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {nums.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
            className={cx("num h-10 flex-1 rounded-lg border text-[14px] font-semibold transition",
              value === n ? "border-gold bg-gold text-ink" : "border-line bg-raised text-mute hover:text-bone")}>
            {n}
          </button>
        ))}
      </div>
      {(low || high) && <div className="mt-1 flex justify-between text-[11px] text-faint"><span>{low}</span><span>{high}</span></div>}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-raised">
      <button type="button" aria-label="Decrease" className="h-10 w-10 text-[18px] text-mute hover:text-bone" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input inputMode="numeric" aria-label="Count" className="num h-10 w-12 bg-transparent text-center text-[15px] font-semibold text-bone outline-none"
        value={value} onChange={(e) => { const n = parseInt(e.target.value || "0", 10); if (Number.isFinite(n)) onChange(Math.max(min, n)); }} />
      <button type="button" aria-label="Increase" className="h-10 w-10 text-[18px] text-gold hover:text-gold-hi" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── meters ──
export function Meter({ value, max = 100, label, right, sub, markers, thin, className }: {
  value: number; max?: number; label?: ReactNode; right?: ReactNode; sub?: ReactNode;
  markers?: { at: number; label?: string }[]; thin?: boolean; className?: string;
}) {
  const pctv = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={className}>
      {(label || right) && (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-[12px]">
          <span className="text-mute">{label}</span>
          <span className="num font-semibold text-bone">{right}</span>
        </div>
      )}
      <div className={cx("relative w-full overflow-hidden rounded-full bg-raised", thin ? "h-1.5" : "h-2.5")}
        role="progressbar" aria-valuenow={Math.round(pctv)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-dim via-gold to-gold-hi transition-[width] duration-700 ease-out" style={{ width: `${pctv}%` }} />
        {markers?.map((m) => (
          <span key={m.at} className="absolute top-0 h-full w-px bg-ink/70" style={{ left: `${Math.min(100, (m.at / max) * 100)}%` }} />
        ))}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] text-faint">{sub}</div>}
    </div>
  );
}

export function Ring({ value, max, size = 96, stroke = 7, children }: { value: number; max: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--raised)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--gold)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset .8s ease-out" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── modals ──
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className="absolute inset-0 animate-fade bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx("relative z-10 flex max-h-[92vh] w-full animate-sheet flex-col rounded-t-3xl border border-hair bg-panel sm:animate-rise sm:rounded-3xl",
        wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-hair px-5 py-4">
          <h3 className="text-[24px] leading-none">{title}</h3>
          <IconButton label="Close" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="safe-bottom overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Table({ head, rows, empty, minWidth }: { head: ReactNode[]; rows: ReactNode[][]; empty?: ReactNode; minWidth?: number }) {
  if (!rows.length) return <div className="py-6 text-center text-[13px] text-faint">{empty ?? "Nothing here yet."}</div>;
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-left text-[13px]" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr className="border-b border-hair">
            {head.map((h, i) => <th key={i} className="eyebrow py-2 pr-3 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-hair/70 last:border-0">
              {r.map((c, j) => <td key={j} className="num py-2.5 pr-3 align-middle text-bone/90">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
