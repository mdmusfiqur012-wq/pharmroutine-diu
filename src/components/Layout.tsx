import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, Logo, type IconName } from '../lib/ui';
import { useApp } from '../lib/store';
import { api, isSupabaseMode } from '../lib/db';
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
  { to: '/faculty', icon: 'users', label: 'Faculty' },
  { to: '/rooms', icon: 'door', label: 'Batch Schedule' },
  { to: '/lab', icon: 'flask', label: 'Laboratory' },
  { to: '/search', icon: 'search', label: 'Search' },
  { to: '/announcements', icon: 'bell', label: 'Notices' },
  { to: '/contact', icon: 'phone', label: 'Contact' },
  { to: '/admin', icon: 'settings', label: 'Admin', admin: true },
  { to: '/admin/generator', icon: 'zap', label: 'Smart Generator', admin: true },
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
  const visibleNav = NAV.filter((n) => !n.admin || role === 'admin');

  return (
    <div className="bg-ambient bg-science relative min-h-screen">
      {/* ---------- Floating glass navbar ---------- */}
      <header className="no-print sticky top-0 z-40 px-3 pt-3">
        <div className="glass-strong mx-auto flex max-w-7xl items-center gap-2 rounded-2xl px-3 py-2 sm:px-4">
          <Link to="/" className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1">
            <span className="relative">
              <Logo size={36} className="transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3" />
              <span className="absolute -inset-1 -z-10 rounded-full bg-brand-500/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white">
                PharmRoutine <span className="gradient-text">DIU</span>
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Dept. of Pharmacy
              </span>
            </span>
          </Link>

          {/* desktop links */}
          <nav className="mx-auto hidden items-center gap-0.5 lg:flex">
            {visibleNav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => clsx('nav-floating', isActive && 'nav-floating-active')}
              >
                <Icon name={n.icon} className="h-4 w-4" />
                <span className="hidden xl:inline">{n.label}</span>
                {n.to === '/announcements' && pendingAnnouncements > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                    {pendingAnnouncements}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <button
              onClick={toggleDark}
              className="rounded-xl border border-white/60 bg-white/50 p-2 text-slate-500 shadow-sm backdrop-blur transition-all hover:-translate-y-px hover:text-brand-700 hover:shadow-glow-blue dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:text-brand-300"
              aria-label="Toggle dark mode"
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            {user && (
              <button onClick={signOut} className="rounded-xl border border-white/60 bg-white/50 p-2 text-slate-500 shadow-sm backdrop-blur transition-all hover:-translate-y-px hover:text-red-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300" aria-label="Sign out" title={`Signed in as ${user.full_name}`}>
                <Icon name="logOut" />
              </button>
            )}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-xl border border-white/60 bg-white/50 p-2 text-slate-600 shadow-sm backdrop-blur transition-all hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 lg:hidden"
              aria-label="Menu"
            >
              <Icon name={mobileOpen ? 'x' : 'menu'} className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Mobile drawer (glass) ---------- */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-white/60 bg-white/85 shadow-float backdrop-blur-2xl animate-fade-in dark:border-slate-700 dark:bg-slate-900/90">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
              <Logo size={30} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">PharmRoutine DIU</p>
                <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">Department of Pharmacy</p>
              </div>
              <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-slate-800" aria-label="Close menu">
                <Icon name="x" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3 scroll-thin">
              {visibleNav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
                >
                  <Icon name={n.icon} className="h-[18px] w-[18px]" />
                  {n.label}
                  {n.to === '/announcements' && pendingAnnouncements > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{pendingAnnouncements}</span>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-100 p-4 dark:border-slate-800">
              {user ? (
                <div className="card flex items-center gap-3 !bg-white/80 p-3 dark:!bg-slate-800/80">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundImage: 'var(--grad-diu)' }}>
                    {user.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{user.full_name}</p>
                    <p className="truncate text-[11px] capitalize text-slate-500">{user.role}</p>
                  </div>
                  <button onClick={signOut} className="btn-secondary !px-2.5 !py-1.5 text-xs">Sign out</button>
                </div>
              ) : (
                <p className="px-1 text-center text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                  Routine access is open for everyone — no account needed.
                </p>
              )}
              <p className="mt-3 px-1 text-center text-[10px] text-slate-400 dark:text-slate-600">
                {isSupabaseMode ? 'Connected to Supabase' : 'Demo mode · local dataset'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Main ---------- */}
      <main className="relative">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>

        <footer
          onClick={secretTap}
          className="no-print relative mx-auto max-w-7xl cursor-default select-none px-6 pb-8 pt-6 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-600"
          title=""
        >
          <div className="card mb-4 !rounded-3xl p-5 sm:p-6">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(37,99,235,.5), rgba(22,163,74,.5), transparent)' }} />
            <div className="flex flex-col items-center gap-0.5">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white sm:text-base">
                <span className="grad-icon-tile flex h-8 w-8 items-center justify-center rounded-xl">
                  <Icon name="award" className="h-4 w-4" />
                </span>
                Prepared by Md Musfiqur Rahaman
              </span>
              <span className="chip px-3 py-1 text-[11px] font-bold uppercase tracking-widest" style={{ backgroundImage: 'var(--grad-diu)', color: 'white', boxShadow: '0 6px 18px -8px rgb(29 78 216 / .55)' }}>
                Research &amp; Academic Affairs Secretary
              </span>
            </div>
          </div>
          <p>
            <span className="font-bold text-brand-700 dark:text-brand-400">PharmRoutine DIU</span> · Daffodil International University · Department of Pharmacy
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> · </span>
            Fall 2026 · Batches 29–38 · Sections A/B · Lab Groups A1, A2, B1, B2
          </p>
        </footer>
      </main>
    </div>
  );
}
