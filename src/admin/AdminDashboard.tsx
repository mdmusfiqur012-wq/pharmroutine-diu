import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { AdminShell } from './common';
import { Badge, EmptyState, Icon, StatCard } from '../lib/ui';
import { useApp } from '../lib/store';
import clsx from 'clsx';

export default function AdminDashboard() {
  const { db, loading, online } = useData();
  const user = useApp((s) => s.user);

  if (loading) return <AdminShell><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div></AdminShell>;
  if (!db) return <AdminShell><EmptyState icon="alert" title="No data" /></AdminShell>;

  const activeSem = db.semesters.find((s) => s.is_active) ?? db.semesters[0];
  const entries = db.routineEntries;
  const theory = entries.filter((e) => e.class_type === 'theory').length;
  const labs = entries.length - theory;
  const cancelled = entries.filter((e) => e.status === 'cancelled').length;
  const offDays = db.batchOffDays.length;
  const activeBatches = db.batches.filter((b) => b.is_active).length;
  const activeFaculty = db.faculty.filter((f) => f.is_active).length;
  const activeRooms = db.rooms.filter((r) => r.is_active).length;

  const recent = [...entries].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, 8);

  return (
    <AdminShell>
      <div className="mb-4 flex items-center gap-2 text-xs font-bold">
        <span className={clsx('chip', online ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', online ? 'bg-green-500' : 'bg-amber-500')} />
          {online ? 'Supabase connected' : 'Demo dataset (local)'}
        </span>
        <Badge tone="slate">Signed in as {user?.full_name}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard icon="calendar" label="Routine entries" value={entries.length} tone="green" />
        <StatCard icon="book" label="Theory sessions" value={theory} tone="blue" />
        <StatCard icon="flask" label="Lab sessions" value={labs} tone="purple" />
        <StatCard icon="alert" label="Cancelled / moved" value={cancelled} tone="amber" />
        <StatCard icon="award" label="Active batches" value={activeBatches} tone="teal" />
        <StatCard icon="users" label="Faculty" value={activeFaculty} tone="pink" />
        <StatCard icon="door" label="Rooms & labs" value={activeRooms} tone="slate" />
        <StatCard icon="clock" label="Batch off-day records" value={offDays} tone="amber" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-extrabold text-slate-800 dark:text-slate-100">Latest routine changes · {activeSem?.name}</h3>
          <div className="space-y-2">
            {recent.map((e) => {
              const batch = db.batches.find((b) => b.id === e.batch_id);
              const course = db.courses.find((c) => c.id === e.course_id);
              const day = db.classDays.find((d) => d.id === e.day_id);
              const slot = db.timeSlots.find((s) => s.id === e.time_slot_id);
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{course?.title ?? e.course_id}</p>
                    <p className="text-[11px] text-slate-400">{batch?.name} · {day?.short_name} {slot?.start_time} · {course?.code}</p>
                  </div>
                  <Badge tone={e.status === 'active' ? 'green' : e.status === 'cancelled' ? 'red' : 'amber'}>{e.status}</Badge>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">Conflict protection</h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Every new routine entry is validated against <span className="font-bold text-slate-700 dark:text-slate-200">four hard rules</span> before saving:
              faculty double-booking, room double-booking, section overlap and laboratory-group overlap. Conflicting entries are blocked with an explanation.
              Also enforced server-side by a PostgreSQL trigger + RLS in Supabase mode.
            </p>
          </div>
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">Quick actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/admin/routines" className="btn-secondary !justify-start text-xs"><Icon name="plus" /> Add routine entry</Link>
              <Link to="/admin/offdays" className="btn-secondary !justify-start text-xs"><Icon name="clock" /> Configure off days</Link>
              <Link to="/admin/batches" className="btn-secondary !justify-start text-xs"><Icon name="award" /> Add new batch</Link>
              <Link to="/admin/settings" className="btn-secondary !justify-start text-xs"><Icon name="settings" /> Colors & branding</Link>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
