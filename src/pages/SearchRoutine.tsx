import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { searchRoutine } from '../lib/routine';
import { useApp } from '../lib/store';
import { Badge, EmptyState, Icon, PageHeader } from '../lib/ui';
import { useClassModal, ClassModalHost, MobileClassCard } from '../components/ClassCard';
import clsx from 'clsx';

const SUGGEST = ['DSR', 'Pharmacology', 'PHAR-2401', 'AB-403', 'Batch 34', 'A1', 'GED'];

export default function SearchRoutine() {
  const { db, loading } = useData();
  const { settings } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'all' | 'course' | 'faculty' | 'room' | 'batch'>('all');
  const { entry, open, close } = useClassModal();

  const semester = useMemo(() => {
    if (!db) return null;
    return db.semesters.find((s) => s.is_active) ?? db.semesters[0] ?? null;
  }, [db]);

  const results = useMemo(() => {
    if (!db || !semester) return [];
    return searchRoutine(db, semester.id, q);
  }, [db, semester, q]);

  const categorized = useMemo(() => {
    if (category === 'all') return results;
    return results.filter((e) => {
      if (category === 'course') return Boolean(e.course && (e.course.code.toLowerCase().includes(q.toLowerCase()) || e.course.title.toLowerCase().includes(q.toLowerCase())));
      if (category === 'faculty') return Boolean(e.faculty && (e.faculty.name.toLowerCase().includes(q.toLowerCase()) || e.faculty.initials.toLowerCase().includes(q.toLowerCase())));
      if (category === 'room') return Boolean(e.room && e.room.code.toLowerCase().includes(q.toLowerCase()));
      return Boolean(e.batch && e.batch.name.toLowerCase().includes(q.toLowerCase()));
    });
  }, [results, category, q]);

  if (loading) return <div className="skeleton h-48" />;
  if (!db) return <EmptyState icon="alert" title="Could not load data" />;

  return (
    <div>
      <PageHeader
        title="Search Routine"
        subtitle="Search every scheduled class across the department by faculty name or initials, course name or code, room number, batch — and jump straight to the class details."
      />

      <div className="card p-4 sm:p-5">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="input !py-3 !pl-12 text-base"
            placeholder="Try “DSR”, “Pharmacology”, “PHAR-2401”, “AB-403”, “Batch 34”…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Quick:</span>
          {SUGGEST.map((s) => (
            <button key={s} onClick={() => setQ(s)} className="chip bg-slate-100 text-slate-600 transition-colors hover:bg-brand-100 hover:text-brand-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-brand-950 dark:hover:text-brand-300">
              {s}
            </button>
          ))}
          <span className="ml-auto text-xs font-semibold text-slate-400">{categorized.length} result{categorized.length === 1 ? '' : 's'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['all', 'course', 'faculty', 'room', 'batch'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-bold capitalize transition-colors',
                category === c ? 'grad-pill text-white shadow-glow-blue' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
              )}
            >
              {c === 'all' ? 'All categories' : c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {q.trim() ? (
          categorized.length ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {categorized.slice(0, 60).map((e) => (
                <div key={e.id} className="sm:hidden"><MobileClassCard entry={e} onClick={() => open(e)} /></div>
              ))}
              {categorized.slice(0, 60).map((e) => (
                <button
                  key={e.id}
                  onClick={() => open(e)}
                  className="card hidden items-center gap-3 p-3 text-left transition-all hover:-translate-y-px hover:shadow-card-hover sm:flex"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{e.course?.title}</p>
                      <Badge tone={e.class_type === 'lab' ? 'purple' : 'green'}>{e.class_type === 'lab' ? 'Lab' : 'Theory'}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {e.course?.code} · {e.faculty?.name} ({e.faculty?.initials}) · {e.room?.code}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-slate-400">
                      {e.batch?.name} · Section {e.section?.name}{e.labGroup ? ` · Group ${e.labGroup.name}` : ''} · {e.day?.name} {e.timeSlot?.start_time}–{e.timeSlot?.end_time}
                    </p>
                  </div>
                  <Icon name="chevronRight" className="shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon="search" title={`No matches for “${q}”`} hint="Try searching by faculty initials (e.g. DSR), course code (e.g. PHAR-2401) or room (e.g. AB-403)." />
          )
        ) : (
          <EmptyState
            icon="search"
            title="Type to search the whole department routine"
            hint="Results cover every batch, section and lab group for the active semester — including faculty initials, course codes and room numbers."
          />
        )}
      </div>

      <ClassModalHost entry={entry} onClose={close} />
    </div>
  );
}
