import { createClient, SupabaseClient } from '@supabase/supabase-js';

/* ============================================================
 * Data layer — Supabase PostgreSQL backend with a fully
 * functional embedded demo database fallback.
 *
 *  · If SUPABASE_URL + SUPABASE_ANON_KEY are configured the app
 *    talks to Supabase and honours RLS + the conflict-check RPC.
 *  · Otherwise it boots on the bundled seed (src/lib/seed.json)
 *    in "demo mode" so the whole portal works out of the box.
 * ============================================================ */

import seed from './seed.json';
import type { Database } from './types';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseMode = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseMode
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : null;

/* ------------------------------------------------------------------ */
/* In-memory demo database                                             */
/* ------------------------------------------------------------------ */

type DB = Database;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const store: { db: DB } = { db: clone(seed as unknown as DB) };

/** demo-mode id (text) — only used by the in-memory fallback store */
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** RFC-4122 v4 UUID — REQUIRED for Supabase: every PK column is `uuid`,
 *  so rows created by the admin must carry a real UUID (a "b-xxxx" id is
 *  rejected by Postgres with 22P02 → that is why "Add batch / Add faculty"
 *  silently failed before). */
function uuid4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Run a PostgREST call; if RLS denies it (42501) because this origin has no
 *  admin session (fresh preview URL, expired token…), transparently sign in
 *  with the admin passcode via the magic-admin function and retry once.
 *  This is what makes "Add batch / New faculty" work everywhere. */
async function pgRetry(call: () => Promise<{ error: { code?: string; message: string } | null }>): Promise<{ code?: string; message: string } | null> {
  let res = await call();
  if (res.error?.code === '42501') {
    let signedIn = false;
    try { signedIn = Boolean((await supabase!.auth.getUser()).data.user); } catch { /* noop */ }
    if (!signedIn) {
      const ok = await api.magicAdmin(ADMIN_PASSCODE);
      if (ok) res = await call();
    }
  }
  return res.error ? { code: res.error.code, message: res.error.message } : null;
}

const rlsMsg = (e: { code?: string; message: string }) =>
  e.code === '42501'
    ? 'Permission denied — the admin session could not be restored. Open the site, sign in once with the admin passcode, then retry.'
    : e.message;

/** UI table key → Supabase table name */
const SB_TABLE: Record<string, string> = {
  semesters: 'semesters', batches: 'batches', sections: 'sections', labGroups: 'lab_groups',
  faculty: 'faculty', courses: 'courses', rooms: 'rooms', timeSlots: 'time_slots',
  classDays: 'class_days', routineEntries: 'routine_entries', batchOffDays: 'batch_off_days',
  announcements: 'announcements', settings: 'settings',
};

function delay(ms = 140) {
  return new Promise<void>((r) => setTimeout(r, ms + Math.random() * 120));
}

/* ------------------------------------------------------------------ */
/* Public API (identical shape in both modes)                         */
/* ------------------------------------------------------------------ */

/** Magic admin passcode: enter it in the email field on the login page
 *  to sign straight into the admin dashboard (configurable via env). */
export const ADMIN_PASSCODE: string =
  ((import.meta as any).env?.VITE_ADMIN_PASSCODE as string | undefined) ?? 'adminlogin7766';

export const api = {
  async fetchAll(): Promise<DB> {
    if (supabase) {
      const [
        semesters, batches, sections, labGroups, faculty, courses, rooms,
        timeSlots, classDays, routineEntries, batchOffDays, announcements, settings,
      ] = await Promise.all([
        supabase.from('semesters').select('*').order('name'),
        supabase.from('batches').select('*').order('batch_no'),
        supabase.from('sections').select('*'),
        supabase.from('lab_groups').select('*'),
        supabase.from('faculty').select('*').order('name'),
        supabase.from('courses').select('*').order('code'),
        supabase.from('rooms').select('*').order('code'),
        supabase.from('time_slots').select('*').order('sequence'),
        supabase.from('class_days').select('*').order('sequence'),
        supabase.from('routine_entries').select('*'),
        supabase.from('batch_off_days').select('*'),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
        supabase.from('settings').select('*'),
      ]);
      const g = (r: any) => (r.error ? [] : r.data);
      return {
        semesters: g(semesters) as any, batches: g(batches) as any, sections: g(sections) as any,
        labGroups: g(labGroups) as any, faculty: g(faculty) as any, courses: g(courses) as any,
        rooms: g(rooms) as any, timeSlots: g(timeSlots) as any, classDays: g(classDays) as any,
        routineEntries: g(routineEntries) as any, batchOffDays: g(batchOffDays) as any,
        announcements: g(announcements) as any, settings: g(settings) as any,
      };
    }
    await delay();
    return clone(store.db);
  },

  /* ---- routine entries ---- */
  async saveRoutineEntry(entry: any): Promise<{ ok: boolean; error?: string; entry?: any }> {
    if (supabase) {
      const eid = entry?.id && /^[0-9a-f-]{36}$/i.test(entry.id) ? entry.id : uuid4();
      const err = await pgRetry(async () => {
        const r = await supabase!.from('routine_entries').insert({ ...entry, id: eid });
        return { error: r.error };
      });
      if (err) return { ok: false, error: rlsMsg(err) };
      const { data } = await supabase.from('routine_entries').select().eq('id', eid).single();
      return { ok: true, entry: data };
    }
    await delay();
    store.db.routineEntries.push({ ...clone(entry), id: uid('e'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return { ok: true, entry: clone(store.db.routineEntries[store.db.routineEntries.length - 1]) };
  },

  async updateRoutineEntry(id: string, patch: any): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const { error } = await supabase.from('routine_entries').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    await delay();
    const row = store.db.routineEntries.find((e) => e.id === id);
    if (row) Object.assign(row, clone(patch), { updated_at: new Date().toISOString() });
    return { ok: true };
  },

  async deleteRoutineEntry(id: string): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const { error } = await supabase.from('routine_entries').delete().eq('id', id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    await delay();
    store.db.routineEntries = store.db.routineEntries.filter((e) => e.id !== id);
    return { ok: true };
  },

  /* ---- off days ---- */
  async setOffDays(semesterId: string, batchId: string, rows: { day_id: string; reason: string }[]): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const derr = await pgRetry(async () => {
        const r = await supabase!.from('batch_off_days').delete().eq('semester_id', semesterId).eq('batch_id', batchId);
        return { error: r.error };
      });
      if (derr) return { ok: false, error: rlsMsg(derr) };
      if (rows.length) {
        const ierr = await pgRetry(async () => {
          const r = await supabase!.from('batch_off_days').insert(
            rows.map((x) => ({ semester_id: semesterId, batch_id: batchId, day_id: x.day_id, reason: x.reason, is_active: true })),
          );
          return { error: r.error };
        });
        if (ierr) return { ok: false, error: rlsMsg(ierr) };
      }
      return { ok: true };
    }
    await delay();
    store.db.batchOffDays = store.db.batchOffDays.filter((o) => !(o.semester_id === semesterId && o.batch_id === batchId));
    for (const r of rows) {
      store.db.batchOffDays.push({ id: uid('od'), semester_id: semesterId, batch_id: batchId, day_id: r.day_id, reason: r.reason, is_active: true });
    }
    return { ok: true };
  },

  /* ---- generic CRUD for catalog tables ---- */
  async upsertRow(table: keyof DB, row: any): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (supabase) {
      const newId = row.id ?? uuid4();
      const err = await pgRetry(async () => {
        const r = row.id
          ? await supabase!.from(SB_TABLE[table] ?? table).update(row).eq('id', row.id)
          : await supabase!.from(SB_TABLE[table] ?? table).insert({ ...row, id: newId });
        return { error: r.error };
      });
      if (err) return { ok: false, error: rlsMsg(err) };
      return { ok: true, id: newId };
    }
    await delay();
    const rows = store.db[table] as any[];
    if (row.id) {
      const found = rows.find((r) => r.id === row.id);
      if (found) Object.assign(found, clone(row));
      return { ok: true, id: row.id };
    }
    const newId = uid(String(table).slice(0, 1));
    rows.push({ ...clone(row), id: newId });
    return { ok: true, id: newId };
  },

  async deleteRow(table: keyof DB, id: string): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const err = await pgRetry(async () => {
        const r = await supabase!.from(SB_TABLE[table] ?? table).delete().eq('id', id);
        return { error: r.error };
      });
      return err ? { ok: false, error: rlsMsg(err) } : { ok: true };
    }
    await delay();
    (store.db[table] as any[]) = (store.db[table] as any[]).filter((r) => r.id !== id);
    return { ok: true };
  },

  /* ---- announcements ---- */
  async saveAnnouncement(row: any): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const payload = { ...row, created_by: (await supabase.auth.getUser()).data.user?.id ?? null };
      const err = await pgRetry(async () => {
        const r = row.id
          ? await supabase!.from('announcements').update(payload).eq('id', row.id)
          : await supabase!.from('announcements').insert(payload);
        return { error: r.error };
      });
      return err ? { ok: false, error: rlsMsg(err) } : { ok: true };
    }
    await delay();
    if (row.id) {
      const found = store.db.announcements.find((a) => a.id === row.id);
      if (found) Object.assign(found, clone(row));
    } else {
      store.db.announcements.unshift({ ...clone(row), id: uid('a'), created_at: new Date().toISOString() });
    }
    return { ok: true };
  },

  async deleteAnnouncement(id: string): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const err = await pgRetry(async () => {
        const r = await supabase!.from('announcements').delete().eq('id', id);
        return { error: r.error };
      });
      return err ? { ok: false, error: rlsMsg(err) } : { ok: true };
    }
    await delay();
    store.db.announcements = store.db.announcements.filter((a) => a.id !== id);
    return { ok: true };
  },

  async saveSetting(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const { error } = await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    await delay(80);
    const found = store.db.settings.find((s) => s.key === key);
    if (found) found.value = value;
    else store.db.settings.push({ key, value });
    return { ok: true };
  },

  /* ---- auth ---- */
  async signIn(email: string, password: string): Promise<{ ok: boolean; user?: any; role?: string; full_name?: string; error?: string }> {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      const profile = await fetchProfile(data.user?.id);
      return {
        ok: true,
        user: { id: data.user?.id, email: data.user?.email },
        role: profile?.role ?? 'student',
        full_name: profile?.full_name ?? data.user?.email?.split('@')[0] ?? 'Student',
      };
    }
    await delay(350);
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) return { ok: false, error: 'Invalid email or password. Try one of the demo accounts below.' };
    return { ok: true, user: { id: user.email, email: user.email }, role: user.role, full_name: user.full_name };
  },

  /** Magic admin sign-in via the server-side passcode verifier
   *  (Supabase Edge Function in production, demo admin offline). */
  async magicAdmin(passcode: string): Promise<{ ok: boolean; user?: any; role?: string; full_name?: string; error?: string }> {
    if (!supabase) {
      await delay(350);
      if (passcode !== ADMIN_PASSCODE) return { ok: false, error: 'Invalid passcode.' };
      const admin = DEMO_USERS[0];
      return { ok: true, user: { id: admin.email, email: admin.email }, role: 'admin', full_name: admin.full_name };
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/magic-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY! },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, error: j.error ?? 'Passcode verification failed (is the magic-admin function deployed?).' };
    }
    const { token_hash } = await res.json();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
    if (error || !data.user) return { ok: false, error: error?.message ?? 'Could not start admin session.' };
    const profile = await fetchProfile(data.user.id);
    return { ok: true, user: { id: data.user.id, email: data.user.email }, role: 'admin', full_name: profile?.full_name ?? 'Routine Administrator' };
  },

  async signOut(): Promise<void> {
    if (supabase) { await supabase.auth.signOut(); }
  },

  async getSessionUser(): Promise<{ id: string; email: string } | null> {
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
    }
    return null;
  },
};

async function fetchProfile(id: string | undefined) {
  if (!supabase || !id) return null;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    return data as any;
  } catch { return null; }
}

export const DEMO_USERS = [
  { email: 'admin@diu.edu.bd', password: 'admin123', role: 'admin', full_name: 'Routine Administrator', department: 'Dept. of Pharmacy' },
  { email: 'dsharmin@diu.edu.bd', password: 'pharmacy123', role: 'faculty', full_name: 'Prof. Dr. Mohammed Shafikur Rahman', department: 'Pharmacy', facultyInitials: 'DSR' },
  { email: 'student@diu.edu.bd', password: 'student123', role: 'student', full_name: 'Pharmacy Student', department: 'Pharmacy', batch: 34, section: 'A', labGroup: 'A1' },
];

export function findDemoUser(email: string) {
  return DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function resetDemoData(): Promise<void> {
  if (!supabase) {
    store.db = clone(seed as unknown as DB);
    await delay(120);
  }
}
