import { useMemo, useState } from 'react';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { buildFacultyRoutine, filterClasses, type ClassFilterKey } from '../lib/routine';
import type { FacultyType } from '../lib/types';
import { Badge, EmptyState, Icon, PageHeader, Select, Segmented } from '../lib/ui';
import Timetable, { PrintTimetable } from '../components/Timetable';
import { printElement } from '../lib/exports';

const TYPE_META: Record<FacultyType, { label: string; tone: 'green' | 'pink' | 'blue' | 'amber' | 'teal' }> = {
  regular: { label: 'Regular', tone: 'green' },
  guest: { label: 'Guest', tone: 'pink' },
  ged: { label: 'GED', tone: 'blue' },
  nfe: { label: 'NFE', tone: 'amber' },
  external: { label: 'External', tone: 'teal' },
};

export default function FacultyRoutine() {
  const { db, loading } = useData();
  const { settings } = useApp();
  const [facultyId, setFacultyId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | FacultyType>('all');
  const [filter, setFilter] = useState<ClassFilterKey>('all');

  const faculty = useMemo(() => {
    if (!db) return [];
    const q = query.trim().toLowerCase();
    return db.faculty
      .filter((f) => f.is_active)
      .filter((f) => (category === 'all' ? true : f.faculty_type === category))
      .filter((f) => (q ? f.name.toLowerCase().includes(q) || f.initials.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db, query, category]);

  const selected = db?.faculty.find((f) => f.id === facultyId) ?? null;

  const result = useMemo(
    () => (db && selected ? buildFacultyRoutine(db, selected.id) : null),
    [db, selected],
  );

  const filtered = useMemo(
    () => (result ? filterClasses(result.entries, filter) : []),
    [result, filter],
  );

  const offDayMap = useMemo(() => new Map<string, { reason?: string | null }>(), []);

  if (loading) return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="skeleton h-32" />)}</div>;
  if (!db) return <EmptyState icon="alert" title="Could not load data" />;

  return (
    <div>
      <PageHeader
        title="Faculty Routine"
        subtitle="Search any faculty member by name or initials and view their complete weekly teaching schedule — batch, section, laboratory group, course, room, day and time."
      />

      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label">Search by name or initials</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
              <input className="input pl-9" placeholder="e.g. DSR, Dr. Sharmin, Rahman…" value={query} onChange={(e) => { setQuery(e.target.value); setFacultyId(''); }} />
            </div>
          </div>
          <div className="w-full sm:w-60">
            <label className="label">Faculty category</label>
            <Select value={category} onChange={(v) => { setCategory(v as any); setFacultyId(''); }} options={[
              { value: 'all', label: 'All categories' },
              { value: 'regular', label: 'Regular (Pharmacy)' },
              { value: 'guest', label: 'Guest faculty' },
              { value: 'ged', label: 'GED department' },
              { value: 'nfe', label: 'NFE department' },
              { value: 'external', label: 'External / Agriculture' },
            ]} />
          </div>
        </div>

        <div>
          <label className="label">Select faculty member ({faculty.length})</label>
          <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 scroll-thin sm:grid-cols-2 lg:grid-cols-3">
            {faculty.map((f) => (
              <button
                key={f.id}
                onClick={() => setFacultyId(f.id)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${facultyId === f.id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/40 dark:bg-brand-950/40' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60'}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[10px] font-extrabold text-white dark:bg-slate-700">{f.initials}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{f.name}</span>
                  <span className="block truncate text-[10px] text-slate-400">{f.designation}</span>
                </span>
                <span className="ml-auto shrink-0">
                  <Badge tone={TYPE_META[f.faculty_type].tone}>{TYPE_META[f.faculty_type].label}</Badge>
                </span>
              </button>
            ))}
            {!faculty.length && <p className="col-span-full py-4 text-center text-sm text-slate-400">No faculty match your search.</p>}
          </div>
        </div>
      </div>

      {selected && result ? (
        <div className="mt-6 space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-white dark:bg-slate-700">
                <span className="text-xs font-extrabold">{selected.initials}</span>
              </span>
              <div>
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">{selected.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selected.designation} · {selected.department} · <span className="capitalize">{selected.faculty_type}</span>
                </p>
                {selected.email && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><Icon name="mail" className="h-3 w-3" />{selected.email}</p>}
                {selected.phone && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><Icon name="phone" className="h-3 w-3" />{selected.phone}</p>}
              </div>
              <div className="ml-2 hidden gap-4 border-l border-slate-100 pl-4 sm:flex dark:border-slate-800">
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Classes</p><p className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{result.entries.length}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Days</p><p className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{result.days.length}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Batches</p><p className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{new Set(result.entries.map((e) => e.batch_id)).size}</p></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<ClassFilterKey> size="sm" value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All' }, { value: 'theory', label: 'Theory' }, { value: 'lab', label: 'Labs' },
              ]} />
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => printElement()}><Icon name="printer" className="h-3.5 w-3.5" /> Print</button>
            </div>
          </div>

          <div className="no-print">
          <Timetable
            entries={filtered}
            days={result.days}
            slots={result.slots}
            offDayMap={offDayMap}
            showLegend={false}
            selectionLabel={[selected.name, selected.initials]}
          />
          </div>

          <div className="print-only-wrap">
            <PrintTimetable
              entries={filtered}
              days={result.days}
              slots={result.slots}
              offDayMap={offDayMap}
              selectionLabel={[`Faculty: ${selected.name}`, selected.initials]}
              settings={settings}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon="users"
            title="Select a faculty member"
            hint="Their complete weekly schedule — with batch, section, lab group, course, room and time — will appear here."
          />
        </div>
      )}
    </div>
  );
}
