import {
  COMBINED_LAB,
  type Database, type JoinedEntry, type RoutineSelection, type ClassDay, type TimeSlot,
  type RoutineEntry, type BatchOffDay, type ClassColors, type EntryStatus, type ClassType,
} from './types';
import { joinEntries, joinAll } from './conflicts';

/* ============================================================
 * Dynamic, batch-specific routine generation.
 * The portal NEVER assumes every batch shares the same days —
 * active days, off days and classes are all resolved per batch.
 * ============================================================ */

export interface RoutineResult {
  entries: JoinedEntry[];                      // filtered, joined
  days: ClassDay[];                            // day rows (order matters)
  offDays: ClassDay[];                         // official off days of this batch
  slots: TimeSlot[];
  allDays: ClassDay[];
  hasOffDays: boolean;
}

/** Official off days for a semester + batch (from the DB, never hard-coded). */
export function offDaysFor(db: Database, semesterId: string, batchId: string): BatchOffDay[] {
  return db.batchOffDays.filter((o) => o.semester_id === semesterId && o.batch_id === batchId && o.is_active);
}

export function isOffDay(db: Database, semesterId: string, batchId: string, dayId: string): boolean {
  return offDaysFor(db, semesterId, batchId).some((o) => o.day_id === dayId);
}

export function activeClassDays(db: Database, semesterId: string, batchId: string): ClassDay[] {
  const offs = new Set(offDaysFor(db, semesterId, batchId).map((o) => o.day_id));
  return [...db.classDays]
    .filter((d) => d.is_active)
    .sort((a, b) => a.sequence - b.sequence)
    .filter((d) => !offs.has(d.id));
}

/**
 * Build the personalized routine for a student selection.
 * Theory  → always included (batch + section).
 * Labs    → only when the lab group matches the selected group.
 */
export function buildStudentRoutine(
  db: Database,
  sel: RoutineSelection,
  opts: { showOffDays: boolean } = { showOffDays: true },
): RoutineResult {
  const offs = offDaysFor(db, sel.semester_id, sel.batch_id);
  const offDayIds = new Set(offs.map((o) => o.day_id));

  /* combined mode (e.g. "Group B1 + B2"): all lab groups of the section */
  const combinedGroupIds =
    sel.lab_group_id === COMBINED_LAB
      ? new Set(db.labGroups.filter((g) => g.section_id === sel.section_id).map((g) => g.id))
      : null;

  const entries = db.routineEntries
    .filter((e) => e.semester_id === sel.semester_id && e.batch_id === sel.batch_id && e.section_id === sel.section_id)
    .filter((e) => {
      if (!e.lab_group_id) return true; /* theory — always included */
      if (combinedGroupIds) return combinedGroupIds.has(e.lab_group_id);
      return e.lab_group_id === sel.lab_group_id;
    })
    .map((e) => joinEntries(db, e));

  const allDays = [...db.classDays].filter((d) => d.is_active).sort((a, b) => a.sequence - b.sequence);

  const days = opts.showOffDays
    ? allDays
    : allDays.filter((d) => !offDayIds.has(d.id));

  return {
    entries,
    days: days as ClassDay[],
    offDays: allDays.filter((d) => offDayIds.has(d.id)),
    slots: [...db.timeSlots].filter((t) => t.is_active).sort((a, b) => a.sequence - b.sequence),
    allDays,
    hasOffDays: offs.length > 0,
  };
}

export function entriesOnDay(entries: JoinedEntry[], dayId: string): JoinedEntry[] {
  return entries
    .filter((e) => e.day_id === dayId)
    .sort((a, b) => (a.timeSlot?.sequence ?? 0) - (b.timeSlot?.sequence ?? 0));
}

export function entriesInSlot(entries: JoinedEntry[], dayId: string, slotId: string): JoinedEntry[] {
  return entries.filter((e) => e.day_id === dayId && e.time_slot_id === slotId);
}

/* ---------------- Faculty routine ---------------- */

export function buildFacultyRoutine(db: Database, facultyId: string, semesterId?: string): RoutineResult {
  const entries = db.routineEntries
    .filter((e) => e.faculty_id === facultyId)
    .filter((e) => (semesterId ? e.semester_id === semesterId : true))
    .map((e) => joinEntries(db, e));
  const daysWithClasses = new Set(entries.map((e) => e.day_id!));
  return {
    entries,
    days: [...db.classDays].filter((d) => d.is_active && daysWithClasses.has(d.id)).sort((a, b) => a.sequence - b.sequence),
    offDays: [],
    slots: [...db.timeSlots].filter((t) => t.is_active).sort((a, b) => a.sequence - b.sequence),
    allDays: [...db.classDays],
    hasOffDays: false,
  };
}

/* ---------------- Room schedule ---------------- */

export function buildRoomSchedule(db: Database, roomId: string, semesterId?: string): RoutineResult {
  const entries = db.routineEntries
    .filter((e) => e.room_id === roomId)
    .filter((e) => (semesterId ? e.semester_id === semesterId : true))
    .map((e) => joinEntries(db, e));
  const daysWithClasses = new Set(entries.map((e) => e.day_id!));
  return {
    entries,
    days: [...db.classDays].filter((d) => d.is_active && daysWithClasses.has(d.id)).sort((a, b) => a.sequence - b.sequence),
    offDays: [],
    slots: [...db.timeSlots].filter((t) => t.is_active).sort((a, b) => a.sequence - b.sequence),
    allDays: [...db.classDays],
    hasOffDays: false,
  };
}

/* ---------------- Filter helpers ---------------- */

export type ClassFilterKey = 'all' | 'theory' | 'lab';

export function filterClasses(entries: JoinedEntry[], f: ClassFilterKey): JoinedEntry[] {
  if (f === 'theory') return entries.filter((e) => e.class_type === 'theory');
  if (f === 'lab') return entries.filter((e) => e.class_type === 'lab');
  return entries;
}

export const STATUS_META: Record<EntryStatus, { label: string; classes: string }> = {
  active: { label: 'Scheduled', classes: '' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  rescheduled: { label: 'Rescheduled', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
};

export function classColor(entry: JoinedEntry, colors: ClassColors): string {
  if (entry.status === 'cancelled') return colors.cancelled;
  if (entry.status === 'rescheduled') return colors.rescheduled;
  const course = entry.course;
  if (!course) return colors.theory;
  if (course.department === 'ged') return colors.ged;
  if (course.department === 'nfe') return colors.nfe;
  if (course.department === 'agriculture') return colors.agriculture;
  if (entry.faculty?.faculty_type === 'guest') return colors.guest;
  if (entry.class_type === 'lab') return colors.lab;
  return colors.theory;
}

export function colorForType(type: ClassType, db: Database): string {
  const settings = db.settings.find((s) => s.key === 'app');
  const colors: ClassColors = settings
    ? (JSON.parse(settings.value) as any).colors
    : { theory: '#1d4ed8', lab: '#16a34a', guest: '#7c3aed', ged: '#0e7490', nfe: '#0f766e', agriculture: '#65a30d', cancelled: '#dc2626', rescheduled: '#d97706' };
  return type === 'lab' ? colors.lab : colors.theory;
}

/* ---------------- Search ---------------- */

export interface SearchQuery {
  q: string;
  faculty?: string;
  course?: string;
  room?: string;
}

export function searchRoutine(db: Database, semesterId: string, q: string): JoinedEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits = db.routineEntries
    .filter((e) => e.semester_id === semesterId)
    .map((e) => joinEntries(db, e))
    .filter((e) => {
      const hay = [
        e.course?.title, e.course?.code, e.faculty?.name, e.faculty?.initials,
        e.room?.code, e.batch?.name, e.section?.name, e.labGroup?.name,
        e.day?.name, e.timeSlot?.label,
      ]
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, 80);
  return hits.sort((a, b) => (a.day?.sequence ?? 0) - (b.day?.sequence ?? 0) || (a.timeSlot?.sequence ?? 0) - (b.timeSlot?.sequence ?? 0));
}

/* ---------------- Stats ---------------- */

export function batchStats(db: Database, semesterId: string, batchId: string) {
  const entries = db.routineEntries.filter((e) => e.semester_id === semesterId && e.batch_id === batchId);
  const days = new Set(entries.map((e) => e.day_id));
  const courses = new Set(entries.map((e) => e.course_id));
  const faculty = new Set(entries.map((e) => e.faculty_id));
  return { classes: entries.length, days: days.size, courses: courses.size, faculty: faculty.size };
}

export function attachDb(entries: JoinedEntry[], db: Database): JoinedEntry[] {
  return joinAll(db, entries.map((e) => e));
}
