import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Tilt3D from '../components/Tilt3D';
import { useData } from '../lib/data';
import { useApp } from '../lib/store';
import { Icon, Logo, Badge, StatCard, type IconName } from '../lib/ui';
import { batchStats, getAdvisorMap } from '../lib/routine';
import { isSupabaseMode } from '../lib/db';
import clsx from 'clsx';

const QUICK: { to: string; icon: IconName; title: string; desc: string }[] = [
  { to: '/routine', icon: 'calendar', title: 'My Routine', desc: 'Generate your personalized weekly timetable by batch, section & lab group.' },
  { to: '/faculty', icon: 'users', title: 'Faculty Routine', desc: 'Browse any faculty member’s complete teaching schedule.' },
  { to: '/rooms', icon: 'door', title: 'Batch Schedule', desc: 'Day-by-day batch schedule and room occupancy for any slot.' },
  { to: '/lab', icon: 'flask', title: 'Laboratory Routine', desc: 'Lab sessions per section with groups A1, A2, B1, B2.' },
  { to: '/search', icon: 'search', title: 'Search Routine', desc: 'Find any class by course, faculty or room in seconds.' },
  { to: '/announcements', icon: 'bell', title: 'Announcements', desc: 'Routine changes, notices, guest lectures & events.' },
];

/* small standalone timetable cell used inside the hero mockup */
function MiniCell({ type, title, sub, wide = false }: { type: 'theory' | 'lab' | 'special'; title: string; sub: string; wide?: boolean }) {
  const span = wide ? 'col-span-2' : '';
  if (type === 'theory')
    return (
      <div className={clsx('rounded-lg border border-brand-200/80 bg-gradient-to-br from-brand-50/95 to-brand-100/80 px-2 py-1.5 shadow-[0_2px_8px_-2px_rgb(37_99_235_/_0.25)]', span)}>
        <p className="truncate text-[9px] font-extrabold leading-tight text-brand-800">{title}</p>
        <p className="truncate text-[8px] font-semibold text-brand-500">{sub}</p>
      </div>
    );
  if (type === 'lab')
    return (
      <div className={clsx('rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 to-emerald-100/80 px-2 py-1.5 shadow-[0_2px_8px_-2px_rgb(22_163_74_/_0.25)]', span)}>
        <p className="truncate text-[9px] font-extrabold leading-tight text-emerald-800">{title}</p>
        <p className="truncate text-[8px] font-semibold text-emerald-600">{sub}</p>
      </div>
    );
  return (
    <div className={clsx('rounded-lg border border-violet-200/80 bg-gradient-to-br from-violet-50/95 to-fuchsia-100/80 px-2 py-1.5 shadow-[0_2px_8px_-2px_rgb(139_92_246_/_0.25)]', wide && 'col-span-2')}>
      <p className="truncate text-[9px] font-extrabold leading-tight text-violet-800">{title}</p>
      <p className="truncate text-[8px] font-semibold text-violet-500">{sub}</p>
    </div>
  );
}

/* floating 3D mini-timetable with cursor parallax */
type MockCell = { t: 'theory' | 'lab' | 'special'; code: string; sub: string; wide?: boolean };
const MOCK_ROWS: { day: string; cells: MockCell[] }[] = [
  { day: 'SAT', cells: [{ t: 'theory', code: '0931-1103', sub: 'Pharm. Bot.' }, { t: 'lab', code: '0531-1101', sub: 'Pharm. Chem. Lab', wide: true }] },
  { day: 'SUN', cells: [{ t: 'lab', code: '0531-1103', sub: 'Botany Lab' }, { t: 'theory', code: '0512-1102', sub: 'Anatomy', wide: true }, { t: 'special', code: '0222-113', sub: 'AoL' }] },
  { day: 'MON', cells: [{ t: 'theory', code: '0511-1101', sub: 'Pharm. Micro', wide: true }, { t: 'lab', code: '0512-1104', sub: 'Biochem Lab' }, { t: 'theory', code: '0513-1105', sub: 'Physiology' }] },
  { day: 'TUE', cells: [{ t: 'special', code: '0916-1103', sub: 'GED' }, { t: 'theory', code: '0531-1102', sub: 'Pharm. Chem', wide: true }, { t: 'lab', code: '0511-1106', sub: 'Micro Lab' }] },
];

function HeroTimetable() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0 });
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setT({ x: x * 14, y: y * -10 });
  };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setT({ x: 0, y: 0 })} className="relative animate-float-slow">
      {/* glow behind */}
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-500/30 via-sky-400/20 to-emerald-500/30 blur-2xl" />
      <div
        className="card relative !bg-white/85 p-4 transition-transform duration-300 ease-out will-change-transform dark:!bg-slate-900/85"
        style={{ transform: `perspective(1100px) rotateY(${t.x}deg) rotateX(${t.y}deg) translateZ(0)` }}
      >
        {/* header */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grad-icon-tile flex h-8 w-8 items-center justify-center rounded-xl"><Icon name="calendar" className="h-4 w-4" /></span>
            <div>
              <p className="text-[11px] font-extrabold text-slate-900 dark:text-white">Weekly Timetable</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Batch 33 · B · A1</p>
            </div>
          </div>
          <span className="chip px-2 py-0.5 text-[9px] font-bold text-white shadow-glow-blue" style={{ backgroundImage: 'var(--grad-diu)' }}>Fall 2026</span>
        </div>
        {/* grid: day rows × slot columns */}
        <div className="space-y-1.5">
          {MOCK_ROWS.map((row) => (
            <div key={row.day} className="flex items-center gap-1.5">
              <span className="w-9 shrink-0 text-right text-[8px] font-extrabold uppercase tracking-wider text-slate-400">{row.day}</span>
              <div className="grid flex-1 grid-cols-4 gap-1.5">
                {row.cells.map((c) => (
                  <MiniCell key={c.code + c.sub} type={c.t} title={c.code} sub={c.sub} wide={c.wide} />
                ))}
                {row.cells.length === 2 && (
                  <MiniCell type="theory" title="—" sub="Free" />
                )}
              </div>
            </div>
          ))}
        </div>
        {/* legend */}
        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <span className="flex items-center gap-1 text-[8px] font-bold text-slate-500"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Theory</span>
          <span className="flex items-center gap-1 text-[8px] font-bold text-slate-500"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Laboratory</span>
          <span className="flex items-center gap-1 text-[8px] font-bold text-slate-500"><span className="h-2 w-2 rounded-sm bg-violet-400" /> Special</span>
          <span className="ml-auto text-[8px] font-bold text-slate-400">6 × 1h 30m</span>
        </div>
      </div>
      {/* floating satellite chips */}
      <div className="glass-strong absolute -left-6 top-10 hidden animate-float items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold text-brand-800 shadow-float dark:text-brand-300 sm:flex" style={{ animationDelay: '0.8s' }}>
        <Icon name="clock" className="h-3.5 w-3.5" /> 8:00 AM
      </div>
      <div className="glass-strong absolute -right-5 bottom-14 hidden animate-float items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold text-emerald-700 shadow-float dark:text-emerald-300 sm:flex" style={{ animationDelay: '1.6s' }}>
        <Icon name="flask" className="h-3.5 w-3.5" /> Lab: A1
      </div>
    </div>
  );
}

export default function Home() {
  const { db, loading } = useData();
  const { settings } = useApp();
  const navigate = useNavigate();

  const activeSemester = useMemo(() => db?.semesters.find((s) => s.is_active) ?? db?.semesters[0], [db]);
  const announcements = useMemo(
    () => (db ? db.announcements.filter((a) => a.is_active).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)).slice(0, 4) : []),
    [db],
  );
  const batches = useMemo(() => (db ? db.batches.filter((b) => b.is_active).sort((a, b) => a.batch_no - b.batch_no) : []), [db]);
  const rooms = useMemo(() => (db ? db.rooms.filter((r) => r.is_active) : []), [db]);
  const faculty = useMemo(() => (db ? db.faculty.filter((f) => f.is_active) : []), [db]);

  const totalClasses = db?.routineEntries.length ?? 0;
  const theoryCount = db?.routineEntries.filter((e) => e.class_type === 'theory').length ?? 0;
  const labCount = totalClasses - theoryCount;

  /* today's classes across all batches — derived from the live data */
  const today = useMemo(() => {
    if (!db) return { name: '', count: 0 };
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
    const day = db.classDays.find((d) => d.name === dayName);
    if (!day) return { name: dayName, count: 0 };
    const count = db.routineEntries.filter((e) => e.day_id === day.id).length;
    return { name: dayName, count };
  }, [db]);

  return (
    <div className="space-y-8">
      {/* ---------- Hero ---------- */}
      <section className="card relative overflow-hidden !rounded-3xl p-6 sm:p-10">
        {/* ambient decor */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-400/15 blur-3xl" />
          <div className="absolute -right-20 top-10 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl" />
          <svg className="absolute -right-8 top-6 h-40 w-40 text-brand-500/10 animate-float" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M10 2v6.5L4.3 18a2 2 0 0 0 1.8 3h11.8a2 2 0 0 0 1.8-3L14 8.5V2M8.5 2h7" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
          <svg className="absolute bottom-4 left-6 h-24 w-24 text-emerald-500/15 animate-float-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <circle cx="12" cy="12" r="1.8" /><path d="M20.2 8.9c-1.6-3-5-4.6-8.2-4.6s-6.6 1.6-8.2 4.6C2.2 11.9 5.4 14.6 12 17c6.6-2.4 9.8-5.1 8.2-8.1zM20.2 8.9C18.5 8.4 15.7 9.5 12 12s-6.5 3.6-8.2 3.1M20.2 15.1c-1.7.5-4.5-.6-8.2-3.1S5.5 8.4 3.8 8.9" />
          </svg>
          <svg className="absolute bottom-20 right-1/3 h-16 w-16 text-brand-600/10 animate-orbit" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-40 12 12)" />
          </svg>
        </div>

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-800 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/70 dark:text-brand-300">
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ backgroundImage: 'var(--grad-diu)' }}>
                <Logo size={11} className="!h-3 !w-3 !object-contain" />
              </span>
              Fall 2026 · Batches 29 – 36
            </span>
            <h1 className="mt-4 text-3xl font-black leading-[1.1] tracking-tight sm:text-5xl">
              <span className="gradient-text">PharmRoutine DIU</span>
            </h1>
            <p className="mt-2 text-lg font-bold text-slate-700 dark:text-slate-200 sm:text-xl">
              Smart Class &amp; Laboratory Routine Portal <span className="font-semibold text-slate-400">for Pharmacy Students</span>
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Your semester, batch, section and lab group — one tap away. {settings.departmentName}, {settings.universityName}.
              Every batch has its own class days and off days; the timetable is generated dynamically, never hard-coded.
            </p>

            {/* credit banner */}
            <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-white/80 bg-gradient-to-r from-brand-50/90 via-white/80 to-emerald-50/90 px-4 py-2.5 shadow-sm backdrop-blur dark:border-slate-700 dark:from-brand-950/70 dark:via-slate-900/70 dark:to-emerald-950/70">
              <span className="grad-icon-tile flex h-9 w-9 items-center justify-center rounded-xl">
                <Icon name="award" className="h-4 w-4" />
              </span>
              <span className="text-sm">
                <span className="block font-extrabold text-slate-900 dark:text-white">Prepared by Md Musfiqur Rahaman</span>
                <span className="block text-[10px] font-bold uppercase tracking-widest" style={{ backgroundImage: 'var(--grad-diu-text)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  Research &amp; Academic Affairs Secretary
                </span>
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/routine" className="btn-primary btn-shine !px-5 !py-2.5">
                <Icon name="calendar" /> Generate My Routine
              </Link>
              <Link to="/lab" className="btn-secondary btn-shine !px-5 !py-2.5">
                <Icon name="flask" /> Laboratory Routine
              </Link>
            </div>
          </div>

          <div className="hidden sm:block">
            <HeroTimetable />
          </div>
        </div>
      </section>

      {/* ---------- Live dashboard cards ---------- */}
      <section className="stagger grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon="calendar" tone="blue" label="Weekly classes" value={loading ? '…' : totalClasses} />
        <StatCard icon="book" tone="green" label="Theory / week" value={loading ? '…' : theoryCount} />
        <StatCard icon="flask" tone="teal" label="Labs / week" value={loading ? '…' : labCount} />
        <StatCard icon="users" tone="purple" label="Faculty" value={loading ? '…' : faculty.length} />
        <StatCard icon="door" tone="amber" label="Rooms & labs" value={loading ? '…' : rooms.length} />
        <StatCard icon="clock" tone="pink" label={today.name || 'Today'} value={loading ? '…' : `${today.count} classes`} />
      </section>

      {/* ---------- Quick access ---------- */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded-full" style={{ backgroundImage: 'var(--grad-diu)' }} />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quick access</h2>
        </div>
        <div className="stagger grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK.map((q) => (
            <Tilt3D key={q.to} className="anim-rise h-full" style={{ '--d': `${QUICK.indexOf(q) * 60}ms` } as CSSProperties} max={8} scale={1.015} lift={7}>
            <button
              onClick={() => navigate(q.to)}
              className="card card-3d group h-full w-full p-4 text-left"
            >
              <div className="flex items-start gap-3.5">
                <span className="grad-icon-tile icon-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                  <Icon name={q.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {q.title}
                    <Icon name="chevronRight" className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{q.desc}</p>
                </div>
              </div>
            </button>
            </Tilt3D>
          ))}
        </div>
      </section>

      {/* ---------- Batches & off days ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full" style={{ backgroundImage: 'var(--grad-diu)' }} />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Batch-specific schedules · {activeSemester?.name}</h2>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">Each batch has independent class days & off days</span>
        </div>
        <div className="card overflow-hidden !p-0">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-gradient-to-r from-brand-50/80 via-white/60 to-emerald-50/80 dark:border-slate-800 dark:from-brand-950/50 dark:via-slate-900/40 dark:to-emerald-950/50">
                  <th className="table-th">Batch</th>
                  <th className="table-th">Level</th>
                  <th className="table-th">Sections</th>
                  <th className="table-th">Lab groups</th>
                  <th className="table-th">Class days</th>
                  <th className="table-th">Off days</th>
                  <th className="table-th">Batch Advisor</th>
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
                    <tr key={b.id} className="border-b border-slate-100/80 last:border-0 transition-colors hover:bg-brand-50/40 dark:border-slate-800/70 dark:hover:bg-slate-800/30">
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
                      <td className="table-td">
                        <span className="flex flex-col gap-1">
                          {(['A', 'B'] as const).map((sec) => {
                            const fid = getAdvisorMap(db)[String(b.batch_no)]?.[sec];
                            const fac = fid ? db?.faculty.find((f) => f.id === fid) : undefined;
                            return fac
                              ? <span key={sec} className="chip !bg-brand-50 !text-brand-800 ring-1 ring-brand-100 dark:!bg-brand-950/60 dark:!text-brand-300 dark:ring-slate-700"><span className="font-extrabold">{sec}:</span> {fac.name}</span>
                              : <span key={sec} className="text-[10px] text-slate-300">—</span>;
                          })}
                        </span>
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

      {/* ---------- Announcements + catalog ---------- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-4 w-1 rounded-full" style={{ backgroundImage: 'var(--grad-diu)' }} />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Latest announcements</h2>
            <Link to="/announcements" className="ml-auto text-xs font-bold text-brand-700 hover:underline dark:text-brand-400">View all →</Link>
          </div>
          <div className="space-y-2.5">
            {announcements.map((a) => (
              <Link to="/announcements" key={a.id} className="card flex items-start gap-3 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glass-hover">
                <span className={clsx(
                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
                  a.category === 'urgent' && 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-glow-blue',
                  a.category === 'event' && 'bg-gradient-to-br from-pink-500 to-rose-500 text-white',
                  a.category === 'routine' && 'grad-icon-tile',
                  !['urgent', 'event', 'routine'].includes(a.category) && 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-glow-blue',
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

        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-4 w-1 rounded-full" style={{ backgroundImage: 'var(--grad-diu)' }} />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Department catalog</h2>
          </div>
          <div className="card divide-y divide-slate-100/80 !p-0 dark:divide-slate-800">
            {[
              { label: 'Faculty members', v: faculty.length, icon: 'users' as IconName, tone: 'text-violet-600 dark:text-violet-400' },
              { label: 'Classrooms & labs', v: rooms.length, icon: 'door' as IconName, tone: 'text-sky-600 dark:text-sky-400' },
              { label: 'Courses', v: db?.courses.length ?? 0, icon: 'book' as IconName, tone: 'text-green-600 dark:text-green-400' },
              { label: 'Theory sessions / week', v: theoryCount, icon: 'grid' as IconName, tone: 'text-brand-600 dark:text-brand-400' },
              { label: 'Lab sessions / week', v: labCount, icon: 'flask' as IconName, tone: 'text-teal-600 dark:text-teal-400' },
              { label: 'Announcements', v: db?.announcements.filter((a) => a.is_active).length ?? 0, icon: 'bell' as IconName, tone: 'text-pink-600 dark:text-pink-400' },
            ].map((r) => (
              <div key={r.label} className="group flex items-center justify-between px-4 py-3 transition-colors hover:bg-brand-50/40 dark:hover:bg-slate-800/30">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  <Icon name={r.icon} className={`h-4 w-4 ${r.tone}`} /> {r.label}
                </span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{loading ? '…' : r.v}</span>
              </div>
            ))}
          </div>
          <div className="card mt-3 flex items-start gap-3 p-4">
            <span className="grad-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <Icon name="info" className="h-4 w-4" />
            </span>
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
