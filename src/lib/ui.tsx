import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import clsx from 'clsx';

/* ============================================================
 * Reusable UI primitives: icons, modal, toasts, tabs, empty
 * states, skeletons — all hand-rolled, no external deps.
 * ============================================================ */

/* ---------------- Icons (inline SVG, stroke-based) ---------------- */

export const icons = {
  calendar: <><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  door: <><path d="M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M14 12h.01" /></>,
  flask: <><path d="M10 2v6.5L4.3 18a2 2 0 0 0 1.8 3h11.8a2 2 0 0 0 1.8-3L14 8.5V2M8.5 2h7M7 15h10" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
  printer: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  edit: <><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  mapPin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  chevronRight: <><path d="m9 18 6-6-6-6" /></>,
  arrowLeft: <><path d="M19 12H5M12 19l-7-7 7-7" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  refresh: <><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  award: <><circle cx="12" cy="8" r="6" /><path d="M15.5 13 17 22l-5-3-5 3 1.5-9" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" /></>,
  layers: <><path d="m12 2 10 6-10 6L2 8l10-6zM2 13l10 6 10-6M2 18l10 6 10-6" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.6 2z" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>,
};

export type IconName = keyof typeof icons;

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icons[name]}
    </svg>
  );
}

/* ---------------- Logo ---------------- */

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#15803d" />
      <path d="M16 6c2 3 2 8-1.5 11.5S6.5 22 6.5 22s.5-5.5 4-9S14.5 9 16 6z" fill="#fbbf24" />
      <path d="M16 6c-2 3-2 8 1.5 11.5S25.5 22 25.5 22s-.5-5.5-4-9S17.5 9 16 6z" fill="#fcd34d" />
      <circle cx="16" cy="10.5" r="2.2" fill="#fff" />
      <path d="M13.5 26h5M10 28h12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  open, onClose, title, subtitle, children, wide,
}: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={clsx(
        'relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl animate-scale-in dark:bg-slate-900 sm:rounded-2xl scroll-thin',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
      )}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Toggle ---------------- */

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx('inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300')}
    >
      <span className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600')}>
        <span className={clsx('inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-[3px]')} style={{ height: 18, width: 18 }} />
      </span>
      {label}
    </button>
  );
}

/* ---------------- Segmented control ---------------- */

export function Segmented<T extends string>({
  value, onChange, options, size = 'md',
}: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md font-semibold transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value
              ? 'bg-white text-brand-800 shadow-sm dark:bg-slate-700 dark:text-brand-300'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Badge ---------------- */

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'purple' | 'amber' | 'red' | 'blue' | 'teal' | 'pink' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    purple: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
  };
  return <span className={clsx('chip', tones[tone])}>{children}</span>;
}

/* ---------------- Empty & error states ---------------- */

export function EmptyState({ icon = 'info', title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-2 border-red-200 px-6 py-10 text-center dark:border-red-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950">
        <Icon name="alert" className="h-6 w-6" />
      </div>
      <p className="font-semibold text-red-700 dark:text-red-300">Something went wrong</p>
      <p className="max-w-md text-sm text-slate-500">{message}</p>
      {onRetry && <button className="btn-secondary mt-3" onClick={onRetry}><Icon name="refresh" /> Retry</button>}
    </div>
  );
}

export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton h-20 w-full" />
      ))}
    </div>
  );
}

/* ---------------- Toasts ---------------- */

interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }
const ToastCtx = createContext<{ push: (kind: Toast['kind'], text: string) => void }>({ push: () => {} });

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in',
              t.kind === 'success' && 'border-green-200 bg-white text-green-800 dark:border-green-900 dark:bg-slate-900 dark:text-green-300',
              t.kind === 'error' && 'border-red-200 bg-white text-red-700 dark:border-red-900 dark:bg-slate-900 dark:text-red-300',
              t.kind === 'info' && 'border-sky-200 bg-white text-sky-800 dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300',
            )}
          >
            <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Select ---------------- */

export function Select({
  value, onChange, options, placeholder, className,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input appearance-none pr-9">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        <Icon name="chevronDown" className="h-4 w-4" />
      </span>
    </div>
  );
}

/* ---------------- PageHeader ---------------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Stat card ---------------- */

export function StatCard({ icon, label, value, tone = 'green' }: { icon: IconName; label: string; value: React.ReactNode; tone?: 'green' | 'purple' | 'blue' | 'amber' | 'teal' | 'pink' | 'slate' }) {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    purple: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    teal: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
    pink: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <div className="card flex items-center gap-3.5 p-4">
      <div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-lg font-extrabold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

/* ---------------- Legend ---------------- */

export function LegendChip({ color, label }: { color: string; label: string }) {
  const isLight = ['#0369a1', '#b45309', '#0d9488', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#15803d'].includes(color);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, outline: isLight ? 'none' : '1px solid rgba(0,0,0,.15)' }} />
      {label}
    </span>
  );
}
