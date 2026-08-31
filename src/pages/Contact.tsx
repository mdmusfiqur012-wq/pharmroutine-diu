import { Link } from 'react-router-dom';
import { Icon, Logo, PageHeader } from '../lib/ui';
import { useApp } from '../lib/store';
import { useData } from '../lib/data';

/* ============================================================
 * Contact — Department of Pharmacy, DIU. Office details come
 * from the official faculty directory (never fabricated).
 * ============================================================ */

export default function Contact() {
  const { settings } = useApp();
  const { db } = useData();
  const faculty = db?.faculty.filter((f) => f.is_active) ?? [];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Contact" subtitle="Department of Pharmacy, Daffodil International University — reach us or browse the official faculty directory." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* office */}
        <div className="card p-6">
          <span className="grad-icon-tile mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Icon name="building" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Department Office</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {settings.universityName} · {settings.departmentName}
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Icon name="mapPin" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              <span className="text-slate-600 dark:text-slate-300">
                Permanent Campus, Daffodil Smart City,<br />Birulia, Savar, Dhaka — 1216, Bangladesh
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="phone" className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              <a href="tel:+8809617901233" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">+880 9617-901233</a>
              <span className="text-xs text-slate-400">(office)</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="mail" className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">pharmacy@daffodilvarsity.edu.bd</span>
            </li>
          </ul>
        </div>

        {/* quick links */}
        <div className="card p-6">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow-green" style={{ backgroundImage: 'var(--grad-diu)' }}>
            <Icon name="users" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Faculty Directory</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {faculty.length} official teaching staff — emails and phone numbers straight from the DIU profile pages.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/faculty" className="btn-primary !px-4 !py-2 text-xs">
              <Icon name="calendar" className="h-3.5 w-3.5" /> Faculty Routine
            </Link>
            <a href="https://faculty.daffodilvarsity.edu.bd/teachers/pharmacy.html" target="_blank" rel="noreferrer" className="btn-secondary !px-4 !py-2 text-xs">
              <Icon name="eye" className="h-3.5 w-3.5" /> Official DIU Directory
            </a>
          </div>
        </div>

        {/* credit */}
        <div className="card relative overflow-hidden p-6">
          <div aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-brand-400/20 to-emerald-400/20 blur-2xl" />
          <span className="grad-icon-tile mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Icon name="award" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">About this portal</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            PharmRoutine DIU is the student-facing class &amp; laboratory routine portal of the department.
          </p>
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/60 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">Md Musfiqur Rahaman</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Research &amp; Academic Affairs Secretary</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Community of Pharmacy, {settings.universityName}.</p>
          </div>
        </div>
      </div>

      {/* dept intro strip */}
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1 shadow-card ring-1 ring-brand-100 dark:ring-slate-700">
          <Logo size={40} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">{settings.departmentName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            B.Pharm programme · {settings.universityTagline}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Batches 29–38', 'Sections A · B', 'Lab groups A1 · A2 · B1 · B2'].map((s) => (
            <span key={s} className="chip bg-gradient-to-r from-brand-50 to-emerald-50 text-brand-800 ring-1 ring-brand-100 dark:from-brand-950 dark:to-emerald-950 dark:text-brand-300 dark:ring-slate-700">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
