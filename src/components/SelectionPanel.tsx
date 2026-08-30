import { useMemo } from 'react';
import type { Database, RoutineSelection } from '../lib/types';
import { Select } from '../lib/ui';

/* ============================================================
 * SelectionPanel — Semester → Batch → Section → Lab Group.
 * Sections & lab groups are derived from the selected batch,
 * never assumed. "No lab" = theory-only routine.
 * ============================================================ */

export const NO_LAB = 'none';

export function labGroupsFor(db: Database, sectionId: string) {
  return db.labGroups.filter((g) => g.section_id === sectionId);
}

export function SelectionPanel({
  db, selection, onChange, loading,
}: {
  db: Database;
  selection: RoutineSelection | null;
  onChange: (sel: RoutineSelection) => void;
  loading?: boolean;
}) {
  const semesters = useMemo(() => [...db.semesters].sort((a, b) => (Number(b.is_active) - Number(a.is_active)) || a.name.localeCompare(b.name)), [db.semesters]);
  const batches = useMemo(() => [...db.batches].sort((a, b) => b.batch_no - a.batch_no), [db.batches]);
  const activeSemester = semesters.find((s) => s.is_active) ?? semesters[0];

  const sel = selection && semesters.some((s) => s.id === selection.semester_id) ? selection : null;
  const semesterId = sel?.semester_id ?? activeSemester?.id ?? '';
  const batch = batches.find((b) => b.id === sel?.batch_id);
  const sections = db.sections.filter((s) => s.batch_id === batch?.id);
  const section = sections.find((s) => s.id === sel?.section_id);
  const groups = section ? labGroupsFor(db, section.id) : [];
  const showLabGroup = Boolean(section && groups.length);

  function update(patch: Partial<RoutineSelection>) {
    const next: RoutineSelection = {
      semester_id: semesterId,
      batch_id: batch?.id ?? '',
      section_id: section?.id ?? '',
      lab_group_id: NO_LAB,
      ...patch,
    };
    onChange(next);
  }

  return (
    <div className="card relative p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 text-white"><span className="text-sm font-extrabold">1</span></span>
        <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Select your academic information</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Semester</label>
          <Select
            value={semesterId}
            onChange={(v) => update({ semester_id: v })}
            options={semesters.map((s) => ({ value: s.id, label: `${s.name}${s.is_active ? ' (Active)' : ''}` }))}
          />
        </div>
        <div>
          <label className="label">Batch</label>
          <Select value={batch?.id ?? ''} onChange={(v) => update({ batch_id: v, section_id: '', lab_group_id: NO_LAB })} options={batches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select batch" />
        </div>
        <div>
          <label className="label">Section</label>
          <Select
            value={section?.id ?? ''}
            onChange={(v) => update({ section_id: v, lab_group_id: NO_LAB })}
            options={sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
            placeholder={batch ? 'Select section' : 'Select batch first'}
            className={batch ? '' : 'opacity-50'}
          />
        </div>
        <div>
          <label className="label">Lab Group</label>
          <Select
            value={sel?.lab_group_id ?? NO_LAB}
            onChange={(v) => update({ lab_group_id: v })}
            options={[
              { value: NO_LAB, label: 'Theory Only (no labs)' },
              ...groups.map((g) => ({ value: g.id, label: `Group ${g.name}` })),
            ]}
            placeholder={!showLabGroup ? 'N/A for this section' : 'Select lab group'}
            className={showLabGroup ? '' : 'opacity-50'}
          />
        </div>
      </div>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px] dark:bg-slate-900/70">
          <span className="flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            Generating your routine…
          </span>
        </div>
      )}
    </div>
  );
}
