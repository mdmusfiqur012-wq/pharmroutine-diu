import { useState } from 'react';
import clsx from 'clsx';
import type { JoinedEntry } from '../lib/types';
import { classColor, STATUS_META } from '../lib/routine';
import { useApp } from '../lib/store';
import { Badge, Icon, Modal } from '../lib/ui';

/* ============================================================
 * ClassCard — compact interactive card for one slot in the
 * timetable + ClassModal with the full detail view.
 * ============================================================ */

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function useClassModal() {
  const [entry, setEntry] = useState<JoinedEntry | null>(null);
  return { entry, open: setEntry, close: () => setEntry(null) };
}

export function ClassModalHost({ entry, onClose }: { entry: JoinedEntry | null; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  if (!entry) return null;
  const color = classColor(entry, settings.colors);
  const status = STATUS_META[entry.status];
  const meta: { icon: any; label: string; value: string }[] = [
    { icon: 'calendar', label: 'Day & Time', value: `${entry.day?.name ?? '—'} · ${entry.timeSlot?.label ?? '—'}` },
    { icon: 'users', label: 'Batch / Section', value: `${entry.batch?.name ?? '—'} · Section ${entry.section?.name ?? '—'}` },
  ];
  if (entry.labGroup) meta.push({ icon: 'flask', label: 'Laboratory Group', value: `Group ${entry.labGroup.name} (Section ${entry.section?.name})` });
  if (entry.class_type === 'theory') meta.push({ icon: 'book', label: 'Class Type', value: 'Theory — Section class' });
  meta.push({ icon: 'mapPin', label: 'Room', value: `${entry.room?.code ?? '—'} · ${entry.room?.name ?? ''}` });
  meta.push({ icon: 'award', label: 'Faculty', value: `${entry.faculty?.name ?? '—'} (${entry.faculty?.initials ?? ''}) · ${entry.faculty?.designation ?? ''}` });
  meta.push({ icon: 'building', label: 'Department', value: `${entry.course ? entry.course.department.toUpperCase() : '—'} · Faculty type: ${entry.faculty?.faculty_type ?? '—'}` });
  meta.push({ icon: 'clock', label: 'Duration', value: '1 hour 30 minutes' });

  return (
    <Modal open onClose={onClose} title={entry.course?.title ?? 'Class details'} subtitle={entry.course?.code ?? ''}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl p-4 text-white shadow-sm" style={{ backgroundColor: color }}>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
              {entry.class_type === 'lab' ? `Laboratory · Group ${entry.labGroup?.name}` : 'Theory class'}
            </p>
            <p className="truncate text-base font-extrabold">{entry.course?.title}</p>
            <p className="text-xs font-semibold opacity-90">{entry.course?.code} · {entry.course?.credit} credits</p>
          </div>
          <div className="text-right text-xs font-bold">
            <p>{entry.day?.short_name}, {entry.timeSlot?.start_time}</p>
            <p className="opacity-80">{entry.room?.code}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {meta.map((m) => (
            <div key={m.label} className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="mt-0.5 text-slate-400"><Icon name={m.icon} /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{m.label}</p>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{m.value}</p>
              </div>
            </div>
          ))}
        </div>

        {entry.status !== 'active' && (
          <div className={clsx('flex items-start gap-2.5 rounded-xl border p-3 text-sm font-medium', status.classes, 'border-current/20')}>
            <Icon name={entry.status === 'cancelled' ? 'alert' : 'clock'} className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold uppercase tracking-wide text-xs">{status.label}</p>
              {entry.notes && <p className="mt-0.5 font-normal">{entry.notes}</p>}
            </div>
          </div>
        )}
        {entry.notes && entry.status === 'active' && (
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-slate-600 dark:text-slate-300"><span className="font-bold">Note:</span> {entry.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
          <span>Updated {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : '—'}</span>
          <Badge tone={entry.status === 'active' ? 'green' : entry.status === 'cancelled' ? 'red' : 'amber'}>{status.label}</Badge>
        </div>
      </div>
    </Modal>
  );
}

/* Compact card rendered inside a timetable cell */
export function MiniClassCard({ entry, onClick }: { entry: JoinedEntry; onClick?: () => void }) {
  const settings = useApp((s) => s.settings);
  const color = classColor(entry, settings.colors);
  const cancelled = entry.status === 'cancelled';
  const rescheduled = entry.status === 'rescheduled';
  return (
    <button
      onClick={onClick}
      title={`${entry.course?.title} · ${entry.course?.code} · ${entry.faculty?.name}`}
      className={clsx(
        'group relative w-full overflow-hidden rounded-lg border-l-4 px-2.5 py-2 text-left transition-all hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        cancelled && 'opacity-60 saturate-50',
      )}
      style={{
        borderLeftColor: color,
        backgroundColor: hexToRgba(color, 0.09),
      }}
    >
      {rescheduled && (
        <span className="absolute right-1.5 top-1.5 rounded px-1 text-[8px] font-extrabold uppercase tracking-wide text-white" style={{ backgroundColor: color }}>
          Moved
        </span>
      )}
      {cancelled && (
        <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1 text-[8px] font-extrabold uppercase tracking-wide text-white">
          ✕
        </span>
      )}
      <p className="pr-8 text-[10px] font-extrabold uppercase tracking-wide" style={{ color }}>
        {entry.course?.code}
        {entry.labGroup && <span className="ml-1">· {entry.labGroup.name}</span>}
      </p>
      <p className={clsx('mt-0.5 line-clamp-2 text-[11px] font-bold leading-snug text-slate-800 dark:text-slate-100', cancelled && 'line-through')}>
        {entry.course?.title}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-300">{entry.faculty?.initials}</span>
        <span className="inline-flex items-center gap-0.5"><Icon name="door" className="h-2.5 w-2.5" />{entry.room?.code}</span>
      </p>
    </button>
  );
}

/* Mobile stacked card */
export function MobileClassCard({ entry, onClick }: { entry: JoinedEntry; onClick?: () => void }) {
  const settings = useApp((s) => s.settings);
  const color = classColor(entry, settings.colors);
  const cancelled = entry.status === 'cancelled';
  const rescheduled = entry.status === 'rescheduled';
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-stretch gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-card transition-transform active:scale-[.99] dark:border-slate-800 dark:bg-slate-900',
        cancelled && 'opacity-70',
      )}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex w-[74px] shrink-0 flex-col items-center justify-center py-3 text-white" style={{ backgroundColor: color }}>
        <p className="text-[10px] font-bold uppercase leading-none opacity-85">{entry.day?.short_name}</p>
        <p className="mt-1 text-sm font-extrabold leading-none">{entry.timeSlot?.start_time}</p>
        <p className="text-[10px] font-semibold leading-none opacity-85">{entry.timeSlot?.end_time}</p>
      </div>
      <div className="min-w-0 flex-1 py-2.5 pr-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color }}>
            {entry.course?.code}{entry.labGroup ? ` · Group ${entry.labGroup.name}` : ''}
          </p>
          {rescheduled && <Badge tone="amber">Moved</Badge>}
          {cancelled && <Badge tone="red">Cancelled</Badge>}
        </div>
        <p className={clsx('mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100', cancelled && 'line-through')}>
          {entry.course?.title}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          {entry.faculty?.name} ({entry.faculty?.initials}) · <span className="inline-flex items-center gap-0.5"><Icon name="door" className="h-3 w-3" />{entry.room?.code}</span>
          {entry.labGroup ? ` · Grp ${entry.labGroup.name}` : ''}
        </p>
      </div>
    </button>
  );
}
