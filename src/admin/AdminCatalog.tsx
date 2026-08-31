import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { AdminShell, AdminModal, Field, SaveBar, useRefresh } from './common';
import { Badge, Icon, useToast } from '../lib/ui';
import { api } from '../lib/db';
import type { Course, Faculty, Room, Batch, Announcement, Semester, ClassDay, TimeSlot, AppSettings } from '../lib/types';
import { useApp } from '../lib/store';

/* ============================================================
 * Admin catalog pages: Courses, Faculty, Rooms, Batches,
 * Semesters/Days/Slots, Announcements, Settings & colors.
 * ============================================================ */

const R = () => useRefresh();
const T = () => useToast();
const U = () => useApp((s) => s.setSettings);

/* ---------------- Courses ---------------- */

export function AdminCourses() {
  const { db, loading } = useData();
  const refresh = R();
  const toast = T();
  const [modal, setModal] = useState<Partial<Course> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading || !db) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api.upsertRow('courses', modal);
    setBusy(false);
    if (!res.ok) return toast.push('error', res.error ?? 'Save failed');
    toast.push('success', 'Course saved.');
    setModal(null);
    await refresh();
  };

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{db.courses.length} courses in the catalog · department-tagged colors drive the timetable legend.</p>
        <button className="btn-primary" onClick={() => setModal({ course_mode: 'theory', department: 'pharmacy', credit: 3, level: 1, is_active: true })}>
          <Icon name="plus" className="h-4 w-4" /> New course
        </button>
      </div>
      <div className="card overflow-x-auto scroll-thin">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
            <th className="table-th">Code</th><th className="table-th">Title</th><th className="table-th">Credit</th><th className="table-th">Mode</th>
            <th className="table-th">Department</th><th className="table-th">Level</th><th className="table-th">Active</th><th className="table-th text-right">Actions</th>
          </tr></thead>
          <tbody>
            {[...db.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 dark:border-slate-800/70">
                <td className="table-td font-extrabold">{c.code}</td>
                <td className="table-td">{c.title}</td>
                <td className="table-td">{c.credit}</td>
                <td className="table-td"><Badge tone={c.course_mode === 'lab' ? 'purple' : c.course_mode === 'theory_lab' ? 'blue' : 'green'}>{c.course_mode.replace('_', ' + ')}</Badge></td>
                <td className="table-td capitalize">{c.department}</td>
                <td className="table-td">L{c.level}</td>
                <td className="table-td">{c.is_active ? <Badge tone="green">yes</Badge> : <Badge tone="slate">no</Badge>}</td>
                <td className="table-td text-right">
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" onClick={() => setModal(c)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={async () => {
                    if (!confirm('Delete course?')) return;
                    await api.deleteRow('courses', c.id); toast.push('success', 'Course deleted.'); await refresh();
                  }}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminModal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? 'Edit course' : 'New course'}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <Field label="Course code"><input className="input" required value={modal?.code ?? ''} onChange={(e) => setModal((m) => ({ ...m!, code: e.target.value }))} placeholder="PHAR-2401" /></Field>
          <Field label="Credits"><input className="input" type="number" min={1} max={6} value={modal?.credit ?? 3} onChange={(e) => setModal((m) => ({ ...m!, credit: Number(e.target.value) }))} /></Field>
          <div className="col-span-2"><Field label="Title"><input className="input" required value={modal?.title ?? ''} onChange={(e) => setModal((m) => ({ ...m!, title: e.target.value }))} /></Field></div>
          <Field label="Mode">
            <select className="input" value={modal?.course_mode ?? 'theory'} onChange={(e) => setModal((m) => ({ ...m!, course_mode: e.target.value as any }))}>
              <option value="theory">Theory</option><option value="lab">Laboratory</option><option value="theory_lab">Theory + Lab</option>
            </select>
          </Field>
          <Field label="Department (color code)">
            <select className="input" value={modal?.department ?? 'pharmacy'} onChange={(e) => setModal((m) => ({ ...m!, department: e.target.value as any }))}>
              <option value="pharmacy">Pharmacy (theory green / lab purple)</option>
              <option value="ged">GED (blue)</option>
              <option value="nfe">NFE (amber)</option>
              <option value="agriculture">Agriculture (teal)</option>
            </select>
          </Field>
          <Field label="Curriculum level"><input className="input" type="number" min={1} max={8} value={modal?.level ?? 1} onChange={(e) => setModal((m) => ({ ...m!, level: Number(e.target.value) }))} /></Field>
          <Field label="Status"><select className="input" value={modal?.is_active ? '1' : '0'} onChange={(e) => setModal((m) => ({ ...m!, is_active: e.target.value === '1' }))}><option value="1">Active</option><option value="0">Inactive</option></select></Field>
          <div className="col-span-2"><SaveBar busy={busy} /></div>
        </form>
      </AdminModal>
    </AdminShell>
  );
}

/* ---------------- Faculty ---------------- */

export function AdminFaculty() {
  const { db, loading } = useData();
  const refresh = R();
  const toast = T();
  const [modal, setModal] = useState<Partial<Faculty> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading || !db) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api.upsertRow('faculty', modal);
    setBusy(false);
    if (!res.ok) return toast.push('error', res.error ?? 'Save failed');
    toast.push('success', 'Faculty saved.');
    setModal(null);
    await refresh();
  };

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{db.faculty.length} faculty · categories: regular, guest, GED, NFE, external — each gets its own color in the routine.</p>
        <button className="btn-primary" onClick={() => setModal({ faculty_type: 'regular', department: 'Pharmacy', is_active: true })}><Icon name="plus" className="h-4 w-4" /> New faculty</button>
      </div>
      <div className="card overflow-x-auto scroll-thin">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
            <th className="table-th">Name</th><th className="table-th">Initials</th><th className="table-th">Designation</th><th className="table-th">Category</th><th className="table-th">Department</th><th className="table-th text-right">Actions</th>
          </tr></thead>
          <tbody>
            {[...db.faculty].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 dark:border-slate-800/70">
                <td className="table-td font-bold">{f.name}</td>
                <td className="table-td"><Badge tone="slate">{f.initials}</Badge></td>
                <td className="table-td">{f.designation}</td>
                <td className="table-td capitalize"><Badge tone={f.faculty_type === 'guest' ? 'pink' : f.faculty_type === 'ged' ? 'blue' : f.faculty_type === 'nfe' ? 'amber' : f.faculty_type === 'external' ? 'teal' : 'green'}>{f.faculty_type}</Badge></td>
                <td className="table-td">{f.department}</td>
                <td className="table-td text-right">
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" onClick={() => setModal(f)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={async () => {
                    if (!confirm('Delete faculty?')) return;
                    const res = await api.deleteRow('faculty', f.id); toast.push(res.ok ? 'success' : 'error', res.ok ? 'Faculty deleted.' : (res.error ?? 'Failed')); await refresh();
                  }}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminModal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? 'Edit faculty' : 'New faculty'}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Full name"><input className="input" required value={modal?.name ?? ''} onChange={(e) => setModal((m) => ({ ...m!, name: e.target.value }))} /></Field></div>
          <Field label="Initials (shown on cards)"><input className="input" required maxLength={4} value={modal?.initials ?? ''} onChange={(e) => setModal((m) => ({ ...m!, initials: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Designation"><input className="input" value={modal?.designation ?? ''} onChange={(e) => setModal((m) => ({ ...m!, designation: e.target.value }))} /></Field>
          <Field label="Faculty category">
            <select className="input" value={modal?.faculty_type ?? 'regular'} onChange={(e) => setModal((m) => ({ ...m!, faculty_type: e.target.value as any }))}>
              <option value="regular">Regular (Pharmacy)</option><option value="guest">Guest</option><option value="ged">GED</option><option value="nfe">NFE</option><option value="external">External</option>
            </select>
          </Field>
          <Field label="Department"><input className="input" value={modal?.department ?? 'Pharmacy'} onChange={(e) => setModal((m) => ({ ...m!, department: e.target.value }))} /></Field>
          <Field label="Email"><input className="input" type="email" value={modal?.email ?? ''} onChange={(e) => setModal((m) => ({ ...m!, email: e.target.value }))} /></Field>
          <Field label="Contact number"><input className="input" value={modal?.phone ?? ''} onChange={(e) => setModal((m) => ({ ...m!, phone: e.target.value }))} placeholder="01XXXXXXXXX" /></Field>
          <div className="col-span-2"><SaveBar busy={busy} /></div>
        </form>
      </AdminModal>
    </AdminShell>
  );
}

/* ---------------- Rooms ---------------- */

export function AdminRooms() {
  const { db, loading } = useData();
  const refresh = R();
  const toast = T();
  const [modal, setModal] = useState<Partial<Room> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading || !db) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api.upsertRow('rooms', modal);
    setBusy(false);
    if (!res.ok) return toast.push('error', res.error ?? 'Save failed');
    toast.push('success', 'Room saved.');
    setModal(null);
    await refresh();
  };

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{db.rooms.length} rooms · theory rooms and laboratories are distinguished so the scheduler only offers matching rooms.</p>
        <button className="btn-primary" onClick={() => setModal({ room_type: 'theory', capacity: 60, is_active: true })}><Icon name="plus" className="h-4 w-4" /> New room</button>
      </div>
      <div className="card overflow-x-auto scroll-thin">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
            <th className="table-th">Code</th><th className="table-th">Name</th><th className="table-th">Building</th><th className="table-th">Type</th><th className="table-th">Capacity</th><th className="table-th text-right">Actions</th>
          </tr></thead>
          <tbody>
            {[...db.rooms].sort((a, b) => a.code.localeCompare(b.code)).map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 dark:border-slate-800/70">
                <td className="table-td font-extrabold">{r.code}</td>
                <td className="table-td">{r.name}</td>
                <td className="table-td">{r.building}</td>
                <td className="table-td"><Badge tone={r.room_type === 'lab' ? 'purple' : 'green'}>{r.room_type}</Badge></td>
                <td className="table-td">{r.capacity} seats</td>
                <td className="table-td text-right">
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" onClick={() => setModal(r)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={async () => {
                    if (!confirm('Delete room?')) return;
                    const res = await api.deleteRow('rooms', r.id); toast.push(res.ok ? 'success' : 'error', res.ok ? 'Room deleted.' : (res.error ?? 'Failed')); await refresh();
                  }}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminModal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? 'Edit room' : 'New room'}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <Field label="Room code"><input className="input" required value={modal?.code ?? ''} onChange={(e) => setModal((m) => ({ ...m!, code: e.target.value.toUpperCase() }))} placeholder="AB-403" /></Field>
          <Field label="Capacity"><input className="input" type="number" min={10} max={200} value={modal?.capacity ?? 60} onChange={(e) => setModal((m) => ({ ...m!, capacity: Number(e.target.value) }))} /></Field>
          <div className="col-span-2"><Field label="Room name"><input className="input" required value={modal?.name ?? ''} onChange={(e) => setModal((m) => ({ ...m!, name: e.target.value }))} /></Field></div>
          <Field label="Building"><input className="input" value={modal?.building ?? 'Academic Building B'} onChange={(e) => setModal((m) => ({ ...m!, building: e.target.value }))} /></Field>
          <Field label="Type">
            <select className="input" value={modal?.room_type ?? 'theory'} onChange={(e) => setModal((m) => ({ ...m!, room_type: e.target.value as any }))}>
              <option value="theory">Theory / classroom</option><option value="lab">Laboratory</option><option value="multipurpose">Multipurpose</option>
            </select>
          </Field>
          <div className="col-span-2"><SaveBar busy={busy} /></div>
        </form>
      </AdminModal>
    </AdminShell>
  );
}

/* ---------------- Batches & sections / lab groups ---------------- */

export function AdminBatches() {
  const { db, loading } = useData();
  const refresh = R();
  const toast = T();
  const navigate = useNavigate();
  const [modal, setModal] = useState<Partial<Batch> | null>(null);
  const [del, setDel] = useState<Batch | null>(null);   // batch pending deletion
  const [busy, setBusy] = useState(false);
  if (loading || !db) return null;

  const removeBatch = async () => {
    const b = del!;
    setBusy(true);
    try {
      const r = await api.deleteRow('batches', b.id);
      if (!r.ok) { toast.push('error', r.error ?? 'Delete failed'); return; }
      toast.push('success', `Batch ${b.batch_no} deleted — its sections, lab groups, off days and ${countFor(b)} class(es) were removed too.`);
    } finally {
      setBusy(false); setDel(null);
      await refresh();
    }
  };
  const countFor = (b: Batch) => db.routineEntries.filter((e) => e.batch_id === b.id).length;
  const nextBatchNo = () => (db.batches.length ? Math.max(...db.batches.map((b) => b.batch_no)) + 1 : 39);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const bn = Number(modal?.batch_no);
    // The modal shows the next free number even before the admin touches the field —
    // never send a payload without batch_no (Supabase: NULL → not-null violation).
    const batchNo = Number.isFinite(bn) && bn > 0 ? bn : nextBatchNo();
    if (!modal!.id && db.batches.some((b) => b.batch_no === batchNo)) {
      toast.push('error', `Batch ${batchNo} already exists — pick a different batch number.`);
      return; // keep the modal open so the admin can change the number
    }
    setBusy(true);
    try {
      const payload: Partial<Batch> = {
        ...modal,
        batch_no: batchNo,
        name: (modal?.name ?? '').trim() || `Batch ${batchNo}`,
        admission_year: modal?.admission_year ?? new Date().getFullYear() - 1,
        current_level: modal?.current_level ?? 1,
        is_active: modal?.is_active ?? true,
      };
      const res = await api.upsertRow('batches', payload);
      if (!res.ok) { toast.push('error', res.error ?? 'Save failed'); return; }
      // auto-create sections A/B + lab groups A1 A2 B1 B2 for brand-new batches
      if (!modal!.id && res.id && !db.sections.some((s) => s.batch_id === res.id)) {
        const secA = await api.upsertRow('sections', { name: 'A', batch_id: res.id });
        const secB = await api.upsertRow('sections', { name: 'B', batch_id: res.id });
        if (secA.ok && secB.ok) {
          await api.upsertRow('labGroups', { name: 'A1', section_id: secA.id! });
          await api.upsertRow('labGroups', { name: 'A2', section_id: secA.id! });
          await api.upsertRow('labGroups', { name: 'B1', section_id: secB.id! });
          await api.upsertRow('labGroups', { name: 'B2', section_id: secB.id! });
          toast.push('info', 'Default sections A/B and lab groups A1, A2, B1, B2 created.');
        }
      }
      toast.push('success', 'Batch saved. You can now schedule its routine & off days.');
    } finally {
      setBusy(false);
      setModal(null);
      await refresh();
    }
  };

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {db.batches.length} batches ({Math.min(...db.batches.map((b) => b.batch_no))}–{Math.max(...db.batches.map((b) => b.batch_no))}) · every batch carries its own level, class days, off days and routine.
          Batches are added <b className="text-slate-700 dark:text-slate-300">only here</b> — after saving, the batch appears automatically in the <b className="text-slate-700 dark:text-slate-300">Smart Routine Generator</b>'s batch list, where you pick any 8 (or any selection) to form a routine. Unlimited batches (1–999); only the selected ones contribute to each routine.
        </p>
        <button className="btn-primary" onClick={() => setModal({ batch_no: nextBatchNo(), admission_year: new Date().getFullYear() - 1, current_level: 1, name: `Batch ${nextBatchNo()}`, is_active: true })}><Icon name="plus" className="h-4 w-4" /> Add batch ({nextBatchNo()})</button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[...db.batches].sort((a, b) => b.batch_no - a.batch_no).map((b) => {
          const sections = db.sections.filter((s) => s.batch_id === b.id);
          const groups = db.labGroups.filter((g) => sections.some((s) => s.id === g.section_id));
          const entries = db.routineEntries.filter((e) => e.batch_id === b.id).length;
          const offs = db.batchOffDays.filter((o) => o.batch_id === b.id);
          const sem = db.semesters.find((s) => s.is_active);
          const offNames = offs.map((o) => db.classDays.find((d) => d.id === o.day_id)?.short_name).filter(Boolean);
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800 dark:text-slate-100">{b.name} {b.is_active ? <Badge tone="green">active</Badge> : <Badge tone="amber">inactive</Badge>}</p>
                  <p className="text-[11px] text-slate-400">Admitted {b.admission_year} · Level {b.current_level} · {sem?.name}</p>
                </div>
                <Badge tone="green">{entries} classes</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Icon name="users" className="h-3.5 w-3.5" /> Sections: {sections.map((s) => s.name).join(', ') || '—'}
                </p>
                <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Icon name="flask" className="h-3.5 w-3.5" /> Lab groups: {groups.map((g) => g.name).join(' · ') || '—'}
                </p>
                <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Icon name="clock" className="h-3.5 w-3.5" /> Off days: {offNames.length ? offNames.join(', ') : 'none'}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn-secondary flex-1 !py-1.5 text-xs" onClick={() => setModal(b)}><Icon name="edit" className="h-3 w-3" /> Edit</button>
                <button className="btn-secondary flex-1 !py-1.5 text-xs" onClick={() => navigate('/admin/offdays')} title="Configure this batch's weekly calendar"><Icon name="clock" className="h-3 w-3" /> Off days</button>
                <button className="btn-secondary flex-1 !py-1.5 text-xs" onClick={() => navigate('/admin/generator')} title="Generate this batch's routine"><Icon name="zap" className="h-3 w-3" /> Routine</button>
                <button className="rounded-lg border border-red-200/70 px-2.5 py-1.5 text-red-500 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/40" onClick={() => setDel(b)} title={`Delete Batch ${b.batch_no} and everything attached to it`}>
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
              {!b.is_active && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  Inactive — students can't select it. Delete it permanently if the batch has left the university.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <AdminModal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? 'Edit batch' : 'Add new batch'}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <Field label="Batch number (unlimited)"><input className="input" type="number" min={1} max={999} required value={modal?.batch_no ?? ''} onChange={(e) => setModal((m) => ({ ...m!, batch_no: Number(e.target.value) }))} /></Field>
          <Field label="Admission year"><input className="input" type="number" min={2018} max={2035} value={modal?.admission_year ?? new Date().getFullYear() - 1} onChange={(e) => setModal((m) => ({ ...m!, admission_year: Number(e.target.value) }))} /></Field>
          <Field label="Current curriculum level"><input className="input" type="number" min={1} max={8} value={modal?.current_level ?? 1} onChange={(e) => setModal((m) => ({ ...m!, current_level: Number(e.target.value) }))} /></Field>
          <Field label="Name"><input className="input" value={modal?.name ?? ''} onChange={(e) => setModal((m) => ({ ...m!, name: e.target.value }))} /></Field>
          <label className="col-span-2 flex items-center justify-between rounded-xl border border-slate-100 bg-white/60 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <span>
              <span className="block text-xs font-extrabold text-slate-700 dark:text-slate-200">Active batch</span>
              <span className="block text-[10px] text-slate-400">Inactive batches disappear from student selection &amp; the generator.</span>
            </span>
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={modal?.is_active ?? true} onChange={(e) => setModal((m) => ({ ...m!, is_active: e.target.checked }))} />
          </label>
          <div className="col-span-2">
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Any number 1–999 is allowed — batches are unlimited. Sections A & B plus lab groups A1, A2, B1, B2 are created automatically.
              Then add its courses in the Smart Routine Generator; only the batches you select there contribute to a routine.
            </p>
          </div>
          <div className="col-span-2"><SaveBar busy={busy} label="Create batch" /></div>
        </form>
      </AdminModal>
      {/* delete confirmation */}
      <AdminModal open={Boolean(del)} onClose={() => setDel(null)} title={`Delete ${del?.name}?`}>
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            This permanently removes <b>{del?.name}</b>{db.sections.filter((x) => x.batch_id === del?.id).map((x) => ` Section ${x.name}`).join(' & ')} and everything attached to it:
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <span className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300">{del ? countFor(del) : 0} routine class(es)</span>
            <span className="rounded-lg bg-slate-50 px-3 py-2 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{db.sections.filter((x) => x.batch_id === del?.id).length} section(s) · {db.labGroups.filter((g) => db.sections.some((x) => x.batch_id === del?.id && x.id === g.section_id)).length} lab group(s)</span>
            <span className="rounded-lg bg-slate-50 px-3 py-2 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{db.batchOffDays.filter((o) => o.batch_id === del?.id).length} off-day record(s)</span>
            <span className="rounded-lg bg-slate-50 px-3 py-2 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{db.routineEntries.filter((e) => e.batch_id === del?.id && (db.sections.find((x) => x.id === e.section_id))) .length} linked section rows</span>
          </div>
          <p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Courses and faculty records stay in the catalog (they may be used by other batches). If the batch has only left temporarily, keep it and just tick it inactive in Edit instead.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setDel(null)}>Keep batch</button>
            <button className="rounded-xl bg-gradient-to-br from-rose-500 to-red-600 px-4 py-2 text-xs font-extrabold text-white shadow-glow-blue" disabled={busy} onClick={() => void removeBatch()}>
              <Icon name="trash" className="h-3.5 w-3.5" /> {busy ? 'Deleting…' : `Delete ${del?.batch_no ?? ''} permanently`}
            </button>
          </div>
        </div>
      </AdminModal>
    </AdminShell>
  );
}

/* ---------------- Semesters / class days / time slots ---------------- */

export function AdminCatalog() {
  const { db, loading } = useData();
  const refresh = R();
  const toast = T();
  const [semModal, setSemModal] = useState<Partial<Semester> | null>(null);
  const [dayModal, setDayModal] = useState<Partial<ClassDay> | null>(null);
  const [slotModal, setSlotModal] = useState<Partial<TimeSlot> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading || !db) return null;

  const save = async (e: React.FormEvent, table: any, model: any, close: () => void) => {
    e.preventDefault();
    setBusy(true);
    const res = await api.upsertRow(table, model);
    setBusy(false);
    if (!res.ok) { toast.push('error', res.error ?? 'Save failed'); return; }
    toast.push('success', 'Saved.');
    close();
    await refresh();
  };

  return (
    <AdminShell>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* semesters */}
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Semesters</h3>
            <button className="btn-secondary !py-1 text-xs" onClick={() => setSemModal({ is_active: false })}><Icon name="plus" className="h-3 w-3" /> Add</button>
          </div>
          <div className="space-y-2">
            {db.semesters.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                <div>
                  <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{s.name} {s.is_active && <Badge tone="green">active</Badge>}</p>
                  <p className="text-[10px] text-slate-400">{s.code} · {s.start_date} → {s.end_date}</p>
                </div>
                <button className="rounded p-1 text-slate-400 hover:text-sky-600" onClick={() => setSemModal(s)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <AdminModal open={Boolean(semModal)} onClose={() => setSemModal(null)} title="Semester">
            <form onSubmit={(e) => save(e, 'semesters', semModal, () => setSemModal(null))} className="grid grid-cols-2 gap-4">
              <Field label="Name"><input className="input" required value={semModal?.name ?? ''} onChange={(e) => setSemModal((m) => ({ ...m!, name: e.target.value }))} placeholder="Spring 2027" /></Field>
              <Field label="Code"><input className="input" value={semModal?.code ?? ''} onChange={(e) => setSemModal((m) => ({ ...m!, code: e.target.value }))} placeholder="SP27" /></Field>
              <Field label="Start date"><input className="input" type="date" value={semModal?.start_date ?? ''} onChange={(e) => setSemModal((m) => ({ ...m!, start_date: e.target.value }))} /></Field>
              <Field label="End date"><input className="input" type="date" value={semModal?.end_date ?? ''} onChange={(e) => setSemModal((m) => ({ ...m!, end_date: e.target.value }))} /></Field>
              <div className="col-span-2"><SaveBar busy={busy} /></div>
            </form>
          </AdminModal>
        </section>

        {/* class days */}
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Class days</h3>
            <button className="btn-secondary !py-1 text-xs" onClick={() => setDayModal({ is_active: true })}><Icon name="plus" className="h-3 w-3" /> Add</button>
          </div>
          <p className="mb-2 text-[11px] text-slate-400">Days are shown dynamically per batch — never hard-coded.</p>
          <div className="space-y-2">
            {db.classDays.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{d.name} <span className="font-medium text-slate-400">({d.short_name})</span></p>
                <div className="flex items-center gap-1.5">
                  <Badge tone={d.is_active ? 'green' : 'slate'}>{d.is_active ? 'active' : 'off'}</Badge>
                  <button className="rounded p-1 text-slate-400 hover:text-sky-600" onClick={() => setDayModal(d)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <AdminModal open={Boolean(dayModal)} onClose={() => setDayModal(null)} title="Class day">
            <form onSubmit={(e) => save(e, 'classDays', dayModal, () => setDayModal(null))} className="grid grid-cols-2 gap-4">
              <Field label="Day name"><input className="input" required value={dayModal?.name ?? ''} onChange={(e) => setDayModal((m) => ({ ...m!, name: e.target.value }))} placeholder="Friday" /></Field>
              <Field label="Short name"><input className="input" required maxLength={3} value={dayModal?.short_name ?? ''} onChange={(e) => setDayModal((m) => ({ ...m!, short_name: e.target.value }))} placeholder="Fri" /></Field>
              <Field label="Order (1 = first)"><input className="input" type="number" min={1} max={10} value={dayModal?.sequence ?? 7} onChange={(e) => setDayModal((m) => ({ ...m!, sequence: Number(e.target.value) }))} /></Field>
              <Field label="Active"><select className="input" value={dayModal?.is_active ? '1' : '0'} onChange={(e) => setDayModal((m) => ({ ...m!, is_active: e.target.value === '1' }))}><option value="1">Yes</option><option value="0">No</option></select></Field>
              <div className="col-span-2"><SaveBar busy={busy} /></div>
            </form>
          </AdminModal>
        </section>

        {/* time slots */}
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Time slots</h3>
            <button className="btn-secondary !py-1 text-xs" onClick={() => setSlotModal({ is_active: true })}><Icon name="plus" className="h-3 w-3" /> Add</button>
          </div>
          <p className="mb-2 text-[11px] text-slate-400">Every class is 1h 30m · each slot has day-row + time-column behaviour.</p>
          <div className="space-y-2">
            {db.timeSlots.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{t.label}</p>
                <div className="flex items-center gap-1.5">
                  <Badge tone={t.is_active ? 'green' : 'slate'}>{t.is_active ? 'active' : 'off'}</Badge>
                  <button className="rounded p-1 text-slate-400 hover:text-sky-600" onClick={() => setSlotModal(t)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <AdminModal open={Boolean(slotModal)} onClose={() => setSlotModal(null)} title="Time slot">
            <form onSubmit={(e) => save(e, 'timeSlots', slotModal, () => setSlotModal(null))} className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Label"><input className="input" required value={slotModal?.label ?? ''} onChange={(e) => setSlotModal((m) => ({ ...m!, label: e.target.value }))} placeholder="10:00 AM – 11:30 AM" /></Field></div>
              <Field label="Start (HH:MM)"><input className="input" type="time" value={slotModal?.start_time ?? '10:00'} onChange={(e) => setSlotModal((m) => ({ ...m!, start_time: e.target.value }))} /></Field>
              <Field label="End (HH:MM)"><input className="input" type="time" value={slotModal?.end_time ?? '11:30'} onChange={(e) => setSlotModal((m) => ({ ...m!, end_time: e.target.value }))} /></Field>
              <div className="col-span-2"><SaveBar busy={busy} /></div>
            </form>
          </AdminModal>
        </section>
      </div>
    </AdminShell>
  );
}

/* ---------------- Announcements ---------------- */

export function AdminAnnouncements() {
  const { db, loading } = useData();
  const refresh = R();
  const toast = T();
  const [modal, setModal] = useState<Partial<Announcement> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading || !db) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api.saveAnnouncement(modal);
    setBusy(false);
    if (!res.ok) { toast.push('error', res.error ?? 'Save failed'); return; }
    toast.push('success', 'Announcement published.');
    setModal(null);
    await refresh();
  };

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">Published announcements appear on the homepage, bell menu and announcements page.</p>
        <button className="btn-primary" onClick={() => setModal({ category: 'notice', is_active: true, pinned: false })}><Icon name="plus" className="h-4 w-4" /> New announcement</button>
      </div>
      <div className="space-y-2.5">
        {db.announcements.map((a) => (
          <div key={a.id} className="card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-slate-800 dark:text-slate-100">
                {a.title} {a.pinned && <Badge tone="amber">pinned</Badge>} {a.batch_id && <Badge tone="green">{db.batches.find((b) => b.id === a.batch_id)?.name}</Badge>}
                {!a.is_active && <Badge tone="slate">hidden</Badge>}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{a.body}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">{a.created_by_name ?? 'Department'} · {new Date(a.created_at).toLocaleString()}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950" onClick={() => setModal(a)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={async () => {
                if (!confirm('Delete announcement?')) return;
                await api.deleteAnnouncement(a.id); toast.push('success', 'Deleted.'); await refresh();
              }}><Icon name="trash" className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <AdminModal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.id ? 'Edit announcement' : 'New announcement'}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Title"><input className="input" required value={modal?.title ?? ''} onChange={(e) => setModal((m) => ({ ...m!, title: e.target.value }))} /></Field></div>
          <div className="col-span-2"><Field label="Body"><textarea className="input min-h-[90px]" value={modal?.body ?? ''} onChange={(e) => setModal((m) => ({ ...m!, body: e.target.value }))} /></Field></div>
          <Field label="Category">
            <select className="input" value={modal?.category ?? 'notice'} onChange={(e) => setModal((m) => ({ ...m!, category: e.target.value as any }))}>
              <option value="notice">Notice</option><option value="routine">Routine update</option><option value="urgent">Urgent</option><option value="event">Event</option>
            </select>
          </Field>
          <Field label="Target batch (optional)">
            <select className="input" value={modal?.batch_id ?? ''} onChange={(e) => setModal((m) => ({ ...m!, batch_id: e.target.value || null }))}>
              <option value="">All batches</option>
              {db.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Pinned"><select className="input" value={modal?.pinned ? '1' : '0'} onChange={(e) => setModal((m) => ({ ...m!, pinned: e.target.value === '1' }))}><option value="1">Yes</option><option value="0">No</option></select></Field>
          <Field label="Visible"><select className="input" value={modal?.is_active ? '1' : '0'} onChange={(e) => setModal((m) => ({ ...m!, is_active: e.target.value === '1' }))}><option value="1">Published</option><option value="0">Hidden</option></select></Field>
          <div className="col-span-2"><SaveBar busy={busy} label="Publish" /></div>
        </form>
      </AdminModal>
    </AdminShell>
  );
}

/* ---------------- Settings & colors ---------------- */

export function AdminSettings() {
  const { db, loading } = useData();
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const resetSettings = useApp((s) => s.resetSettings);
  const toast = T();
  const [busy, setBusy] = useState(false);
  const [adv, setAdv] = useState<Record<string, Record<string, string>>>(() => {
    try {
      const row = db?.settings?.find((s) => s.key === 'batch_advisors');
      return row ? JSON.parse(row.value) : {};
    } catch { return {}; }
  });
  if (loading || !db) return null;

  const saveAdvisors = async () => {
    setBusy(true);
    const res = await api.saveSetting('batch_advisors', JSON.stringify(adv));
    setBusy(false);
    toast.push(res.ok ? 'success' : 'error', res.ok ? 'Batch advisors saved — shown on routine pages & exports.' : (res.error ?? 'Save failed'));
  };

  const COLORS: { key: keyof AppSettings['colors']; label: string }[] = [
    { key: 'theory', label: 'Theory (Pharmacy)' },
    { key: 'lab', label: 'Laboratory' },
    { key: 'guest', label: 'Guest Faculty' },
    { key: 'ged', label: 'GED' },
    { key: 'nfe', label: 'NFE' },
    { key: 'agriculture', label: 'Agriculture' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'rescheduled', label: 'Rescheduled' },
  ];

  const save = async () => {
    setBusy(true);
    const res = await api.saveSetting('app', JSON.stringify(settings));
    setBusy(false);
    if (!res.ok) { toast.push('error', res.error ?? 'Save failed'); return; }
    toast.push('success', 'Settings saved — the whole portal updates instantly.');
  };

  return (
    <AdminShell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-extrabold text-slate-800 dark:text-slate-100">Branding</h3>
          <div className="space-y-3">
            <Field label="University name"><input className="input" value={settings.universityName} onChange={(e) => setSettings({ universityName: e.target.value })} /></Field>
            <Field label="Department name"><input className="input" value={settings.departmentName} onChange={(e) => setSettings({ departmentName: e.target.value })} /></Field>
            <Field label="Tagline"><input className="input" value={settings.universityTagline} onChange={(e) => setSettings({ universityTagline: e.target.value })} /></Field>
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">Color system</h3>
          <p className="mb-3 text-[11px] text-slate-400">Used across timetable cards, legends, PDF export and admin. Changes apply immediately.</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {COLORS.map((c) => (
              <label key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{c.label}</span>
                <span className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md border border-slate-200 dark:border-slate-600" style={{ backgroundColor: settings.colors[c.key] }} />
                  <input type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={settings.colors[c.key]} onChange={(e) => setSettings({ colors: { [c.key]: e.target.value } } as any)} />
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">Batch advisors</h3>
          <p className="mb-3 text-[11px] text-slate-400">Official advisor of each batch section — shown on the routine page, class details, and PDF/PNG exports.</p>
          <div className="space-y-2">
            {db.batches.filter((b) => b.is_active).sort((a, c) => a.batch_no - c.batch_no).map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-100 bg-white/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                <span className="w-16 text-xs font-extrabold text-slate-700 dark:text-slate-200">{b.name}</span>
                {(['A', 'B'] as const).map((sec) => (
                  <label key={sec} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">{sec}</span>
                    <select
                      className="input !w-48 !py-1.5 text-xs"
                      value={adv[String(b.batch_no)]?.[sec] ?? ''}
                      onChange={(e) => setAdv((a) => ({ ...a, [String(b.batch_no)]: { ...(a[String(b.batch_no)] ?? {}), [sec]: e.target.value } }))}
                    >
                      <option value="">— none —</option>
                      {db.faculty.filter((f) => f.is_active).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-secondary !py-1.5 text-xs" onClick={saveAdvisors} disabled={busy}><Icon name="check" className="h-3.5 w-3.5" /> Save advisors</button>
          </div>
        </section>
      </div>

      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-xs text-slate-400">Settings persist in the <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">settings</code> table (key <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">app</code>).</p>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => { resetSettings(); toast.push('info', 'Defaults restored — save to persist.'); }}>Restore defaults</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="check" className="h-4 w-4" />} Save settings
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
