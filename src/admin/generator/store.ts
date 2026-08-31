/* ============================================================
 * Smart Routine Generator — persistence + publishing.
 * Generator state (offers, rules, locks, draft result, rotation)
 * lives ONLY in the administrator's browser (localStorage) —
 * students can never read generation rules or conflict reports.
 * Publishing writes the final approved classes into the public
 * routine_entries + batch_off_days tables via the admin session.
 * ============================================================ */
import { useEffect, useState } from 'react';
import type { Database } from '../../lib/types';
import { api } from '../../lib/db';
import type {
  GenCtx, GenConfig, ClassLock, RotationState, GenResult, OfferRow, OfferType,
} from './types';

const PREFIX = 'diu.generator.';

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* noop */ }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(state));
    } catch { /* storage full — keep in memory */ }
  }, [key, state]);
  return [state, setState];
}

export function clearGeneratorStorage() {
  for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
}

/* ---------------- context builder (DB → engine view) ---------------- */

export function buildGenCtx(db: Database): GenCtx {
  const activeSem = db.semesters.find((s) => s.is_active) ?? db.semesters[0];
  return {
    semesterId: activeSem?.id ?? '',
    days: db.classDays.filter((d) => d.is_active).sort((a, b) => a.sequence - b.sequence).map((d) => ({ id: d.id, name: d.name, short: d.short_name, seq: d.sequence })),
    slots: db.timeSlots.filter((s) => s.is_active).sort((a, b) => a.sequence - b.sequence).map((s) => ({ id: s.id, label: s.label, start: s.start_time, end: s.end_time, seq: s.sequence })),
    rooms: db.rooms.filter((r) => r.is_active).map((r) => ({ id: r.id, code: r.code, type: r.room_type as any })),
    groups: db.labGroups.map((g) => ({ id: g.id, name: g.name, sectionId: g.section_id })),
    sections: db.sections.map((s) => ({ id: s.id, name: s.name as any, batchId: s.batch_id })),
    batches: db.batches.filter((b) => b.is_active).map((b) => ({ id: b.id, batchNo: b.batch_no, name: b.name })),
  };
}

/* ---------------- auto-locks: never alter locked faculty (MUA) ---------------- */
/** Build locks from the CURRENT published schedule for every faculty the admin
 *  locked (config.lockedFaculty) so regeneration can never silently move them.
 *  Theory rows keep their exact day/slot/room; paired lab groups keep the
 *  session's day/slot and the published lab rooms when they are distinct. */
export function buildAutoLocks(db: Database, offers: OfferRow[], cfg: GenConfig): ClassLock[] {
  const locked = new Set((cfg.lockedFaculty ?? []).map((f) => f.toUpperCase()));
  if (!locked.size) return [];
  const sem = db.semesters.find((x) => x.is_active) ?? db.semesters[0];
  const daySeq = new Map(db.classDays.map((d) => [d.id, d.sequence]));
  const slotSeq = new Map(db.timeSlots.map((t) => [t.id, t.sequence]));
  const batches = new Map(db.batches.map((b) => [b.id, b]));
  const sections = new Map(db.sections.map((x) => [x.id, x]));
  const faculty = new Map(db.faculty.map((f) => [f.id, f]));
  const courses = new Map(db.courses.map((c) => [c.id, c]));
  const out: ClassLock[] = [];
  const byKey = new Map<string, any[]>();
  for (const e of db.routineEntries) {
    if (sem && e.semester_id !== sem.id) continue;
    const f = faculty.get(e.faculty_id); if (!f || !locked.has(f.initials.toUpperCase())) continue;
    const sec = sections.get(e.section_id); if (!sec) continue;
    const b = batches.get(sec.batch_id); if (!b) continue;
    const c = courses.get(e.course_id); if (!c) continue;
    byKey.set(`${b.batch_no}|${sec.name}|${c.code}`, [...(byKey.get(`${b.batch_no}|${sec.name}|${c.code}`) ?? []), e]);
  }
  const sort = (rows: any[]) => [...rows].sort((a, z) => ((daySeq.get(a.day_id) ?? 0) - (daySeq.get(z.day_id) ?? 0)) || ((slotSeq.get(a.time_slot_id) ?? 0) - (slotSeq.get(z.time_slot_id) ?? 0)));
  for (const [key, rows] of byKey) {
    const [bn, section, code] = key.split('|');
    const offer = offers.find((o) => o.batchNo === Number(bn) && o.section === section && o.code === code);
    if (!offer) continue;
    if (offer.type === 'lab') {
      const first = sort(rows)[0];
      const groupRooms: Record<string, string> = {};
      for (const r of rows) if (r.lab_group_id) groupRooms[r.lab_group_id] = r.room_id;
      out.push({ uid: `${offer.id}-lab`, dayId: first.day_id, slotId: first.time_slot_id, groupRooms: Object.keys(groupRooms).length ? groupRooms : undefined, label: `${code} · ${section} · Batch ${bn} (locked faculty)` });
    } else {
      const n = Math.min(rows.length, 3);
      sort(rows).slice(0, n).forEach((r, i) => {
        out.push({ uid: `${offer.id}-s${i}`, dayId: r.day_id, slotId: r.time_slot_id, roomId: r.room_id, label: `${code} · ${section} · Batch ${bn} (locked faculty)` });
      });
    }
  }
  return out;
}

/** user locks win over auto locks on the same unit */
export function mergeLocks(auto: ClassLock[], user: ClassLock[]): ClassLock[] {
  const byUid = new Map(user.map((l) => [l.uid, l]));
  return [...auto.filter((l) => !byUid.has(l.uid)), ...user];
}

/* ---------------- batches: create from explicit offer data ---------------- */
/** A batch number present in the imported offer but missing from the database
 *  is created here — batch no, sections A/B and lab groups A1/A2/B1/B2.
 *  Nothing is guessed: the number comes from the department's offer, and the
 *  semester/level from the official metadata (or the admin's choice). */
export interface CreatedBatch { batchId?: string; sectionAId?: string; sectionBId?: string; groupIds?: string[] }
export async function ensureBatchRows(db: Database, batchNo: number, level: number): Promise<{ ok: boolean; error?: string } & CreatedBatch> {
  const existing = db.batches.find((b) => b.batch_no === batchNo);
  if (existing) return { ok: true, batchId: existing.id };
  const r = await api.upsertRow('batches', {
    batch_no: batchNo,
    name: `Batch ${batchNo}`,
    admission_year: new Date().getFullYear() - (db.batches.length ? 1 : 1),
    current_level: Math.max(1, Math.min(8, level || 1)),
    is_active: true,
  });
  if (!r.ok || !r.id) return { ok: false, error: r.error ?? 'batch insert failed' };
  const secA = await api.upsertRow('sections', { name: 'A', batch_id: r.id });
  const secB = await api.upsertRow('sections', { name: 'B', batch_id: r.id });
  const groupIds: string[] = [];
  if (secA.ok && secB.ok) {
    for (const [name, sid] of [['A1', secA.id!], ['A2', secA.id!], ['B1', secB.id!], ['B2', secB.id!]] as const) {
      const g = await api.upsertRow('labGroups', { name, section_id: sid });
      if (g.ok && g.id) groupIds.push(g.id);
    }
  }
  return { ok: true, batchId: r.id, sectionAId: secA.id, sectionBId: secB.id, groupIds };
}

/* ---------------- publishing ---------------- */

export interface PublishOptions {
  replaceExisting: boolean;   // delete existing routine entries of the target batches first
  syncOffDays: boolean;       // write batch off-days into batch_off_days
  batches: number[];          // batches to publish
}

export interface PublishSummary {
  ok: boolean;
  created: number;
  deleted: number;
  errors: string[];
  publishedByBatch: Record<string, string[]>; // batchNo → entry ids
  offDayErrors: string[];
}

const uuid = () => (crypto as any).randomUUID ? crypto.randomUUID() : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function publishResult(
  db: Database, ctx: GenCtx, result: GenResult, offers: OfferRow[], cfg: GenConfig, opts: PublishOptions,
): Promise<PublishSummary> {
  const summary: PublishSummary = { ok: true, created: 0, deleted: 0, errors: [], publishedByBatch: {}, offDayErrors: [] };
  const batchNos = new Set(opts.batches);
  const classes = result.classes.filter((c) => batchNos.has(c.batchNo));

  const semId = ctx.semesterId;
  const batchByNo = new Map(ctx.batches.map((b) => [b.batchNo, b]));
  const secByKey = new Map(ctx.sections.map((s) => [`${s.batchId}|${s.name}`, s]));
  const sectByKey = new Map<string, any>(db.sections.map((s) => [`${s.batch_id}|${s.name}`, s]));
  const groupByKey = new Map(ctx.groups.map((g) => [`${g.sectionId}|${g.name}`, g]));
  const roomByCode = new Map(ctx.rooms.map((r) => [r.code, r]));
  const courseByCode = new Map(db.courses.map((c) => [c.code, c]));
  const facultyByInit = new Map<string, any>(db.faculty.map((f) => [f.initials.toUpperCase(), f]));
  const dayById = new Map(ctx.days.map((d) => [d.id, d]));
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));

  // 0) safety: every batch we publish must exist in the database
  for (const bn of batchNos) {
    if (!batchByNo.get(bn)) {
      const made = await ensureBatchRows(db, bn, 1);
      if (made.ok) {
        if (!made.batchId) continue;
        batchByNo.set(bn, { id: made.batchId, batchNo: bn, name: `Batch ${bn}` });
        // wire the freshly created structure into the local lookup maps
        const secA = made.sectionAId ? { id: made.sectionAId, name: 'A', batchId: made.batchId } : null;
        const secB = made.sectionBId ? { id: made.sectionBId, name: 'B', batchId: made.batchId } : null;
        for (const [key, sec] of [['A', secA], ['B', secB]] as const) {
          if (!sec) continue;
          secByKey.set(`${made.batchId}|${key}`, sec); sectByKey.set(`${made.batchId}|${key}`, sec);
          ctx.batches.push({ id: made.batchId, batchNo: bn, name: `Batch ${bn}` });
          ctx.sections.push(sec);
        }
        if (made.sectionAId && made.groupIds?.length) {
          const names = ['A1', 'A2', 'B1', 'B2'];
          made.groupIds.slice(0, 4).forEach((gid, i) => {
            const g = { id: gid, name: names[i], sectionId: names[i].startsWith('A') ? made.sectionAId! : made.sectionBId! };
            ctx.groups.push(g); groupByKey.set(`${g.sectionId}|${g.name}`, g);
          });
        }
        summary.errors.push(`Batch ${bn} was missing — created with sections A/B and lab groups A1/A2/B1/B2.`);
      } else {
        summary.errors.push(`Batch ${bn} could not be created: ${made.error ?? 'unknown'}`);
      }
    }
  }

  // 1) optional: clear existing entries of target batches (published + official)
  if (opts.replaceExisting) {
    for (const bn of batchNos) {
      const batch = batchByNo.get(bn);
      if (!batch) continue;
      const toDelete = db.routineEntries.filter((e) => e.batch_id === batch.id);
      for (const e of toDelete) {
        const r = await api.deleteRoutineEntry(e.id);
        if (!r.ok) summary.errors.push(`Could not remove existing entry ${e.id} (Batch ${bn}): ${r.error}`);
        else summary.deleted++;
      }
    }
  }

  // 2) upsert courses & faculty that do not exist yet (explicit — never assumed)
  const offerByCode = new Map(offers.map((o) => [o.code, o]));
  const ensureCourse = async (code: string, title: string, credits: number, type: OfferType, level: number) => {
    const existing = courseByCode.get(code);
    if (existing) return existing.id;
    const dept = type === 'ged' ? 'ged' : 'pharmacy';
    const row = {
      id: uuid(),
      code, title: title || code, credit: credits || 1,
      course_mode: type === 'lab' ? 'lab' : 'theory',
      department: dept, level: Math.max(1, Math.min(8, level)), is_active: true,
    };
    const r = await api.upsertRow('courses', row);
    if (!r.ok) { summary.errors.push(`Course ${code}: ${r.error}`); return null; }
    courseByCode.set(code, row as any);
    return row.id;
  };
  /** faculty_id is NOT NULL in routine_entries: PRJ / unsassigned classes are
   *  attached to one hidden department-coordinator row (never shown to students). */
  const COORD_INIT = 'PC';   // displayed as “Coordinator” on student cards
  const ensureFaculty = async (init: string) => {
    const key = (init || COORD_INIT).toUpperCase();
    const existing = facultyByInit.get(key);
    if (existing) return existing.id;
    const known: Record<string, string> = { MRS: 'MRS (English)', HTS: 'HTS (CSE)', MRA: 'MRA (Math & Statistics)', MK: 'MK (HEB)' };
    if (!init) {
      const row = {
        id: uuid(), name: 'Project & Training Coordinator', initials: COORD_INIT,
        designation: 'Project, Industrial Training & Assessment Coordinator', department: 'Pharmacy',
        faculty_type: 'nfe', is_active: false,   // hidden from the student faculty directory
      };
      const r = await api.upsertRow('faculty', row);
      if (!r.ok) { summary.errors.push(`Coordinator row: ${r.error}`); return null; }
      facultyByInit.set(COORD_INIT, row as any);
      return row.id;
    }
    // create only a proxy row — admin can rename later; generator never invents real names
    const row = {
      id: uuid(), name: known[init.toUpperCase()] ?? init,
      initials: init, designation: '', department: 'Pharmacy',
      faculty_type: 'guest', is_active: true,
    };
    const r = await api.upsertRow('faculty', row);
    if (!r.ok) { summary.errors.push(`Faculty ${init}: ${r.error}`); return null; }
    facultyByInit.set(key, row as any);
    return row.id;
  };

  // 3) insert classes
  for (const c of classes) {
    const batch = batchByNo.get(c.batchNo);
    const sec = secByKey.get(`${batch?.id}|${c.section}`);
    const courseId = await ensureCourse(c.code, c.title, c.credits, c.type, batch ? db.batches.find((b) => b.id === batch.id)?.current_level ?? 1 : 1);
    const facId = await ensureFaculty(c.faculty);
    const room = roomByCode.get(c.roomId ? ctx.rooms.find((r) => r.id === c.roomId)?.code ?? '' : '');
    if (!batch || !sec || !courseId || !facId || !room || !semId || !dayById.has(c.dayId) || !slotById.has(c.slotId)) {
      summary.errors.push(`Cannot resolve ${c.code} (${c.batchNo}${c.section}) — missing ids for publish.`);
      continue;
    }
    let groupId: string | null = null;
    if (c.groupId) {
      const g = ctx.groups.find((x) => x.id === c.groupId);
      groupId = g?.id ?? null;
    }
    const r = await api.saveRoutineEntry({
      semester_id: semId, batch_id: batch.id, section_id: sec.id, lab_group_id: groupId,
      course_id: courseId, faculty_id: facId, room_id: room.id, day_id: c.dayId, time_slot_id: c.slotId,
      class_type: c.type === 'lab' ? 'lab' : 'theory', status: 'active',
      notes: `Generated by Smart Routine Generator · Fall 2026${c.locked ? ' · LOCKED' : ''}`,
    });
    if (!r.ok || !r.entry) {
      summary.errors.push(`Insert failed for ${c.code} (${c.batchNo}${c.section}${c.groupId ? ' · ' + (ctx.groups.find((g) => g.id === c.groupId)?.name ?? '') : ''}): ${r.error ?? 'unknown'}`);
      continue;
    }
    summary.created++;
    (summary.publishedByBatch[String(c.batchNo)] ??= []).push(r.entry.id);
  }

  // 4) sync batch off-days
  if (opts.syncOffDays) {
    for (const bn of batchNos) {
      const batch = batchByNo.get(bn);
      const dayId = cfg.offDays[String(bn)];
      const day = dayById.get(dayId ?? '');
      if (!batch || !semId) continue;
      const r = await api.setOffDays(semId, batch.id, day ? [{ day_id: day.id, reason: 'Weekly off day (Smart Routine Generator)' }] : []);
      if (!r.ok) summary.offDayErrors.push(`Batch ${bn} off-day sync failed: ${r.error}`);
    }
  }

  summary.ok = summary.errors.length === 0;
  return summary;
}

/* ---------------- draft cache helpers ---------------- */

export interface GeneratorDraft {
  offers: OfferRow[];
  config: GenConfig;
  locks: ClassLock[];
  rotation: RotationState;
  lastResult: GenResult | null;
  publishedByBatch: Record<string, string[]>;
  lastPublishAt: string | null;
}
