import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, Logo, type IconName } from '../lib/ui';
import { useApp } from '../lib/store';
import { api, isSupabaseMode, DEMO_USERS } from '../lib/db';
import { useData } from '../lib/data';
import { useToast } from '../lib/ui';

/* ============================================================
 * Secret admin access.
 * Students never see a login button anywhere. Staff reach the
 * sign-in page only via:
 *   1. Direct URL  →  /login
 *   2. Keyboard    →  Ctrl+Shift+L  (desktop)
 *   3. Mobile      →  tap the footer brand 5 times quickly
 * ============================================================ */
function useSecretLogin() {
  const navigate = useNavigate();
  const taps = useRef<number[]>([]);
  const onTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      navigate('/login');
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        navigate('/login');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navigate]);
  return onTap;
}

const NAV: { to: string; icon: IconName; label: string; admin?: boolean }[] = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/routine', icon: 'calendar', label: 'My Routine' },
  { to: '/faculty', icon: 'users', label: 'Faculty Routine' },
  { to: '/rooms', icon: 'door', label: 'Room Schedule' },
  { to: '/lab', icon: 'flask', label: 'Laboratory Routine' },
  { to: '/search', icon: 'search', label: 'Search Routine' },
  { to: '/announcements', icon: 'bell', label: 'Announcements' },
  { to: '/admin', icon: 'settings', label: 'Admin', admin: true },
];

export default function Layout() {
  const dark = useApp((s) => s.dark);
  const toggleDark = useApp((s) => s.toggleDark);
  const user = useApp((s) => s.user);
  const setUser = useApp((s) => s.setUser);
  const { db } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const pendingAnnouncements = db?.announcements.filter((a) => a.is_active).length ?? 0;

  async function signOut() {
    await api.signOut();
    setUser(null);
    toast.push('info', 'Signed out. See you soon!');
    navigate('/');
  }

  const role = user?.role;
  const secretTap = useSecretLogin();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <Link to="/" className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <Logo />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight text-slate-900 dark:text-white">🎓 PharmRoutine DIU</p>
            <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">DIU · Dept. of Pharmacy</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scroll-thin">
          {NAV.filter((n) => !n.admin || role === 'admin').map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
            >
              <Icon name={n.icon} className="h-[18px] w-[18px]" />
              {n.label}
              {n.to === '/announcements' && pendingAnnouncements > 0 && (
                <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                  {pendingAnnouncements}
                </span>
              )}
              {n.to === '/admin' && <span className="ml-auto text-[10px] font-bold uppercase text-brand-700 dark:text-brand-400">★</span>}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
          {user ? (
            <div className="card flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                {user.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{user.full_name}</p>
                <p className="truncate text-[11px] capitalize text-slate-500">{role === 'faculty' ? 'Faculty' : role} · {user.email.split('@')[0]}</p>
              </div>
              <button onClick={signOut} title="Sign out" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                <Icon name="logOut" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="px-1 text-center text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
              Routine access is open for everyone — no account needed.
            </p>
          )}
          <p className="px-1 text-center text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
            {isSupabaseMode ? 'Connected to Supabase' : 'Demo mode · local dataset'}
          </p>
        </div>
      </aside>

      {/* ---------- Mobile header ---------- */}
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={32} />
          <div>
            <p className="text-sm font-extrabold leading-none text-slate-900 dark:text-white">🎓 PharmRoutine DIU</p>
            <p className="text-[10px] font-medium text-slate-500">DIU · Dept. of Pharmacy</p>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <button onClick={toggleDark} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Toggle theme">
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
          <button onClick={() => setMobileOpen((v) => !v)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Menu">
            <Icon name={mobileOpen ? 'x' : 'menu'} className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ---------- Mobile drawer ---------- */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-slate-950/50 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl animate-fade-in dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">Menu</p>
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon name="x" /></button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3 scroll-thin">
              {NAV.filter((n) => !n.admin || role === 'admin').map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}>
                  <Icon name={n.icon} className="h-[18px] w-[18px]" />
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-100 p-4 dark:border-slate-800">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                    {user.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{user.full_name}</p>
                    <p className="truncate text-[11px] capitalize text-slate-500">{user.role}</p>
                  </div>
                  <button onClick={signOut} className="btn-secondary !px-2.5 !py-1.5 text-xs">Sign out</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Main ---------- */}
      <main className="lg:pl-64">
        {/* top bar (desktop) */}
        <div className="no-print sticky top-0 z-30 hidden items-center justify-end gap-2 border-b border-slate-200 bg-white/80 px-6 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:flex">
          <span className="mr-auto text-xs font-medium text-slate-400">
            {db?.semesters.find((s) => s.is_active)?.name ?? db?.semesters[0]?.name ?? ''} · Batches 29–38 · Sections A/B · Lab groups A1–B2
          </span>
          {role === 'faculty' && (
            <Link to="/faculty" className="chip bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
              <Icon name="users" className="h-3 w-3" /> Faculty view
            </Link>
          )}
          {role === 'admin' && <Link to="/admin" className="chip bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">Admin dashboard</Link>}
          <button onClick={toggleDark} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Toggle dark mode">
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>

        <footer
          onClick={secretTap}
          className="no-print mx-auto max-w-7xl cursor-default select-none px-6 pb-8 pt-4 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-600"
          title=""
        >
          <div className="mb-3 inline-flex flex-col items-center gap-1 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-white to-brand-50 px-6 py-3 shadow-sm dark:border-brand-800 dark:from-brand-950 dark:via-slate-900 dark:to-brand-950">
            <span className="text-[13px] font-extrabold text-brand-800 dark:text-brand-300">
              🏅 Prepared by Md Musfiqur Rahaman
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
              Research &amp; Academic Affairs Secretary
            </span>
          </div>
          🎓 PharmRoutine DIU · Daffodil International University · Department of Pharmacy · Class & Laboratory Routine Portal —
          Batch 29–36 · Sections A/B · Lab Groups A1, A2, B1, B2
        </footer>
      </main>
    </div>
  );
}
