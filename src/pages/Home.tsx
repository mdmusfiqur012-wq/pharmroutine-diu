import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { Icon, Logo, Badge, type IconName, useToast } from '../lib/ui';
import { batchStats } from '../lib/routine';
import { isSupabaseMode } from '../lib/db';
import clsx from 'clsx';

const QUICK: { to: string; icon: IconName; title: string; desc: string; tone: string }[] = [
  { to: '/routine', icon: 'calendar', title: 'My Routine', desc: 'Generate your personalized weekly timetable by batch, section & lab group.', tone: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
  { to: '/faculty', icon: 'users', title: 'Faculty Routine', desc: 'Browse any faculty member’s complete teaching schedule.', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400' },
  { to: '/rooms', icon: 'door', title: 'Room Schedule', desc: 'Check room occupancy or availability for any day & slot.', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400' },
  { to: '/lab', icon: 'flask', title: 'Laboratory Routine', desc: 'Lab sessions per section with groups A1, A2, B1, B2.', tone: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400' },
  { to: '/search', icon: 'search', title: 'Search Routine', desc: 'Find any class by course, faculty or room in seconds.', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  { to: '/announcements', icon: 'bell', title: 'Announcements', desc: 'Routine changes, notices, guest lectures & events.', tone: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400' },
];

export default function Home() {
  const { db, loading } = useData();
  const { settings } = useApp();
  const navigate = useNavigate();

  const activeSemester = useMemo(() => db?.semesters.find((s) => s.is_active) ?? db?.semesters[0], [db]);
  const announcements = useMemo(
    () => (db ? db.announcements.filter((a) => a.is_active).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)).slice(0, 4) : []),
    [db],
  );
  const batches = useMemo(() => (db ? [...db.batches].sort((a, b) => a.batch_no - b.batch_no) : []), [db]);
  const rooms = useMemo(() => (db ? db.rooms.filter((r) => r.is_active) : []), [db]);
  const faculty = useMemo(() => (db ? db.faculty.filter((f) => f.is_active) : []), [db]);

  const totalClasses = db?.routineEntries.length ?? 0;
  const theoryCount = db?.routineEntries.filter((e) => e.class_type === 'theory').length ?? 0;
  const labCount = totalClasses - theoryCount;

  return (
    <div className="animate-fade-in space-y-8">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-emerald-800 p-6 text-white shadow-lg sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-32 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <Badge tone="amber">Fall 2026 · Batches 29 – 38</Badge>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-4xl">
              Class & Laboratory Routine Portal
            </h1>
            <p className="mt-2 text-sm font-medium text-white/85 sm:text-base">
              {settings.universityName} · {settings.departmentName}. Every batch has its own class days, off days
              and weekly structure — the routine is generated dynamically for your semester, batch, section and lab group.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link to="/routine" className="btn bg-white text-brand-800 shadow hover:bg-brand-50">
                <Icon name="calendar" /> Generate My Routine
              </Link>
              <Link to="/faculty" className="btn border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20">
                <Icon name="users" /> Faculty Routine
              </Link>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
            <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-md ring-1 ring-black/5 dark:ring-white/10">
                  <Logo size={48} />
                </div>
                <div>
                  <p className="text-sm font-extrabold">{settings.departmentName}</p>
                  <p className="text-[11px] text-white/75">{activeSemester?.name ?? '—'} · Dynamic weekly scheduler</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                {[
                  ['Classes', totalClasses],
                  ['Theory', theoryCount],
                  ['Labs', labCount],
                  ['Batches', batches.length],
                ].map(([label, v]) => (
                  <div key={label as string} className="rounded-xl bg-white/10 px-3 py-2.5">
                    <p className="text-xl font-extrabold">{v}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Quick access ---------- */}
      <section>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-400">Quick access</h2>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK.map((q) => (
            <button
              key={q.to}
              onClick={() => navigate(q.to)}
              className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start gap-3.5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${q.tone}`}>
                  <Icon name={q.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {q.title}
                    <Icon name="chevronRight" className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{q.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Batches & off days ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-400">Batch-specific schedules · {activeSemester?.name}</h2>
          <span className="text-[11px] font-semibold text-slate-400">Each batch has independent class days & off days</span>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/40">
                  <th className="table-th">Batch</th>
                  <th className="table-th">Level</th>
                  <th className="table-th">Sections</th>
                  <th className="table-th">Lab groups</th>
                  <th className="table-th">Class days</th>
                  <th className="table-th">Off days</th>
                  <th className="table-th">Classes</th>
                  <th className="table-th">Courses</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const s = activeSemester ? batchStats(db!, activeSemester.id, b.id) : { classes: 0, days: 0, courses: 0, faculty: 0 };
                  const offs = db!.batchOffDays.filter((o) => o.semester_id === activeSemester?.id && o.batch_id === b.id);
                  const offNames = offs.map((o) => db!.classDays.find((d) => d.id === o.day_id)?.short_name).filter(Boolean);
                  const actDays = db!.classDays.filter((d) => d.is_active && !offs.some((o) => o.day_id === d.id)).sort((a, c) => a.sequence - c.sequence);
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800/70 dark:hover:bg-slate-800/30">
                      <td className="table-td">
                        <Link to={`/routine`} className="font-extrabold text-brand-700 hover:underline dark:text-brand-400">{b.name}</Link>
                      </td>
                      <td className="table-td"><Badge tone="slate">Level {b.current_level}</Badge></td>
                      <td className="table-td font-semibold">A, B</td>
                      <td className="table-td text-slate-500">A1 · A2 · B1 · B2</td>
                      <td className="table-td">
                        <span className="flex flex-wrap gap-1">
                          {actDays.map((d) => <span key={d.id} className="chip bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">{d.short_name}</span>)}
                        </span>
                      </td>
                      <td className="table-td">
                        {offNames.length ? (
                          <span className="flex flex-wrap gap-1">
                            {offNames.map((n) => <span key={n} className="chip bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">{n}</span>)}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="table-td font-extrabold text-slate-700 dark:text-slate-200">{s.classes}</td>
                      <td className="table-td text-slate-500">{s.courses}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------- Announcements ---------- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-400">Latest announcements</h2>
            <Link to="/announcements" className="text-xs font-bold text-brand-700 hover:underline dark:text-brand-400">View all →</Link>
          </div>
          <div className="space-y-2.5">
            {announcements.map((a) => (
              <Link to="/announcements" key={a.id} className="card flex items-start gap-3 p-3.5 transition-all hover:shadow-card-hover">
                <span className={clsx(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  a.category === 'urgent' && 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400',
                  a.category === 'event' && 'bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400',
                  a.category === 'routine' && 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400',
                  !['urgent', 'event', 'routine'].includes(a.category) && 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
                )}>
                  <Icon name={a.category === 'urgent' ? 'alert' : a.category === 'event' ? 'award' : a.category === 'routine' ? 'calendar' : 'bell'} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {a.title}
                    {a.pinned && <Badge tone="amber">Pinned</Badge>}
                    {a.batch_id && <Badge tone="green">{db?.batches.find((b) => b.id === a.batch_id)?.name}</Badge>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{a.body}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    {a.created_by_name ?? 'Department'} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </Link>
            ))}
            {!announcements.length && <p className="card p-6 text-center text-sm text-slate-400">No announcements yet.</p>}
          </div>
        </div>

        {/* catalog sidecard */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-400">Department catalog</h2>
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {[
              { label: 'Faculty members', v: faculty.length, icon: 'users' as IconName, tone: 'text-violet-600 dark:text-violet-400' },
              { label: 'Classrooms & labs', v: rooms.length, icon: 'door' as IconName, tone: 'text-sky-600 dark:text-sky-400' },
              { label: 'Courses', v: db?.courses.length ?? 0, icon: 'book' as IconName, tone: 'text-green-600 dark:text-green-400' },
              { label: 'Theory sessions / week', v: theoryCount, icon: 'grid' as IconName, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Lab sessions / week', v: labCount, icon: 'flask' as IconName, tone: 'text-pink-600 dark:text-pink-400' },
              { label: 'Announcements', v: db?.announcements.filter((a) => a.is_active).length ?? 0, icon: 'bell' as IconName, tone: 'text-teal-600 dark:text-teal-400' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <Icon name={r.icon} className={`h-4 w-4 ${r.tone}`} /> {r.label}
                </span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{loading ? '…' : r.v}</span>
              </div>
            ))}
          </div>
          <div className="card mt-3 flex items-start gap-3 p-4">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <span className="font-bold text-slate-600 dark:text-slate-300">Dynamic by design — </span>
              new semesters, batches, sections, lab groups, rooms, faculty and off-day calendars can be added from the
              admin dashboard without any code change.{isSupabaseMode ? '' : ' Currently running on the bundled demo dataset.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
