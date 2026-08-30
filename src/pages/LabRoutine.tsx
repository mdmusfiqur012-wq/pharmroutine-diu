import { useEffect, useMemo, useState } from 'react';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { buildStudentRoutine } from '../lib/routine';
import { Badge, EmptyState, Icon, PageHeader, Select } from '../lib/ui';
import { SelectionPanel, NO_LAB } from '../components/SelectionPanel';
import { useClassModal, ClassModalHost, MobileClassCard, MiniClassCard } from '../components/ClassCard';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

/* ============================================================
 * Laboratory Routine — dedicated lab-only timetable per
 * section + lab group (A1/A2/B1/B2).
 * ============================================================ */

export default function LabRoutine() {
  const { db, loading } = useData();
  const { settings } = useApp();
  const navigate = useNavigate();
  const selection = useApp((s) => s.selection);
  const setSelection = useApp((s) => s.setSelection);
  const [labOnly, setLabOnly] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const { entry, open, close } = useClassModal();

  const labs = useMemo(() => {
    if (!db || !selection) return [];
    const res = buildStudentRoutine(db, selection, { showOffDays: false });
    return res.entries.filter((e) => e.class_type === 'lab');
  }, [db, selection]);

  // highlight the selected lab group chip
  useEffect(() => {
    if (db && selection && !selection.lab_group_id) {
      const groups = db.labGroups.filter((g) => g.section_id === selection.section_id);
      if (groups.length) setSelection({ ...selection, lab_group_id: groups[0].id });
    }
  }, [db, selection, setSelection]);

  const groups = useMemo(() => {
    if (!db || !selection) return [];
    return db.labGroups.filter((g) => g.section_id === selection.section_id);
  }, [db, selection]);

  const visible = useMemo(
    () => labs.filter((e) => (selectedGroup ? e.lab_group_id === selectedGroup : true)),
    [labs, selectedGroup],
  );

  if (loading) return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="skeleton h-28" />)}</div>;
  if (!db) return <EmptyState icon="alert" title="Could not load data" />;

  const labCourses = new Set(labs.map((e) => e.course_id));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Laboratory Routine"
        subtitle="Laboratory sessions are section-based and group-specific. Select your batch → section → lab group to see exactly which labs your group attends — the other group's sessions are excluded automatically."
      />

      <SelectionPanel db={db} selection={selection} onChange={setSelection} />

      <div className="mt-6 space-y-4">
        {selection && (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Filter by group:</span>
              <button
                onClick={() => setSelectedGroup('')}
                className={clsx('rounded-full px-3 py-1 text-xs font-bold', !selectedGroup ? 'bg-slate-800 text-white dark:bg-slate-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}
              >
                All labs
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroup(g.id)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-bold transition-colors',
                    selectedGroup === g.id ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900',
                    selection.lab_group_id === g.id && selectedGroup === '' && 'ring-2 ring-violet-400',
                  )}
                >
                  Group {g.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Icon name="flask" className="h-4 w-4 text-violet-500" />
              {labCourses.size} lab course{labCourses.size === 1 ? '' : 's'} · {visible.length} session{visible.length === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {/* Legend for lab colors */}
        <div className="card p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Laboratories available this semester</p>
          {db.courses.filter((c) => c.course_mode === 'lab' || c.course_mode === 'theory_lab').length ? (
            <div className="flex flex-wrap gap-2">
              {db.courses
                .filter((c) => c.course_mode === 'lab' || c.course_mode === 'theory_lab')
                .map((c) => (
                  <span key={c.id} className={clsx(
                    'chip border text-[11px]',
                    labCourses.has(c.id)
                      ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300'
                      : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500',
                  )}>
                    <Icon name="flask" className="h-3 w-3" />
                    {c.code} · {c.title}
                  </span>
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No laboratory courses found in the catalog.</p>
          )}
        </div>

        {visible.length ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((e) => (
              <div key={e.id} className="text-left">
                <MiniClassCard entry={e} onClick={() => open(e)} />
                <p className="mt-1 pl-1 text-[11px] font-semibold text-slate-400">
                  {e.day?.name} · {e.timeSlot?.label}
                </p>
              </div>
            ))}
          </div>
        ) : selection ? (
          <EmptyState
            icon="flask"
            title="No laboratory sessions"
            hint={selection.lab_group_id === NO_LAB ? 'Select a lab group (A1/A2/B1/B2) in the panel above to see lab sessions.' : 'No laboratory sessions are scheduled for this selection yet.'}
            action={!selection.lab_group_id || selection.lab_group_id === NO_LAB ? (
              <button className="btn-primary" onClick={() => navigate('/routine')}><Icon name="calendar" /> Open full routine</button>
            ) : undefined}
          />
        ) : (
          <EmptyState icon="flask" title="Select your batch & section" hint="Laboratory sessions are generated per section and lab group." />
        )}
        <div className="hidden">
          {/* keep modal host mountable */}
        </div>
      </div>
      <ClassModalHost entry={entry} onClose={close} />
    </div>
  );
}
