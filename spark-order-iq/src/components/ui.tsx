import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Shared primitives. Big targets, high contrast, one accent colour. */

export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const base = `card p-4 ${className}`;
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={`${base} w-full text-left active:scale-[0.99] transition-transform`}>
      {children}
    </button>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-1 pb-2">
      <span className="label">{children}</span>
      {right}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "lg" | "md" | "sm";
  full?: boolean;
};

export function Button({ variant = "primary", size = "md", full, className = "", ...rest }: ButtonProps) {
  const sizes = {
    lg: "h-16 text-lg rounded-2xl px-6",
    md: "h-12 text-base rounded-xl px-5",
    sm: "h-9 text-sm rounded-lg px-3",
  }[size];
  const variants = {
    primary: "bg-gold text-ink font-bold active:bg-[#d9a52f] disabled:bg-gold-dim disabled:text-white/50",
    secondary: "bg-panel-2 text-white font-semibold border border-line active:bg-line",
    ghost: "bg-transparent text-mute font-semibold active:text-white",
    danger: "bg-transparent text-skip font-semibold border border-skip/40 active:bg-skip/10",
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={`${sizes} ${variants} ${full ? "w-full" : ""} inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed ${className}`}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "gold" | "take" | "skip" | "mute";
  className?: string;
}) {
  const colors = {
    default: "text-white",
    gold: "text-gold",
    take: "text-take",
    skip: "text-skip",
    mute: "text-mute",
  }[tone];
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className={`tnum text-2xl font-bold leading-tight ${colors}`}>{value}</div>
      {sub ? <div className="text-xs text-mute mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function ProgressBar({
  percent,
  tone = "gold",
  height = "h-3",
}: {
  percent: number;
  tone?: "gold" | "take";
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const fill = tone === "take" ? "bg-take" : "bg-gold";
  return (
    <div className={`w-full ${height} rounded-full bg-panel-2 overflow-hidden border border-line`}>
      <div
        className={`h-full ${fill} rounded-full transition-[width] duration-500 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  right,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between pb-1.5">
        <span className="label">{label}</span>
        {right}
      </div>
      {children}
      {hint ? <div className="text-xs text-mute mt-1.5">{hint}</div> : null}
    </label>
  );
}

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  prefix?: string;
  suffix?: string;
  invalid?: boolean;
};

export function NumberInput({ value, onValueChange, prefix, suffix, invalid, className = "", ...rest }: NumberInputProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 h-14 bg-panel-2 ${
        invalid ? "border-skip" : "border-line focus-within:border-gold"
      } ${className}`}
    >
      {prefix ? <span className="text-mute text-lg">{prefix}</span> : null}
      <input
        {...rest}
        type="number"
        inputMode="decimal"
        value={value === null || Number.isNaN(value) ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw.trim() === "") {
            onValueChange(null);
            return;
          }
          const parsed = Number(raw);
          onValueChange(Number.isFinite(parsed) ? parsed : null);
        }}
        className="tnum w-full bg-transparent text-xl font-semibold outline-none placeholder:text-mute/50"
      />
      {suffix ? <span className="text-mute text-sm whitespace-nowrap">{suffix}</span> : null}
    </div>
  );
}

export function TextInput({
  value,
  onValueChange,
  placeholder,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <input
      {...rest}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      className="w-full rounded-xl border border-line focus:border-gold bg-panel-2 px-4 h-14 text-lg outline-none placeholder:text-mute/50"
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "sm";
}) {
  const h = size === "sm" ? "h-9 text-sm" : "h-12 text-base";
  return (
    <div className={`grid gap-1 rounded-xl bg-panel-2 border border-line p-1`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`${h} rounded-lg font-semibold transition-colors ${
              active ? "bg-gold text-ink" : "text-mute active:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${
        checked ? "bg-gold border-gold" : "bg-panel-2 border-line"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full transition-all ${
          checked ? "left-8 bg-ink" : "left-1 bg-mute"
        }`}
      />
    </button>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "danger" | "gold";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: "border-line bg-panel text-mute",
    warn: "border-consider/40 bg-consider/10 text-consider",
    danger: "border-skip/40 bg-skip/10 text-skip",
    gold: "border-gold/40 bg-gold/10 text-gold",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones}`}>
      {title ? <div className="font-bold mb-0.5">{title}</div> : null}
      <div className="leading-snug">{children}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="text-lg font-bold">{title}</div>
      {children ? <p className="text-sm text-mute mt-2 leading-relaxed">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="anim-rise relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-x border-line bg-panel p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-mute text-2xl leading-none px-2" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
