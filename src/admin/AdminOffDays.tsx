import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useData } from '../lib/data';
import { AdminShell } from './common';
import { EmptyState, Icon, Select, useToast } from '../lib/ui';
import { api } from '../lib/db';

/* ============================================================
 * Admin → Batch Off Days.
 * Each batch has its OWN academic calendar: Semester + Batch +
 * Day. Off days live in a separate table so the calendar can be
 * changed independently of routine entries — no code changes.
 * ============================================================ */

export default function AdminOffDays() {
  const { db, loading, refresh } = useData();
  const toast = useToast();
  const [semId, setSemId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [checks, setChecks] = useState<Record<string, { on: boolean; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const sem = db?.semesters.find((s) => s.is_active) ?? db?.semesters[0];
  useEffect(() => { if (!semId && sem) setSemId(sem.id); }, [semId, sem]);

  const days = useMemo(() => (db ? [...db.classDays].filter((d) => d.is_active).sort((a, b) => a.sequence - b.sequence) : []), [db]);

  // load off days for the selected semester+batch
  useEffect(() => {
    if (!db || !semId || !batchId) return;
    const offs = db.batchOffDays.filter((o) => o.semester_id === semId && o.batch_id === batchId);
    const next: Record<string, { on: boolean; reason: string }> = {};
    for (const d of days) {
      const hit = offs.find((o) => o.day_id === d.id);
      next[d.id] = { on: Boolean(hit), reason: hit?.reason ?? '' };
    }
    setChecks(next);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, semId, batchId, days.length]);

  if (loading) return <AdminShell><div className="skeleton h-96" /></AdminShell>;
  if (!db) return <AdminShell><EmptyState icon="alert" title="No data" /></AdminShell>;

  const batch = db.batches.find((b) => b.id === batchId);
  const entriesOnOffDay = (dayId: string) =>
    db.routineEntries.filter((e) => e.semester_id === semId && e.batch_id === batchId && e.day_id === dayId).length;

  function toggle(dayId: string) {
    setChecks((c) => ({ ...c, [dayId]: { ...c[dayId], on: !c[dayId]?.on, reason: c[dayId]?.reason ?? 'No classes scheduled' } }));
    setDirty(true);
  }
  function setReason(dayId: string, reason: string) {
    setChecks((c) => ({ ...c, [dayId]: { ...c[dayId], reason } }));
    setDirty(true);
  }

  async function save() {
    if (!semId || !batchId) return;
    setBusy(true);
    const rows = days.filter((d) => checks[d.id]?.on).map((d) => ({ day_id: d.id, reason: checks[d.id]?.reason || 'No classes scheduled' }));
    const res = await api.setOffDays(semId, batchId, rows);
    setBusy(false);
    if (!res.ok) { toast.push('error', res.error ?? 'Save failed'); return; }
    toast.push('success', `Off-day calendar saved for ${batch?.name}.`);
    setDirty(false);
    await refresh();
  }

  const activeCount = days.filter((d) => checks[d.id]?.on).length;
  const warning = days.filter((d) => checks[d.id]?.on && entriesOnOffDay(d.id) > 0);

  return (
    <AdminShell>
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-56"><label className="label">Semester</label>
          <Select value={semId} onChange={setSemId} options={db.semesters.map((s) => ({ value: s.id, label: s.name }))} /></div>
        <div className="w-56"><label className="label">Batch</label>
          <Select value={batchId} onChange={(v) => setBatchId(v)} options={db.batches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select a batch…" /></div>
        <p className="pb-2 text-[11px] font-semibold text-slate-400">
          Off-day records are stored per <span className="font-bold">Semester + Batch + Day</span> — every batch has an independent weekly calendar.
        </p>
      </div>

      {batchId ? (
        <div className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{batch?.name ?? "Batch"} — weekly calendar</h3>
              <p className="text-xs text-slate-400">
                {activeCount} official off day{activeCount === 1 ? '' : 's'} · {days.length - activeCount} academic day{days.length - activeCount === 1 ? '' : 's'} with classes
              </p>
            </div>
            <button className={clsx('btn-primary !py-2', !dirty && 'opacity-40')} onClick={save} disabled={busy || !dirty}>
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="check" className="h-4 w-4" />}
              Save calendar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {days.map((d) => {
              const on = checks[d.id]?.on;
              const clash = entriesOnOffDay(d.id);
              return (
                <div key={d.id} className={clsx(
                  'rounded-xl border p-4 transition-colors',
                  on ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800/70 dark:bg-amber-950/30' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={clsx('flex h-9 w-9 items-center justify-center rounded-lg text-xs font-extrabold text-white', on ? 'bg-amber-500' : 'bg-brand-700')}>
                        {d.short_name}
                      </span>
                      <div>
                        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{d.name}</p>
                        <p className="text-[11px] text-slate-400">{clash} class{clash === 1 ? '' : 'es'} scheduled</p>
                      </div>
                    </div>
                    <button
                      role="switch" aria-checked={on}
                      onClick={() => toggle(d.id)}
                      className={clsx('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600')}
                    >
                      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
                    </button>
                  </div>
                  {on && (
                    <div className="mt-3">
                      <label className="label">Reason shown to students</label>
                      <input className="input !py-1.5 text-xs" value={checks[d.id]?.reason ?? ''} onChange={(e) => setReason(d.id, e.target.value)} placeholder="e.g. Weekly holiday / No classes scheduled" />
                    </div>
                  )}
                  {on && clash > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                      <Icon name="alert" className="mt-0.5 h-3 w-3 shrink-0" />
                      {clash} routine entr{clash === 1 ? 'y' : 'ies'} still exist on this day — the student interface will show this row as OFF DAY.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <p className="font-extrabold text-slate-600 dark:text-slate-300">How this works</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Off days live in a <code className="rounded bg-slate-200/70 px-1 dark:bg-slate-700">batch_off_days</code> table keyed by <b>semester + batch + day</b> — fully independent per batch.</li>
              <li>In the student interface the day renders as <b>“OFF DAY — No Classes Scheduled”</b> or can be hidden with the <b>Show off days</b> toggle.</li>
              <li>Existing routine entries on a marked off day are not deleted — they simply appear as off-day rows (flag them above and reschedule from Routine Entries).</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-6"><EmptyState icon="clock" title="Select a batch" hint="Choose a semester and batch above to configure its independent off-day calendar." /></div>
      )}
    </AdminShell>
  );
}
