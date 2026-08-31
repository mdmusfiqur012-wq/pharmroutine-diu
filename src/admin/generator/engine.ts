/* ============================================================
 * Smart Routine Generator — constraint-based scheduling engine.
 *
 * Hard constraints (never violated):
 *   1. Batch-specific off-day      → no class of any kind that day
 *   2. Faculty day-off             → no class for that faculty
 *   3. Faculty availability        → 1 class per (day, slot) per faculty
 *   4. Section availability        → 1 class per (day, slot) per batch-section
 *      (a lab session's two group rows are placed together deliberately)
 *   5. Classroom / lab availability→ 1 class per room per slot
 *   6. Fixed faculty rules         → MUA never altered; DSS theory → AB-1 104;
 *      MSH theory → AB-1 406 (configurable)
 *   7. Laboratory group rotation   → A1/A2 (and B1/B2) swap labs every session
 *
 * Soft preferences (only after constraints): balanced days, no excessive
 * consecutive classes, small gaps, spread multi-session courses.
 * ============================================================ */
import type {
  OfferRow, GenCtx, GenConfig, ClassLock, RotationState, GenClass,
  ConflictIssue, ConflictReport, GenStats, GenResult, OfferType,
} from './types';

export interface GenOptions {
  onPhase?: (phase: string) => void;
  phaseDelay?: number;
}

interface Unit {
  uid: string;
  offer: OfferRow;
  sessionIdx: number;
  isLab: boolean;
  label: string;
  priority: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sessionsFor(offer: OfferRow, cfg: GenConfig): number {
  if (offer.type === 'lab') return 1;
  if (offer.type === 'prj') return 0;   // Project / Industrial Training / Oral Assessment are NEVER part of the weekly routine
  const c = Math.min(3, Math.max(1, Math.round(offer.credits)));
  return cfg.sessions[c as 1 | 2 | 3] ?? 1;
}

function priorityOf(o: OfferRow, cfg: GenConfig): number {
  let p = 0;
  if (cfg.lockedFaculty.includes(o.faculty)) p -= 3;
  else if (cfg.fixedRooms[o.faculty]) p -= 2;
  if (o.credits >= 3) p -= 1;
  return p;
}

export function buildUnits(offers: OfferRow[], cfg: GenConfig): Unit[] {
  const units: Unit[] = [];
  for (const offer of offers) {
    if (offer.type === 'lab') {
      units.push({ uid: `${offer.id}-lab`, offer, sessionIdx: 0, isLab: true, label: `${offer.code} · Lab`, priority: priorityOf(offer, cfg) });
    } else {
      const n = sessionsFor(offer, cfg);
      for (let i = 0; i < n; i++) {  // n = 0 → PRJ courses are excluded from scheduling
        units.push({ uid: `${offer.id}-s${i}`, offer, sessionIdx: i, isLab: false, label: `${offer.code}${offer.type === 'prj' ? ' · PRJ' : ''}`, priority: priorityOf(offer, cfg) });
      }
    }
  }
  return units;
}

/* ================================================================== */

export async function generateRoutine(
  ctx: GenCtx, offers: OfferRow[], cfg: GenConfig, locks: ClassLock[],
  rotation: RotationState, opts: GenOptions = {},
): Promise<GenResult> {
  const phase = async (name: string) => { opts.onPhase?.(name); if (opts.phaseDelay) await sleep(opts.phaseDelay); };

  await phase('Validating course data & rules');
  const dayById = new Map(ctx.days.map((d) => [d.id, d]));
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));
  const slotBySeq = (n: number) => ctx.slots.find((s) => s.seq === n);
  const roomById = new Map(ctx.rooms.map((r) => [r.id, r]));
  const roomByCode = new Map(ctx.rooms.map((r) => [r.code, r]));
  const dayNameToId = new Map(ctx.days.map((d) => [d.name.toLowerCase(), d.id]));
  const groupsBySection = new Map<string, { id: string; name: string }[]>();
  for (const g of ctx.groups) {
    const arr = groupsBySection.get(g.sectionId) ?? [];
    arr.push(g); groupsBySection.set(g.sectionId, arr);
  }
  const sectionsByBatch = new Map<number, { id: string; name: string }[]>();
  for (const s of ctx.sections) {
    const b = ctx.batches.find((x) => x.id === s.batchId);
    if (!b) continue;
    const arr = sectionsByBatch.get(b.batchNo) ?? [];
    arr.push(s); sectionsByBatch.set(b.batchNo, arr);
  }
  const batchByNo = new Map(ctx.batches.map((b) => [b.batchNo, b]));

  const issues: ConflictIssue[] = [];
  const classes: GenClass[] = [];

  /* occupancy */
  const secOcc = new Map<string, Set<string>>();     // `${day}|${slot}` → section ids fully occupied
  const facOcc = new Map<string, Set<string>>();     // `${day}|${slot}` → faculty initials
  const roomOcc = new Map<string, string>();         // `${day}|${slot}|${room}` → unit uid
  const isSecFree = (day: string, slot: string, secId: string) => !secOcc.get(`${day}|${slot}`)?.has(secId);
  const isFacFree = (day: string, slot: string, init: string) => !facOcc.get(`${day}|${slot}`)?.has(init);
  const isRoomFree = (day: string, slot: string, room: string) => !roomOcc.has(`${day}|${slot}|${room}`);
  const occupySection = (day: string, slot: string, secId: string) => {
    const s = secOcc.get(`${day}|${slot}`) ?? new Set(); s.add(secId); secOcc.set(`${day}|${slot}`, s);
  };
  const occupyFaculty = (day: string, slot: string, init: string) => {
    const s = facOcc.get(`${day}|${slot}`) ?? new Set(); s.add(init); facOcc.set(`${day}|${slot}`, s);
  };

  const batchOff = new Map<number, Set<string>>();
  for (const [bn, dayId] of Object.entries(cfg.offDays)) if (dayId) batchOff.set(Number(bn), new Set([dayId]));
  const facOff = new Map<string, Set<string>>();
  for (const [init, days] of Object.entries(cfg.facultyOff)) {
    const set = new Set<string>();
    for (const d of days) { const id = dayNameToId.get(String(d).toLowerCase()); if (id) set.add(id); }
    if (set.size) facOff.set(init, set);
  }

  const lockedByUid = new Map(locks.map((l) => [l.uid, l]));

  /* ---------- pure feasibility check (no mutation) ---------- */
  const feasibility = (unit: Unit, day: string, slot: string): { ok: boolean; roomId?: string; groupRooms?: Record<string, string>; reason?: string } => {
    const o = unit.offer;
    const batch = batchByNo.get(o.batchNo);
    if (!batch) return { ok: false, reason: `batch ${o.batchNo} not configured in the database` };
    if (batchOff.get(o.batchNo)?.has(day)) return { ok: false, reason: `${dayById.get(day)?.name} is Batch ${o.batchNo}'s off day` };
    if (o.faculty && facOff.get(o.faculty)?.has(day)) return { ok: false, reason: `${o.faculty} has ${dayById.get(day)?.name} off` };
    const sec = (sectionsByBatch.get(o.batchNo) ?? []).find((s) => s.name === o.section);
    if (!sec) return { ok: false, reason: `section ${o.batchNo}${o.section} missing` };

    if (unit.isLab) {
      const groups = groupsBySection.get(sec.id) ?? [];
      if (groups.length < 2) return { ok: false, reason: `section ${o.batchNo}${o.section} has ${groups.length} lab group(s)` };
      const allowedCodes = cfg.labRoomsByCourse[o.code]?.length ? cfg.labRoomsByCourse[o.code] : cfg.labRooms;
      const allowed = allowedCodes.map((c) => roomByCode.get(c)).filter((r): r is NonNullable<typeof r> => !!r && r.type !== 'theory');
      if (allowed.length < 2) return { ok: false, reason: `fewer than 2 lab rooms configured for ${o.code}` };
      if (!isSecFree(day, slot, sec.id)) return { ok: false, reason: `Batch ${o.batchNo}${o.section} already has a class in this slot` };
      if (o.faculty && !isFacFree(day, slot, o.faculty)) return { ok: false, reason: `${o.faculty} is teaching another class in this slot` };
      const rotKey = `${o.code}:${o.section}`;
      const prev = rotation[rotKey];
      const ordered = prev && prev.a !== prev.b ? [prev.b, prev.a] : null;
      if (ordered) {
        const r1 = roomById.get(ordered[0]), r2 = roomById.get(ordered[1]);
        if (r1 && r2 && isRoomFree(day, slot, r1.id) && isRoomFree(day, slot, r2.id)) {
          return { ok: true, roomId: r1.id, groupRooms: { [groups[0].id]: r1.id, [groups[1].id]: r2.id } };
        }
      }
      const usage = new Map<string, number>();
      for (const c of classes) if (c.type === 'lab') usage.set(c.roomId, (usage.get(c.roomId) ?? 0) + 1);
      const sorted = [...allowed].sort((a, b) => (usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0));
      for (const r1 of sorted) for (const r2 of sorted) {
        if (r1.id === r2.id) continue;
        if (isRoomFree(day, slot, r1.id) && isRoomFree(day, slot, r2.id)) {
          return { ok: true, roomId: r1.id, groupRooms: { [groups[0].id]: r1.id, [groups[1].id]: r2.id } };
        }
      }
      return { ok: false, reason: `no pair of lab rooms free in this slot` };
    }

    if (!isSecFree(day, slot, sec.id)) return { ok: false, reason: `Batch ${o.batchNo}${o.section} already busy` };
    if (o.faculty && !isFacFree(day, slot, o.faculty)) return { ok: false, reason: `${o.faculty} busy` };
    const forced = cfg.fixedRooms[o.faculty];
    const roomCodes = forced ? [forced] : cfg.theoryRooms;
    for (const code of roomCodes) {
      const room = roomByCode.get(code);
      if (room && isRoomFree(day, slot, room.id)) return { ok: true, roomId: room.id };
    }
    return { ok: false, reason: forced ? `fixed room ${forced} occupied` : `no classroom free` };
  };

  const commit = (unit: Unit, day: string, slot: string, roomId: string, groupRooms?: Record<string, string>, why: 'lock' | 'auto' = 'auto') => {
    const o = unit.offer;
    const sec = (sectionsByBatch.get(o.batchNo) ?? []).find((s) => s.name === o.section)!;
    occupySection(day, slot, sec.id); if (o.faculty) occupyFaculty(day, slot, o.faculty);
    if (groupRooms) {
      const groups = groupsBySection.get(sec.id) ?? [];
      const g1 = groups[0], g2 = groups[1];
      const r1 = groupRooms[g1.id], r2 = groupRooms[g2.id];
      roomOcc.set(`${day}|${slot}|${r1}`, unit.uid); roomOcc.set(`${day}|${slot}|${r2}`, unit.uid);
      for (const [g, room] of [[g1, r1], [g2, r2]] as const) {
        classes.push({
          uid: `${unit.uid}:${g.id}`, offerId: o.id, code: o.code, title: o.title, type: o.type, credits: o.credits,
          faculty: o.faculty, batchNo: o.batchNo, section: o.section, groupId: g.id, dayId: day, slotId: slot,
          roomId: room, locked: why === 'lock', labPartnerUid: `${unit.uid}:${g.id === g1.id ? g2.id : g1.id}`,
        });
      }
      rotation[`${o.code}:${o.section}`] = { a: r1, b: r2 };
    } else {
      roomOcc.set(`${day}|${slot}|${roomId}`, unit.uid);
      classes.push({
        uid: unit.uid, offerId: o.id, code: o.code, title: o.title, type: o.type, credits: o.credits,
        faculty: o.faculty, batchNo: o.batchNo, section: o.section, groupId: null, dayId: day, slotId: slot,
        roomId, locked: why === 'lock',
      });
    }
  };

  /* ---------- 1) locked classes first ---------- */
  await phase('Applying batch off-days');
  const allUnits = new Map(buildUnits(offers, cfg).map((u) => [u.uid, u]));
  for (const lock of locks) {
    const unit = allUnits.get(lock.uid);
    if (!unit) continue;
    const day = dayById.get(lock.dayId), slot = slotById.get(lock.slotId);
    if (!day || !slot) continue;
    const f = unit.isLab
      ? (() => {
        /*  Honour the exact rooms the admin pinned per lab group (MUA etc.),
            but never let two groups share a laboratory at the same slot. */
        const sec = (sectionsByBatch.get(unit.offer.batchNo) ?? []).find((x) => x.name === unit.offer.section);
        const groups = sec ? groupsBySection.get(sec.id) ?? [] : [];
        const g1 = groups[0], g2 = groups[1];
        if (lock.groupRooms && g1 && g2) {
          const allowedCodes = cfg.labRoomsByCourse[unit.offer.code]?.length ? cfg.labRoomsByCourse[unit.offer.code] : cfg.labRooms;
          const allowed = new Map<string, { id: string; code: string }>();
          for (const code of allowedCodes) { const r = roomByCode.get(code); if (r && r.type !== 'theory') allowed.set(r.id, r); }
          const r1 = lock.groupRooms[g1.id] ? roomById.get(lock.groupRooms[g1.id]) : undefined;
          const r1ok = r1 && allowed.has(r1.id) && isRoomFree(day.id, slot.id, r1.id);
          const r2 = lock.groupRooms[g2.id] ? roomById.get(lock.groupRooms[g2.id]) : undefined;
          const r2ok = r1ok && r2 && allowed.has(r2.id) && r2.id !== r1!.id && isRoomFree(day.id, slot.id, r2.id);
          if (r1ok && r2ok) return { ok: true, groupRooms: { [g1.id]: r1!.id, [g2.id]: r2!.id } };
          if (r1ok) {
            const second = [...allowed.values()].find((r) => r.id !== r1!.id && isRoomFree(day.id, slot.id, r.id));
            if (second) {
              issues.push({ severity: 'warning', kind: 'lab', message: `Locked class “${lock.label}”: ${g2.name} was published in ${roomByCode.get(r2 ? r2.code ?? '' : '')?.code ?? 'another lab'} at a different slot — paired A1/A2 labs must run together, so ${g2.name} now uses ${roomByCode.get(second.code)?.code ?? second.code} at the same time as ${g1.name}.` });
              return { ok: true, groupRooms: { [g1.id]: r1!.id, [g2.id]: second.id } };
            }
          }
        }
        return feasibility(unit, day.id, slot.id);
      })()
      : (() => {
        const base = feasibility(unit, day.id, slot.id);
        if (base.ok && lock.roomId && roomById.get(lock.roomId)) {
          const room = roomById.get(lock.roomId)!;
          const forced = cfg.fixedRooms[unit.offer.faculty];
          if (forced && roomByCode.get(forced)?.id !== room.id) return { ok: false, reason: `${unit.offer.faculty} must use ${forced}` };
          if (!isRoomFree(day.id, slot.id, room.id)) return { ok: false, reason: `${room.code} occupied at that time` };
          return { ok: true, roomId: room.id };
        }
        return base;
      })();
    if (f.ok && (unit.isLab ? f.groupRooms : f.roomId)) {
      commit(unit, day.id, slot.id, f.roomId ?? '', f.groupRooms, 'lock');
    } else {
      issues.push({ severity: 'warning', kind: unit.isLab ? 'lab' : 'batch', message: `Locked class “${lock.label}” conflicts (${f.reason ?? 'check lock'}) — adjust or unlock it.` });
    }
  }

  /* ---------- 2) theory / GED / PRJ with balance scoring ---------- */
  await phase('Locking fixed faculty & classroom rules');
  const units = buildUnits(offers, cfg).filter((u) => !lockedByUid.has(u.uid));
  const loadOf = (init: string) => offers.filter((o) => o.faculty === init && o.type !== 'lab').length;
  units.sort((a, b) => a.priority - b.priority || loadOf(b.offer.faculty) - loadOf(a.offer.faculty) || a.offer.batchNo - b.offer.batchNo || (a.offer.section < b.offer.section ? -1 : 1));

  const dayLoad = (bn: number, sec: string, dayId: string) => classes.filter((c) => c.batchNo === bn && c.section === sec && c.dayId === dayId).length;
  const facDayLoad = (init: string, dayId: string) => classes.filter((c) => c.faculty === init && c.dayId === dayId).length;

  await phase('Allocating theory classes');
  for (const unit of units) {
    if (unit.isLab) continue;
    let best: { day: string; slot: string; roomId: string; score: number } | null = null;
    const fails: string[] = [];
    for (const day of ctx.days) {
      for (const slot of ctx.slots) {
        const f = feasibility(unit, day.id, slot.id);
        if (!f.ok || !f.roomId) { fails.push(f.reason ?? 'no slot'); continue; }
        let score = 0;
        score += dayLoad(unit.offer.batchNo, unit.offer.section, day.id) * 10;
        score += facDayLoad(unit.offer.faculty, day.id) * 8;
        /* credit-based frequency preference: a course's sessions belong on
           DIFFERENT days, and not unnecessarily close together */
        const ownSessions = classes.filter((c) => c.code === unit.offer.code && c.batchNo === unit.offer.batchNo && c.section === unit.offer.section);
        if (ownSessions.length) {
          for (const os of ownSessions) {
            const gap = Math.abs((dayById.get(os.dayId)?.seq ?? 0) - (dayById.get(day.id)?.seq ?? 0));
            if (os.dayId === day.id) score += 30;      // same day as the course's other session
            else if (gap <= 1) score += 6;             // back-to-back days
            else if (gap <= 2) score += 2;             // one day in between
          }
        }
        const prevSlot = slotBySeq(slot.seq - 1), nextSlot = slotBySeq(slot.seq + 1);
        const prevBusy = prevSlot && classes.some((c) => c.batchNo === unit.offer.batchNo && c.section === unit.offer.section && c.dayId === day.id && c.slotId === prevSlot.id);
        const nextBusy = nextSlot && classes.some((c) => c.batchNo === unit.offer.batchNo && c.section === unit.offer.section && c.dayId === day.id && c.slotId === nextSlot.id);
        if (prevBusy) score -= 2;                                   // continuation block is fine
        else if (dayLoad(unit.offer.batchNo, unit.offer.section, day.id) > 0) score += 2; // hole at block start
        if (!nextBusy && dayLoad(unit.offer.batchNo, unit.offer.section, day.id) > 0) score += 1; // trailing gap
        if (!best || score < best.score) best = { day: day.id, slot: slot.id, roomId: f.roomId, score };
      }
    }
    if (best) commit(unit, best.day, best.slot, best.roomId);
    else issues.push({ severity: 'error', kind: 'data', message: `${unit.label} (${unit.offer.batchNo}${unit.offer.section}) cannot be scheduled — ${fails[0] ?? 'no slot available'}`, unit: unit.label });
  }

  /* ---------- 3) laboratory sessions with group rotation ---------- */
  await phase('Allocating laboratory sessions');
  const labs = units.filter((u) => u.isLab);
  for (const unit of labs) {
    let placed = false; const fails: string[] = [];
    for (const day of ctx.days) {
      for (const slot of ctx.slots) {
        const f = feasibility(unit, day.id, slot.id);
        if (f.ok && f.groupRooms) { commit(unit, day.id, slot.id, f.roomId ?? '', f.groupRooms); placed = true; break; }
        fails.push(f.reason ?? 'no slot');
      }
      if (placed) break;
    }
    if (!placed) issues.push({ severity: 'error', kind: 'lab', message: `Laboratory ${unit.offer.code} (${unit.offer.batchNo}${unit.offer.section}) cannot be scheduled — ${fails[0] ?? 'no slot available'}`, unit: unit.label });
  }

  /* ---------- 4) independent verification ---------- */
  await phase('Checking faculty, classroom & lab conflicts');
  const reportIssues = [...issues, ...verifySchedule(ctx, classes, cfg, offers), ...verifyFrequency(ctx, offers, classes, cfg)];

  const sectionsUsed = new Set(classes.map((c) => `${c.batchNo}${c.section}`)).size;
  const stats: GenStats = {
    theory: classes.filter((c) => c.type === 'theory').length + classes.filter((c) => c.type === 'ged').length,
    labs: classes.filter((c) => c.type === 'lab').length,
    prj: classes.filter((c) => c.type === 'prj').length,
    batches: new Set(classes.map((c) => c.batchNo)).size,
    facultyUsed: new Set(classes.map((c) => c.faculty).filter(Boolean)).size,
    roomsUsed: new Set(classes.map((c) => c.roomId)).size,
    utilization: sectionsUsed ? Math.round((classes.length / (ctx.days.length * ctx.slots.length * sectionsUsed)) * 100) : 0,
  };

  return {
    classes: [...classes].sort((a, b) => a.batchNo - b.batchNo || (a.section < b.section ? -1 : a.section > b.section ? 1 : 0) || (slotById.get(a.slotId)?.seq ?? 0) - (slotById.get(b.slotId)?.seq ?? 0) || a.code.localeCompare(b.code)),
    report: { issues: reportIssues, scheduled: classes.length, failed: reportIssues.filter((i) => i.severity === 'error').length, ok: !reportIssues.some((i) => i.severity === 'error') },
    stats, rotation,
  };
}

/* ================================================================== */
/* Independent verification — also used after manual overrides         */
/* ================================================================== */

/* ==================================================================
 * Credit-Based Class Frequency System
 * ------------------------------------------------------------------
 * The OFFICIAL course offer is the single source of truth: every row
 * carries its credit value + theory/lab type. From those numbers the
 * generator derives the required weekly frequency — 3-credit theory
 * → 2 classes/week, 2-credit theory → 1 class/week, 1-credit GED/PRJ
 * → 1 class/week, practicals → one paired laboratory session (A1/A2
 * or B1/B2 groups together) — and every scheduled class is matched
 * back against the requirement before anything can be published.
 * ================================================================== */

export interface FreqGroup {
  name: string;          // A1 / A2 / B1 / B2
  scheduled: boolean;
  dayId?: string;
  slotId?: string;
  roomCode?: string;
}

export interface FreqRow {
  code: string;
  title: string;
  credits: number;
  type: OfferType;
  batchNo: number;
  section: string;
  faculty: string;
  required: number;      // weekly sessions required (0 for practicals)
  scheduled: number;     // weekly sessions actually scheduled
  groups: FreqGroup[];   // practicals only: per-group session status
  ok: boolean;
}

export function frequencyRows(ctx: GenCtx, offers: OfferRow[], classes: GenClass[], cfg: GenConfig): FreqRow[] {
  const dayName = new Map(ctx.days.map((d) => [d.id, d.short]));
  const roomCode = new Map(ctx.rooms.map((r) => [r.id, r.code]));
  const groupsBySection = new Map<string, { id: string; name: string }[]>();
  for (const g of ctx.groups) {
    const arr = groupsBySection.get(g.sectionId) ?? [];
    arr.push(g); groupsBySection.set(g.sectionId, arr);
  }
  const sectionsByBatch = new Map<number, { id: string; name: string }[]>();
  for (const sec of ctx.sections) {
    const b = ctx.batches.find((x) => x.id === sec.batchId);
    if (!b) continue;
    const arr = sectionsByBatch.get(b.batchNo) ?? [];
    arr.push(sec); sectionsByBatch.set(b.batchNo, arr);
  }
  const rows: FreqRow[] = [];
  for (const o of offers) {
    const sec = (sectionsByBatch.get(o.batchNo) ?? []).find((x) => x.name === o.section);
    if (o.type === 'lab') {
      const groups = (sec ? groupsBySection.get(sec.id) ?? [] : []).slice();
      const groupRows = classes.filter((c) => c.code === o.code && c.batchNo === o.batchNo && c.section === o.section && c.groupId);
      const g: FreqGroup[] = groups.map((gr) => {
        const row = groupRows.find((c) => c.groupId === gr.id);
        return { name: gr.name, scheduled: !!row, dayId: row?.dayId, slotId: row?.slotId, roomCode: row ? roomCode.get(row.roomId) : undefined };
      });
      rows.push({
        code: o.code, title: o.title, credits: o.credits, type: 'lab', batchNo: o.batchNo, section: o.section, faculty: o.faculty,
        required: 0, scheduled: groupRows.length, groups: g, ok: g.length > 0 && g.every((x) => x.scheduled),
      });
    } else {
      const mine = classes.filter((c) => c.code === o.code && c.batchNo === o.batchNo && c.section === o.section && !c.groupId);
      const required = sessionsFor(o, cfg);
      rows.push({
        code: o.code, title: o.title, credits: o.credits, type: o.type, batchNo: o.batchNo, section: o.section, faculty: o.faculty,
        required, scheduled: mine.length, groups: [], ok: mine.length === required,
      });
    }
  }
  return rows;
}

/** Every course must meet its credit-based weekly frequency — otherwise the
 *  routine is incomplete and must never be published. */
export function verifyFrequency(ctx: GenCtx, offers: OfferRow[], classes: GenClass[], cfg: GenConfig): ConflictIssue[] {
  const issues: ConflictIssue[] = [];
  for (const row of frequencyRows(ctx, offers, classes, cfg)) {
    if (row.type === 'lab') {
      const missing = row.groups.filter((g) => !g.scheduled);
      if (missing.length) issues.push({
        severity: 'error', kind: 'lab',
        message: `${row.code} practical (Batch ${row.batchNo}${row.section}) — group ${missing.map((x) => x.name).join(', ')} has NO laboratory session scheduled.`,
      });
    } else if (row.scheduled !== row.required) {
      issues.push({
        severity: 'error', kind: 'data',
        message: `${row.code} — ${row.title || 'untitled'} (${row.batchNo}${row.section}) — ${row.credits}-credit ${row.type}: requires ${row.required} class(es)/week, scheduled ${row.scheduled}.`,
      });
    }
  }
  return issues;
}

export function verifySchedule(ctx: GenCtx, classes: GenClass[], cfg: GenConfig, offers: OfferRow[]): ConflictIssue[] {
  const issues: ConflictIssue[] = [];
  const dayById = new Map(ctx.days.map((d) => [d.id, d]));
  const slotById = new Map(ctx.slots.map((s) => [s.id, s]));
  const roomCode = (id: string) => ctx.rooms.find((r) => r.id === id)?.code ?? id;

  const byFaculty = new Map<string, Map<string, GenClass[]>>();
  const bySection = new Map<string, Map<string, GenClass[]>>();
  const byRoom = new Map<string, Map<string, GenClass[]>>();
  for (const c of classes) {
    const key = `${c.dayId}|${c.slotId}`;
    if (c.faculty) push(byFaculty, c.faculty, key, c); push(bySection, `${c.batchNo}${c.section}`, key, c); push(byRoom, c.roomId, key, c);
  }
  function push(m: Map<string, Map<string, GenClass[]>>, group: string, key: string, c: GenClass) {
    const inner = m.get(group) ?? new Map<string, GenClass[]>(); const arr = inner.get(key) ?? []; arr.push(c); inner.set(key, arr); m.set(group, inner);
  }
  /** two rows are the two lab halves of one session */
  const partners = (a: GenClass, b: GenClass) => a.labPartnerUid === b.uid && b.labPartnerUid === a.uid;
  const checkOverlap = (m: Map<string, Map<string, GenClass[]>>, kind: string, name: string) => {
    for (const inner of m.values()) {
      for (const [key, arr] of inner) {
        if (arr.length < 2) continue;
        const [dayId, slotId] = key.split('|');
        const when = `${dayById.get(dayId)?.name} ${slotById.get(slotId)?.label ?? slotId}`;
        if (kind === 'room') {
          /* no two classes may share a physical room — lab halves must use different labs */
          const rooms = new Set(arr.map((c) => c.roomId));
          if (rooms.size > 1) issues.push({ severity: 'error', kind: 'room', message: `${name}: ${arr[0].code} & ${arr[1].code} share ${roomCode(arr[0].roomId)} at the same time (${when}).` });
          continue;
        }
        /* faculty / section: one person (or batch) at one slot = one session;
           the two halves of a paired lab are one session */
        const sessions = new Set<string>();
        for (const c of arr) {
          const mate = arr.find((o) => o !== c && partners(c, o));
          sessions.add(mate ? [c.uid, mate.uid].sort().join('|') : c.uid);
        }
        if (sessions.size > 1) {
          const [a, b] = arr.filter((c) => !arr.some((o) => o !== c && partners(c, o)));
          issues.push({ severity: 'error', kind: kind as any, message: `${name}: ${a?.code ?? arr[0].code} & ${b?.code ?? arr[1].code} at the same time (${when}).` });
        }
      }
    }
  };
  checkOverlap(byFaculty, 'faculty', 'Faculty');
  checkOverlap(bySection, 'batch', 'Section');
  checkOverlap(byRoom, 'room', 'Room');

  for (const [init, code] of Object.entries(cfg.fixedRooms)) {
    for (const c of classes) {
      if (c.faculty === init && c.type !== 'lab' && roomCode(c.roomId) !== code)
        issues.push({ severity: 'error', kind: 'fixed', message: `${init} theory must be in ${code} — ${c.code} placed in ${roomCode(c.roomId)}.` });
    }
  }
  const byUid = new Map(classes.map((c) => [c.uid, c]));
  for (const c of classes) {
    if (c.type === 'lab' && !c.groupId) issues.push({ severity: 'error', kind: 'lab', message: `${c.code} lab row has no lab group.` });
    if (c.labPartnerUid) {
      const mate = byUid.get(c.labPartnerUid);
      if (!mate || mate.labPartnerUid !== c.uid) issues.push({ severity: 'error', kind: 'lab', message: `${c.code} lab pair is broken — partner row missing.` });
      else if (mate.dayId !== c.dayId || mate.slotId !== c.slotId) issues.push({ severity: 'error', kind: 'lab', message: `${c.code} lab halves scheduled at different times (${dayById.get(c.dayId)?.name} vs ${dayById.get(mate.dayId)?.name}).` });
    }
    const off = cfg.offDays[String(c.batchNo)];
    if (off && c.dayId === off) issues.push({ severity: 'error', kind: 'offday', message: `${c.code} scheduled on Batch ${c.batchNo}'s off day (${dayById.get(off)?.name}).` });
    const dayName = dayById.get(c.dayId)?.name ?? '';
    if (c.faculty && (cfg.facultyOff[c.faculty] ?? []).some((d) => d.toLowerCase() === dayName.toLowerCase()))
      issues.push({ severity: 'error', kind: 'faculty', message: `${c.faculty} is off on ${dayName} but teaches ${c.code}.` });
  }
  const offerCodes = new Set(offers.map((o) => o.code));
  for (const c of classes) if (!offerCodes.has(c.code)) issues.push({ severity: 'warning', kind: 'data', message: `${c.code} is not part of the imported course offer.` });
  return issues;
}

export function slotLabel(ctx: GenCtx, slotId: string): string {
  return ctx.slots.find((s) => s.id === slotId)?.label ?? slotId;
}

/* ---------------- manual override validation ---------------- */

export interface OverrideProbe { ok: boolean; reason?: string }

/** Validate a manual change against the current schedule (pure, non-mutating). */
export function probeMove(ctx: GenCtx, classes: GenClass[], cfg: GenConfig, target: GenClass, dayId: string, slotId: string, roomId: string): OverrideProbe {
  const dayName = ctx.days.find((d) => d.id === dayId)?.name?.toLowerCase() ?? '';
  if (cfg.offDays[String(target.batchNo)] === dayId) return { ok: false, reason: `Batch ${target.batchNo} has that day off` };
  if ((cfg.facultyOff[target.faculty] ?? []).some((d) => d.toLowerCase() === dayName)) return { ok: false, reason: `${target.faculty} is off on ${dayName}` };
  const forced = cfg.fixedRooms[target.faculty];
  if (forced && target.type !== 'lab' && ctx.rooms.find((r) => r.code === forced)?.id !== roomId) return { ok: false, reason: `${target.faculty} theory must use ${forced}` };
  const key = `${dayId}|${slotId}`;
  const others = classes.filter((c) => c.uid !== target.uid);
  const facBusy = others.find((c) => c.faculty === target.faculty && `${c.dayId}|${c.slotId}` === key);
  if (facBusy) return { ok: false, reason: `${target.faculty} already teaches ${facBusy.code} in that slot` };
  const secBusy = others.find((c) => c.batchNo === target.batchNo && c.section === target.section && `${c.dayId}|${c.slotId}` === key && c.labPartnerUid !== target.uid);
  if (secBusy) return { ok: false, reason: `Batch ${target.batchNo}${target.section} already has ${secBusy.code} in that slot` };
  const roomBusy = others.find((c) => c.roomId === roomId && `${c.dayId}|${c.slotId}` === key);
  if (roomBusy) return { ok: false, reason: `Room already used by ${roomBusy.code} in that slot` };
  return { ok: true };
}
