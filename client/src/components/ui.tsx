import type { ReactNode } from "react";

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-xl border border-line bg-white ${className}`}>{children}</section>
);

export const CardHead = ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
    <h2 className="text-[16px] font-bold">{title}</h2>
    <div className="ml-auto flex flex-wrap items-center gap-3">{children}</div>
  </div>
);

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-[#e9eeec] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-[13px] font-semibold ${value === o.value ? "bg-white text-ink shadow-sm" : "text-mu hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LiveBadge({ connected, text }: { connected: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${connected ? "bg-teal-soft text-teal" : "bg-[#eef1f0] text-mu"}`}>
      <span className={`size-1.5 rounded-full ${connected ? "live-dot bg-teal" : "bg-faint"}`} />
      {connected ? text : "Reconnecting…"}
    </span>
  );
}

export function HealthBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-teal" : value >= 45 ? "bg-amber" : "bg-rose";
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e9eeec]" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Health score">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="tabular w-6 text-[13px] font-semibold">{value}</span>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-teal-soft text-teal",
  trialing: "bg-[#e8eefc] text-[#3657c9]",
  past_due: "bg-amber-soft text-[#a15f00]",
  churned: "bg-rose-soft text-rose",
};
export const StatusBadge = ({ status, label }: { status: string; label: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${STATUS_STYLE[status] ?? "bg-[#eef1f0] text-mu"}`}>{label}</span>
);

export const Button = ({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) => {
  const styles = {
    primary: "bg-ink text-white hover:bg-[#1f2f29]",
    secondary: "border border-line bg-white text-ink hover:bg-page",
    ghost: "text-mu hover:text-ink",
    danger: "border border-rose/40 text-rose hover:bg-rose-soft",
  }[variant];
  return <button {...p} className={`rounded-lg px-3.5 py-2 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} />;
};

export const Logo = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="8" fill="#0E1A16" />
    <path d="M5 17h5l3-7 5 13 3-6h6" fill="none" stroke="#5EB8AE" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-lg bg-rose-soft px-3 py-2 text-[13.5px] text-rose">{children}</p>
);
