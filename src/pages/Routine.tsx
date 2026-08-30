import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { JoinedEntry, RoutineSelection } from '../lib/types';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { buildStudentRoutine, filterClasses, offDaysFor, type ClassFilterKey } from '../lib/routine';
import { exportRoutinePdf, exportRoutinePng, printElement, ROUTINE_PDF_FILENAME } from '../lib/exports';
import { SelectionPanel, NO_LAB } from '../components/SelectionPanel';
import Timetable, { PrintTimetable } from '../components/Timetable';
import { EmptyState, Icon, PageHeader, Segmented, Toggle, useToast } from '../lib/ui';

export default function Routine() {
  const { db, loading } = useData();
  const { settings, user } = useApp();
  const selection = useApp((s) => s.selection);
  const setSelection = useApp((s) => s.setSelection);
  const toast = useToast();
  const navigate = useNavigate();

  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<ClassFilterKey>('all');
  const [showOffDays, setShowOffDays] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const studentPrefill = useMemo(() => {
    if (user?.role !== 'student' || !db) return null;
    return (user as any).batch ? (user as any) : null;
  }, [user, db]);

  // prefill for student role
  useEffect(() => {
    if (!db || selection || !studentPrefill) return;
    const b = db.batches.find((x) => x.batch_no === studentPrefill.batch);
    const sec = db.sections.find((s) => s.batch_id === b?.id && s.name === studentPrefill.section);
    const grp = db.labGroups.find((g) => g.section_id === sec?.id && g.name === studentPrefill.labGroup);
    if (b && sec) {
      setSelection({ semester_id: db.semesters.find((s) => s.is_active)?.id ?? db.semesters[0].id, batch_id: b.id, section_id: sec.id, lab_group_id: grp?.id ?? NO_LAB });
    }
  }, [db, selection, studentPrefill, setSelection]);

  // simulate generation latency when selection changes
  useEffect(() => {
    if (!selection) return;
    setGenerating(true);
    const t = setTimeout(() => setGenerating(false), 450);
    return () => clearTimeout(t);
  }, [selection]);

  const result = useMemo(() => {
    if (!db || !selection) return null;
    return buildStudentRoutine(db, selection, { showOffDays });
  }, [db, selection, showOffDays]);

  const filtered = useMemo(
    () => (result ? filterClasses(result.entries, filter) : []),
    [result, filter],
  );

  const offDayMap = useMemo(() => {
    if (!db || !selection) return new Map<string, { reason?: string | null }>();
    return new Map(offDaysFor(db, selection.semester_id, selection.batch_id).map((o) => [o.day_id, { reason: o.reason }]));
  }, [db, selection]);

  if (loading) return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className={`skeleton h-24 ${i === 2 ? 'h-72' : ''}`} />)}</div>;
  if (!db) return <EmptyState icon="alert" title="Could not load data" />;

  const label = selection
    ? [
        db.semesters.find((s) => s.id === selection.semester_id)?.name ?? '',
        db.batches.find((b) => b.id === selection.batch_id)?.name ?? '',
        `Section ${db.sections.find((s) => s.id === selection.section_id)?.name ?? ''}`,
        selection.lab_group_id !== NO_LAB ? `Group ${db.labGroups.find((g) => g.id === selection.lab_group_id)?.name ?? ''}` : '',
      ].filter(Boolean)
    : [];

  async function handlePdf() {
    if (!result) return;
    const seed = [label[1], label[2], label[3]].filter(Boolean).join('-') || 'routine';
    try {
      await exportRoutinePdf({
        settings,
        semesterName: label[0] ?? '',
        batchName: label[1] ?? '',
        sectionName: label[2]?.replace('Section ', '') ?? '',
        labGroupName: selection?.lab_group_id !== NO_LAB && selection ? db!.labGroups.find((g) => g.id === selection.lab_group_id)?.name ?? null : null,
        days: result.days,
        slots: result.slots,
        entries: filtered,
        offDayMap,
        title: 'Personalized Class Routine',
      }, ROUTINE_PDF_FILENAME(seed));
      toast.push('success', 'PDF downloaded successfully.');
    } catch (e: any) {
      toast.push('error', 'PDF export failed: ' + (e?.message ?? 'unknown error'));
    }
  }

  async function handlePng() {
    if (!printRef.current) return;
    try {
      const el = printRef.current;
      const prev = { display: el.style.display, position: el.style.position, left: el.style.left };
      el.style.display = 'block';
      el.style.position = 'fixed';
      el.style.left = '-10000px';
      el.style.top = '0';
      await new Promise((r) => setTimeout(r, 60));
      await exportRoutinePng(el, ROUTINE_PDF_FILENAME((label[1] ?? 'routine').replace(/\s+/g, '-')));
      el.style.display = prev.display;
      el.style.position = prev.position;
      el.style.left = prev.left;
      toast.push('success', 'Image downloaded successfully.');
    } catch (e: any) {
      toast.push('error', 'Image export failed: ' + (e?.message ?? 'unknown error'));
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Routine"
        subtitle="Select your semester, batch, section and laboratory group — the routine is generated dynamically from the department database. Every batch has its own class days, off days and weekly structure."
        actions={
          user?.role === 'admin' ? (
            <button className="btn-secondary" onClick={() => navigate('/admin/routines')}>
              <Icon name="settings" /> Manage in admin
            </button>
          ) : undefined
        }
      />

      <SelectionPanel db={db} selection={selection} onChange={setSelection} loading={generating} />

      {!selection || !result ? (
        <div className="mt-6">
          <EmptyState
            icon="calendar"
            title="No routine selected yet"
            hint="Choose a batch and section above to generate your personalized weekly timetable. Laboratory sessions appear automatically for your lab group only."
            action={<button className="btn-primary" onClick={() => document.querySelector('select')?.focus()}>Get started</button>}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* summary + controls */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
              <span className="flex items-center gap-2 font-extrabold text-slate-800 dark:text-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white"><Icon name="award" className="h-4 w-4" /></span>
                {label.join('  ·  ')}
              </span>
              <span className="hidden text-slate-400 sm:inline">Generated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<ClassFilterKey> size="sm" value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All' },
                { value: 'theory', label: 'Theory' },
                { value: 'lab', label: 'Labs' },
              ]} />
              <Toggle checked={showOffDays} onChange={setShowOffDays} label="Show off days" />
              <div className="flex gap-1.5">
                <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={handlePdf}><Icon name="download" className="h-3.5 w-3.5" /> PDF</button>
                <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={handlePng}><Icon name="image" className="h-3.5 w-3.5" /> PNG</button>
                <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => printElement()}><Icon name="printer" className="h-3.5 w-3.5" /> Print</button>
              </div>
            </div>
          </div>

          {/* off-day notice */}
          {result.hasOffDays && showOffDays && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-800 dark:text-amber-300">
                <span className="font-bold">Batch-specific off days detected: </span>
                {result.offDays.map((d) => d.name).join(', ')} — marked as official off days for this batch. Use the toggle to hide them.
              </p>
            </div>
          )}

          <div className="print-page no-print">
            <Timetable
              entries={filtered}
              days={result.days}
              slots={result.slots}
              offDayMap={offDayMap}
              selectionLabel={label}
            />
          </div>

          {/* print-only + export canvas */}
          <div ref={printRef} className="print-only-wrap">
            <PrintTimetable
              entries={filtered}
              days={result.days}
              slots={result.slots}
              offDayMap={offDayMap}
              selectionLabel={label}
              settings={settings}
            />
          </div>
        </div>
      )}
    </div>
  );
}
