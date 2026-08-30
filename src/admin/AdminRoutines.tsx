import { useMemo, useState } from 'react';
import { useData } from '../lib/data';
import { AdminShell, AdminModal, Field, SaveBar, useRefresh } from './common';
import { Badge, EmptyState, Icon, Select, useToast } from '../lib/ui';
import { api } from '../lib/db';
import { checkConflicts, conflictSummary } from '../lib/conflicts';
import type { RoutineEntry, EntryStatus } from '../lib/types';
import clsx from 'clsx';

/* ============================================================
 * Admin → Routine Entries: full CRUD with live conflict
 * detection (faculty / room / section / lab group).
 * ============================================================ */

interface FormState {
  id?: string;
  semester_id: string;
  batch_id: string;
  section_id: string;
  lab_group_id: string;
  course_id: string;
  faculty_id: string;
  room_id: string;
  day_id: string;
  time_slot_id: string;
  class_type: 'theory' | 'lab';
  status: EntryStatus;
  notes: string;
}

const empty = (semesterId: string): FormState => ({
  semester_id: semesterId, batch_id: '', section_id: '', lab_group_id: '', course_id: '',
  faculty_id: '', room_id: '', day_id: '', time_slot_id: '', class_type: 'theory', status: 'active', notes: '',
});

export default function AdminRoutines() {
  const { db, loading } = useData();
  const refresh = useRefresh();
  const toast = useToast();
  const [fSem, setFSem] = useState('');
  const [fBatch, setFBatch] = useState('');
  const [fType, setFType] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const activeSem = db?.semesters.find((s) => s.is_active) ?? db?.semesters[0];

  const rows = useMemo(() => {
    if (!db) return [];
    const semId = fSem || activeSem?.id;
    return db.routineEntries
      .filter((e) => (semId ? e.semester_id === semId : true))
      .filter((e) => (fBatch ? e.batch_id === fBatch : true))
      .filter((e) => (fType ? e.class_type === fType : true))
      .filter((e) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const course = db.courses.find((c) => c.id === e.course_id);
        const fac = db.faculty.find((f) => f.id === e.faculty_id);
        const room = db.rooms.find((r) => r.id === e.room_id);
        const batch = db.batches.find((b) => b.id === e.batch_id);
        return [course?.code, course?.title, fac?.name, fac?.initials, room?.code, batch?.name].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.day_id ?? '').localeCompare(b.day_id ?? '') || (db.timeSlots.find((t) => t.id === a.time_slot_id)?.sequence ?? 0) - (db.timeSlots.find((t) => t.id === b.time_slot_id)?.sequence ?? 0));
  }, [db, fSem, fBatch, fType, search, activeSem]);

  if (loading) return <AdminShell><div className="skeleton h-96" /></AdminShell>;
  if (!db) return <AdminShell><EmptyState icon="alert" title="No data" /></AdminShell>;

  const semId = modal?.semester_id ?? '';
  const sections = db.sections.filter((s) => s.batch_id === modal?.batch_id);
  const groups = db.labGroups.filter((g) => g.section_id === modal?.section_id);
  const isLab = modal?.class_type === 'lab';
  const roomsForType = db.rooms.filter((r) => r.is_active && (isLab ? r.room_type !== 'theory' : true));
  const courses = db.courses.filter((c) => c.is_active && (isLab ? c.course_mode !== 'theory' : c.course_mode !== 'lab'));
  const faculty = db.faculty.filter((f) => f.is_active);

  function openAdd() {
    const e = empty(activeSem?.id ?? db!.semesters[0]?.id ?? '');
    setModal(e);
    setIssues([]);
  }

  function openEdit(row: RoutineEntry) {
    setModal({
      id: row.id, semester_id: row.semester_id, batch_id: row.batch_id, section_id: row.section_id,
      lab_group_id: row.lab_group_id ?? '', course_id: row.course_id, faculty_id: row.faculty_id,
      room_id: row.room_id, day_id: row.day_id, time_slot_id: row.time_slot_id,
      class_type: row.class_type, status: row.status, notes: row.notes ?? '',
    });
    setIssues([]);
  }

  function update(patch: Partial<FormState>) {
    if (!modal) return;
    const next = { ...modal, ...patch };
    // keep derived values sane when switching lab/theory
    if (patch.class_type === 'theory') next.lab_group_id = '';
    if (patch.section_id || patch.class_type === 'lab') {
      const g = db!.labGroups.filter((x) => x.section_id === next.section_id);
      next.lab_group_id = next.class_type === 'lab' ? g[0]?.id ?? next.lab_group_id : '';
    }
    if (patch.semester_id) next.batch_id = '';
    setModal(next);
    void liveCheck(next);
  }

  function liveCheck(form: FormState) {
    if (!form.batch_id || !form.section_id || !form.course_id || !form.faculty_id || !form.room_id || !form.day_id || !form.time_slot_id) {
      setIssues([]);
      return;
    }
    if (form.class_type === 'lab' && !form.lab_group_id) return;
    const candidate: Partial<RoutineEntry> = {
      semester_id: form.semester_id, batch_id: form.batch_id, section_id: form.section_id,
      lab_group_id: form.class_type === 'lab' ? form.lab_group_id : null,
      course_id: form.course_id, faculty_id: form.faculty_id, room_id: form.room_id,
      day_id: form.day_id, time_slot_id: form.time_slot_id, class_type: form.class_type, status: form.status,
    };
    setIssues(checkConflicts(db!, candidate, form.id));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const m = modal!;
    const candidate: Partial<RoutineEntry> = {
      semester_id: m.semester_id, batch_id: m.batch_id, section_id: m.section_id,
      lab_group_id: m.class_type === 'lab' ? m.lab_group_id : null,
      course_id: m.course_id, faculty_id: m.faculty_id, room_id: m.room_id,
      day_id: m.day_id, time_slot_id: m.time_slot_id, class_type: m.class_type, status: m.status,
      notes: m.notes || null,
    };
    const found = checkConflicts(db!, candidate, m.id);
    if (found.length) {
      setIssues(found);
      toast.push('error', 'Schedule conflict detected — entry not saved.');
      return;
    }
    setBusy(true);
    const res = m.id ? await api.updateRoutineEntry(m.id, candidate) : await api.saveRoutineEntry(candidate);
    setBusy(false);
    if (!res.ok) {
      toast.push('error', res.error ?? 'Save failed');
      return;
    }
    toast.push('success', m.id ? 'Routine entry updated.' : 'Routine entry saved.');
    setModal(null);
    await refresh();
  }

  async function remove(row: RoutineEntry) {
    if (!window.confirm('Delete this routine entry?')) return;
    const res = await api.deleteRoutineEntry(row.id);
    toast.push(res.ok ? 'success' : 'error', res.ok ? 'Entry deleted.' : res.error ?? 'Delete failed');
    await refresh();
  }

  const semName = (id: string) => db.semesters.find((s) => s.id === id)?.name ?? id;

  return (
    <AdminShell>
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-44"><label className="label">Semester</label>
          <Select value={fSem} onChange={setFSem} options={db.semesters.map((s) => ({ value: s.id, label: s.name }))} placeholder="Active semester" /></div>
        <div className="w-44"><label className="label">Batch</label>
          <Select value={fBatch} onChange={setFBatch} options={db.batches.map((b) => ({ value: b.id, label: b.name }))} placeholder="All batches" /></div>
        <div className="w-44"><label className="label">Type</label>
          <Select value={fType} onChange={setFType} options={[{ value: 'theory', label: 'Theory' }, { value: 'lab', label: 'Laboratory' }]} placeholder="All types" /></div>
        <div className="min-w-[220px] flex-1"><label className="label">Search</label>
          <input className="input" placeholder="Course, faculty, room, batch…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="btn-primary" onClick={openAdd}><Icon name="plus" className="h-4 w-4" /> New entry</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
                <th className="table-th">Course</th>
                <th className="table-th">Batch · Section</th>
                <th className="table-th">Group / Type</th>
                <th className="table-th">Faculty</th>
                <th className="table-th">Room</th>
                <th className="table-th">Day</th>
                <th className="table-th">Time</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const course = db.courses.find((c) => c.id === e.course_id);
                const fac = db.faculty.find((f) => f.id === e.faculty_id);
                const room = db.rooms.find((r) => r.id === e.room_id);
                const batch = db.batches.find((b) => b.id === e.batch_id);
                const sec = db.sections.find((s) => s.id === e.section_id);
                const grp = db.labGroups.find((g) => g.id === e.lab_group_id);
                const day = db.classDays.find((d) => d.id === e.day_id);
                const slot = db.timeSlots.find((s) => s.id === e.time_slot_id);
                return (
                  <tr key={e.id} className={clsx('border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800/70 dark:hover:bg-slate-800/30', e.status !== 'active' && 'bg-red-50/40 dark:bg-red-950/10')}>
                    <td className="table-td"><span className="font-bold">{course?.code}</span><span className="block text-xs text-slate-400">{course?.title}</span></td>
                    <td className="table-td font-semibold">{batch?.name} · Sec {sec?.name}</td>
                    <td className="table-td">{grp ? <Badge tone="purple">Grp {grp.name}</Badge> : <Badge tone="green">Theory</Badge>}</td>
                    <td className="table-td">{fac?.name}<span className="block text-[11px] text-slate-400">{fac?.initials}</span></td>
                    <td className="table-td font-semibold">{room?.code}</td>
                    <td className="table-td">{day?.short_name}</td>
                    <td className="table-td text-xs">{slot?.start_time}–{slot?.end_time}</td>
                    <td className="table-td"><Badge tone={e.status === 'active' ? 'green' : e.status === 'cancelled' ? 'red' : 'amber'}>{e.status}</Badge></td>
                    <td className="table-td text-right">
                      <div className="inline-flex gap-1">
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" onClick={() => openEdit(e)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => remove(e)}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={9} className="table-td py-10 text-center text-slate-400">No routine entries match the filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] font-semibold text-slate-400 dark:border-slate-800">
          {rows.length} entries · {semName(fSem || activeSem?.id || '')} · every save is conflict-checked automatically
        </p>
      </div>

      {/* ---------- Add / edit modal ---------- */}
      <AdminModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit routine entry' : 'New routine entry'}
        subtitle="The scheduler blocks conflicts with faculty, rooms, sections and lab groups automatically."
      >
        {modal && (
          <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Class type">
              <Select value={modal.class_type} onChange={(v) => update({ class_type: v as any })} options={[{ value: 'theory', label: 'Theory (whole section)' }, { value: 'lab', label: 'Laboratory (group-specific)' }]} />
            </Field>
            <Field label="Semester">
              <Select value={modal.semester_id} onChange={(v) => update({ semester_id: v })} options={db.semesters.map((s) => ({ value: s.id, label: s.name }))} />
            </Field>
            <Field label="Batch">
              <Select value={modal.batch_id} onChange={(v) => update({ batch_id: v, section_id: '', lab_group_id: '' })} options={db.batches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select batch" />
            </Field>
            <Field label="Section">
              <Select value={modal.section_id} onChange={(v) => update({ section_id: v, lab_group_id: '' })} options={sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))} placeholder="Select section" />
            </Field>
            {isLab && (
              <Field label="Laboratory group">
                <Select value={modal.lab_group_id} onChange={(v) => update({ lab_group_id: v })} options={groups.map((g) => ({ value: g.id, label: `Group ${g.name}` }))} placeholder="Select group" />
              </Field>
            )}
            <Field label="Course">
              <Select value={modal.course_id} onChange={(v) => update({ course_id: v, class_type: v ? (() => { const c = db.courses.find((x) => x.id === v); if (!c) return modal.class_type; if (c.course_mode === 'lab') return 'lab'; if (c.course_mode === 'theory') return 'theory'; return modal.class_type; })() : modal.class_type })} options={courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))} placeholder="Select course" />
            </Field>
            <Field label="Faculty">
              <Select value={modal.faculty_id} onChange={(v) => update({ faculty_id: v })} options={faculty.map((f) => ({ value: f.id, label: `${f.name} (${f.initials}) — ${f.faculty_type}` }))} placeholder="Select faculty" />
            </Field>
            <Field label="Room">
              <Select value={modal.room_id} onChange={(v) => update({ room_id: v })} options={roomsForType.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))} placeholder="Select room" />
            </Field>
            <Field label="Day">
              <Select value={modal.day_id} onChange={(v) => update({ day_id: v })} options={db.classDays.filter((d) => d.is_active).map((d) => ({ value: d.id, label: d.name }))} placeholder="Select day" />
            </Field>
            <Field label="Time slot (1h 30m)">
              <Select value={modal.time_slot_id} onChange={(v) => update({ time_slot_id: v })} options={db.timeSlots.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.label }))} placeholder="Select slot" />
            </Field>
            <Field label="Status">
              <Select value={modal.status} onChange={(v) => update({ status: v as any })} options={[
                { value: 'active', label: 'Active (scheduled)' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'rescheduled', label: 'Rescheduled' },
              ]} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Special notes (optional)" hint="Shown in the class detail modal and on the PDF.">
                <input className="input" value={modal.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="e.g. Bring lab coat; session moved from AB-601…" />
              </Field>
            </div>

            {issues.length > 0 && (
              <div className="sm:col-span-2 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-red-700 dark:text-red-300">
                  <Icon name="alert" className="h-4 w-4" /> Conflict blocked — {conflictSummary(issues)}
                </p>
                <ul className="space-y-1.5">
                  {issues.map((i, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs font-medium text-red-700 dark:text-red-300">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" /> {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="sm:col-span-2">
              <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                <span className={clsx('h-2 w-2 rounded-full', issues.length ? 'bg-red-500' : 'bg-green-500')} />
                {issues.length ? 'Fix the conflicts above to save.' : 'No conflicts detected with current values.'}
              </div>
              <SaveBar busy={busy} label={modal.id ? 'Update entry' : 'Save entry'} />
            </div>
          </form>
        )}
      </AdminModal>
    </AdminShell>
  );
}
