import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { api, ADMIN_PASSCODE, DEMO_USERS, isSupabaseMode, findDemoUser } from '../lib/db';
import { useApp } from '../lib/store';
import { Icon, Logo, Badge, useToast } from '../lib/ui';

/* ============================================================
 * Recommended Student Flow — email-first authentication.
 *
 *   Step 1  🎓 PharmRoutine DIU
 *           Department of Pharmacy · Daffodil International University
 *   Step 2  Enter your DIU email → the system verifies it ends
 *           with @diu.edu.bd (❌ otherwise → official-email message)
 *   Step 3  Password → role-based redirect (admin → dashboard).
 * ============================================================ */

const DIU_DOMAIN = 'diu.edu.bd';

type Check = { label: string; done: boolean; hint?: string };

function validateDiuEmail(email: string): { ok: boolean; checks: Check[]; error: string | null } {
  const e = email.trim().toLowerCase();
  const formatOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const domainOk = e.endsWith(`@${DIU_DOMAIN}`);
  const checks: Check[] = [
    {
      label: 'Valid email format',
      done: formatOk,
      hint: !e ? 'Typing…' : formatOk ? undefined : 'e.g. name@diu.edu.bd',
    },
    {
      label: `Ends with @${DIU_DOMAIN}?`,
      done: domainOk,
      hint: !e ? 'Typing…' : domainOk ? undefined : 'Department of Pharmacy accounts only',
    },
  ];
  let error: string | null = null;
  if (e && (!formatOk || !domainOk)) {
    error = domainOk ? 'Please enter a valid email address.' : '❌ Please use your official DIU email address.';
  }
  return { ok: formatOk && domainOk, checks, error };
}

export default function Login() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { setUser } = useApp();
  const navigate = useNavigate();
  const toast = useToast();

  const v = useMemo(() => validateDiuEmail(email), [email]);
  const isPasscode = !isSupabaseMode && email.trim() === ADMIN_PASSCODE;

  /* ---- Step 1: verify the official DIU email (or admin passcode) ---- */
  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    if (isPasscode) {
      // demo-mode magic admin
      setBusy(true);
      const res = await api.magicAdmin(ADMIN_PASSCODE);
      setBusy(false);
      if (!res.ok) { setError(res.error ?? 'Passcode verification failed.'); return; }
      finishAdmin(res);
      return;
    }
    if (!v.ok) {
      // production: non-DIU text might be the admin passcode — let the
      // server-side verifier decide (never trust the client).
      if (isSupabaseMode && email.trim()) {
        setBusy(true);
        const res = await api.magicAdmin(email.trim());
        setBusy(false);
        if (res.ok) { finishAdmin(res); return; }
      }
      setError(v.error ?? '❌ Please use your official DIU email address.');
      return;
    }
    setStep(2);
  }

  function finishAdmin(res: { user?: any; full_name?: string }) {
    setUser({ id: res.user!.id, email: res.user!.email, role: 'admin', full_name: res.full_name ?? 'Routine Administrator' });
    toast.push('success', 'Admin access granted — welcome!');
    navigate('/admin');
  }

  /* ---- Step 2: password + role-based redirect ---- */
  async function signIn(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    const res = await api.signIn(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Sign-in failed');
      return;
    }
    const demo = !isSupabaseMode ? findDemoUser(email.trim()) : undefined;
    const sessionUser = demo
      ? { id: res.user!.id, email: res.user!.email, role: demo.role, full_name: demo.full_name, ...(demo as any) }
      : { id: res.user!.id, email: res.user!.email, role: (res.role ?? 'student') as any, full_name: res.full_name ?? email.split('@')[0] };
    setUser(sessionUser as any);
    toast.push('success', `Welcome back, ${sessionUser.full_name}!`);
    navigate(sessionUser.role === 'admin' ? '/admin' : '/');
  }

  function fillDemo(u: (typeof DEMO_USERS)[number]) {
    setEmail(u.email);
    setPassword(u.password);
    setError('');
    if (validateDiuEmail(u.email).ok) setStep(2);
    toast.push('info', `${u.email} — press “Sign in” to continue as ${u.role}.`);
  }

  return (
    <div className="mx-auto flex min-h-[72vh] max-w-md flex-col justify-center py-6">
      {/* ---------- Step 1 · branded entry + email verification ---------- */}
      {step === 1 && (
        <div className="card overflow-hidden animate-scale-in">
          <div className="relative bg-gradient-to-br from-brand-800 via-brand-700 to-emerald-800 px-6 py-8 text-center text-white">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-14 -left-10 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="relative">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/95 p-1.5 shadow-lg ring-1 ring-white/40">
                <Logo size={64} />
              </div>
              <h1 className="mt-3 flex items-center justify-center gap-2 text-xl font-extrabold">
                <span aria-hidden>🎓</span> PharmRoutine DIU
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/90">Department of Pharmacy</p>
              <p className="text-xs font-medium text-white/70">Daffodil International University</p>
            </div>
          </div>

          <form onSubmit={verify} className="space-y-4 p-6">
            <div>
              <label className="label text-center">Step 2 · Enter your DIU email address</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="mail" /></span>
                <input
                  autoFocus
                  className={clsx('input !py-3 !pl-11 text-base', v.ok && 'border-green-400 focus:border-green-500 focus:ring-green-500/30')}
                  type="email"
                  placeholder="student@example.diu.edu.bd"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  required
                  autoComplete="username"
                />
              </div>
              {error && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-red-600 dark:text-red-400" role="alert">
                  <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </p>
              )}
            </div>

            {/* the system checks panel */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">The system checks</p>
              <ul className="space-y-1.5">
                {isPasscode && (
                  <li className="flex items-center gap-2 text-xs font-semibold text-brand-700 dark:text-brand-400">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-white shadow-glow-blue" style={{ backgroundImage: 'var(--grad-diu)' }}><Icon name="check" className="h-2.5 w-2.5" /></span>
                    Admin passcode recognized — verifying…
                  </li>
                )}
                {v.checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-xs font-semibold">
                    {c.done ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white"><Icon name="check" className="h-2.5 w-2.5" /></span>
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-400 dark:bg-slate-700"><span className="text-[10px]">•</span></span>
                    )}
                    <span className={c.done ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
                      {c.label}
                      {c.hint && <span className="ml-1.5 font-normal text-slate-400">{c.hint}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <button type="submit" className="btn-primary w-full !py-3" disabled={busy}>
              {busy ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Verifying…</>
              ) : (
                <>Verify &amp; Continue <Icon name="chevronRight" className="h-4 w-4" /></>
              )}
            </button>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Icon name="info" className="h-3.5 w-3.5 shrink-0" />
              Personal, Gmail, Yahoo or other university addresses are not accepted — only official DIU accounts.
            </div>
          </form>
        </div>
      )}

      {/* ---------- Step 2 · password ---------- */}
      {step === 2 && (
        <div className="card overflow-hidden animate-scale-in">
          <div className="bg-gradient-to-br from-brand-800 to-emerald-800 px-6 py-6 text-center text-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-white/95 p-1 shadow ring-1 ring-white/40"><Logo size={44} /></div>
            <h1 className="mt-2 text-lg font-extrabold">Enter your password</h1>
          </div>
          <form onSubmit={signIn} className="space-y-4 p-6">
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/30">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"><Icon name="check" className="h-3.5 w-3.5" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-green-800 dark:text-green-300">{email.trim()}</p>
                  <p className="text-[11px] font-semibold text-green-600/80 dark:text-green-400/70">Verified official DIU email ✓</p>
                </div>
              </div>
              <button type="button" onClick={() => setStep(1)} className="shrink-0 rounded-lg p-1.5 text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/40" title="Change email">
                <Icon name="edit" className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </div>
            )}

            <div>
              <label className="label">Password</label>
              <input
                autoFocus
                className="input !py-3"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                autoComplete="current-password"
              />
            </div>

            <button className="btn-primary w-full !py-3" disabled={busy}>
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="shield" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="btn-ghost w-full text-xs" onClick={() => setStep(1)}>
              <Icon name="arrowLeft" className="h-3.5 w-3.5" /> Use a different email
            </button>
          </form>
        </div>
      )}

      {/* ---------- demo accounts (offline demo mode only — never shown in production) ---------- */}
      {!isSupabaseMode && (
      <div className="card mt-4 p-5">
        <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          Demo accounts (offline demo mode)
        </p>
        <div className="space-y-2">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              onClick={() => fillDemo(u)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:border-brand-600 dark:hover:bg-slate-800"
            >
              <span>
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{u.full_name}</span>
                <span className="block text-[11px] text-slate-400">{u.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={u.role === 'admin' ? 'purple' : u.role === 'faculty' ? 'blue' : 'green'}>{u.role}</Badge>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 dark:bg-slate-800">{u.password}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
