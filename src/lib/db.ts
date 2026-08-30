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

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
      const { data, error } = await supabase.from('routine_entries').insert(entry).select().single();
      if (error) return { ok: false, error: `${error.message} (${error.code})` };
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
      const { error } = await supabase
        .from('batch_off_days')
        .delete()
        .eq('semester_id', semesterId)
        .eq('batch_id', batchId);
      if (error) return { ok: false, error: error.message };
      if (rows.length) {
        const { error: ierr } = await supabase.from('batch_off_days').insert(
          rows.map((r) => ({ semester_id: semesterId, batch_id: batchId, day_id: r.day_id, reason: r.reason, is_active: true })),
        );
        if (ierr) return { ok: false, error: ierr.message };
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
      if (row.id) {
        const { error } = await supabase.from(SB_TABLE[table] ?? table).update(row).eq('id', row.id);
        return error ? { ok: false, error: error.message } : { ok: true, id: row.id };
      }
      const newId = uid(String(table).slice(0, 1));
      const { error } = await supabase.from(SB_TABLE[table] ?? table).insert({ ...row, id: newId });
      return error ? { ok: false, error: error.message } : { ok: true, id: newId };
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
      const { error } = await supabase.from(SB_TABLE[table] ?? table).delete().eq('id', id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    await delay();
    (store.db[table] as any[]) = (store.db[table] as any[]).filter((r) => r.id !== id);
    return { ok: true };
  },

  /* ---- announcements ---- */
  async saveAnnouncement(row: any): Promise<{ ok: boolean; error?: string }> {
    if (supabase) {
      const payload = { ...row, created_by: (await supabase.auth.getUser()).data.user?.id ?? null };
      const { error } = row.id
        ? await supabase.from('announcements').update(payload).eq('id', row.id)
        : await supabase.from('announcements').insert(payload);
      return error ? { ok: false, error: error.message } : { ok: true };
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
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      return error ? { ok: false, error: error.message } : { ok: true };
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
  async signIn(email: string, password: string): Promise<{ ok: boolean; user?: any; error?: string }> {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true, user: { id: data.user?.id, email: data.user?.email } };
    }
    await delay(350);
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) return { ok: false, error: 'Invalid email or password. Try one of the demo accounts below.' };
    return { ok: true, user: { id: user.email, email: user.email } };
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

export const DEMO_USERS = [
  { email: 'admin@diu.edu.bd', password: 'admin123', role: 'admin', full_name: 'Routine Administrator', department: 'Dept. of Pharmacy' },
  { email: 'dsharmin@diu.edu.bd', password: 'pharmacy123', role: 'faculty', full_name: 'Dr. Sharmin Rahman', department: 'Pharmacy', facultyInitials: 'DSR' },
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
