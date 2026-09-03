import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useData } from '../lib/data';
import { Badge, EmptyState, Icon, PageHeader } from '../lib/ui';

const CATS = [
  { id: 'all', label: 'All' },
  { id: 'notice', label: 'Notices' },
  { id: 'routine', label: 'Routine updates' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'event', label: 'Events' },
];

export default function Announcements() {
  const { db, loading } = useData();
  const [cat, setCat] = useState('all');
  const [batchFilter, setBatchFilter] = useState('');

  const list = useMemo(() => {
    if (!db) return [];
    return db.announcements
      .filter((a) => a.is_active)
      .filter((a) => (cat === 'all' ? true : a.category === cat))
      .filter((a) => (batchFilter ? a.batch_id === batchFilter || !a.batch_id : true))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
  }, [db, cat, batchFilter]);

  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24" />)}</div>;
  if (!db) return <EmptyState icon="alert" title="Could not load data" />;

  const iconFor = (c: string) => (c === 'urgent' ? 'alert' : c === 'event' ? 'award' : c === 'routine' ? 'calendar' : 'bell') as any;
  const toneFor = (c: string) =>
    c === 'urgent' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
      : c === 'event' ? 'bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400'
        : c === 'routine' ? 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
          : 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400';

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Official notices from the Department of Pharmacy — routine updates, guest lectures, exams and events." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={clsx('rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors', cat === c.id ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700')}
          >
            {c.label}
          </button>
        ))}
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="input !w-auto !py-1.5 text-xs">
          <option value="">All batches</option>
          {db.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {list.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((a) => (
            <article key={a.id} className={clsx('card p-5 transition-all hover:shadow-card-hover', a.pinned && 'ring-1 ring-amber-300/70 dark:ring-amber-700/50')}>
              <div className="flex items-start gap-3">
                <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneFor(a.category))}>
                  <Icon name={iconFor(a.category)} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{a.title}</h3>
                    {a.pinned && <Badge tone="amber">Pinned</Badge>}
                    {a.batch_id && <Badge tone="green">{db.batches.find((b) => b.id === a.batch_id)?.name}</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a.body}</p>
                  <p className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                    <span className="capitalize">{a.category}</span> ·
                    {a.created_by_name ?? 'Department'} ·
                    {new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon="bell" title="No announcements" hint="There are no announcements matching this filter right now." />
      )}
    </div>
  );
}
