import type { Database, JoinedEntry, ConflictIssue, RoutineEntry } from './types';

/* ============================================================
 * Schedule conflict detection.
 * Rules:
 *   1. A faculty member cannot teach two classes in the same slot.
 *   2. A room cannot host two classes in the same slot.
 *   3. A section cannot have two classes in the same slot
 *      (two theory classes, or a theory + a lab of its own group).
 *   4. A laboratory group (A1/A2/B1/B2) cannot have two lab
 *      sessions in the same slot.
 * ============================================================ */

export function joinEntries(db: Database, entry: RoutineEntry): JoinedEntry {
  return {
    ...entry,
    semester: db.semesters.find((s) => s.id === entry.semester_id),
    batch: db.batches.find((b) => b.id === entry.batch_id),
    section: db.sections.find((s) => s.id === entry.section_id),
    labGroup: entry.lab_group_id ? db.labGroups.find((g) => g.id === entry.lab_group_id) ?? null : null,
    course: db.courses.find((c) => c.id === entry.course_id),
    faculty: db.faculty.find((f) => f.id === entry.faculty_id),
    room: db.rooms.find((r) => r.id === entry.room_id),
    day: db.classDays.find((d) => d.id === entry.day_id),
    timeSlot: db.timeSlots.find((t) => t.id === entry.time_slot_id),
  };
}

export function joinAll(db: Database, entries: RoutineEntry[]): JoinedEntry[] {
  const m = new Map<string, JoinedEntry>();
  return entries.map((e) => {
    if (!m.has(e.id)) m.set(e.id, joinEntries(db, e));
    return m.get(e.id)!;
  });
}

export function checkConflicts(
  db: Database,
  candidate: Partial<RoutineEntry>,
  excludeId?: string,
  existing: RoutineEntry[] = db.routineEntries,
): ConflictIssue[] {
  const issues: ConflictIssue[] = [];
  const others = existing.filter((e) => e.id !== excludeId && (e.faculty_id || e.room_id));

  const sameSlot = (e: RoutineEntry) =>
    e.day_id === candidate.day_id && e.time_slot_id === candidate.time_slot_id && e.status !== 'cancelled';

  // 1. faculty conflict
  if (candidate.faculty_id) {
    const hit = others.find((e) => e.faculty_id === candidate.faculty_id && sameSlot(e));
    if (hit) {
      const j = joinEntries(db, hit);
      issues.push({
        kind: 'faculty',
        message: `${j.faculty?.name ?? candidate.faculty_id} is already assigned to ${j.course?.title ?? 'a class'} (${j.batch?.name} Section ${j.section?.name}${j.labGroup ? ', Group ' + j.labGroup.name : ''}) in ${j.room?.code ?? '?'} on ${j.day?.name ?? '?'} (${j.timeSlot?.label ?? '?'}).`,
        conflictWith: j,
      });
    }
  }

  // 2. room conflict
  if (candidate.room_id) {
    const hit = others.find((e) => e.room_id === candidate.room_id && sameSlot(e));
    if (hit) {
      const j = joinEntries(db, hit);
      issues.push({
        kind: 'room',
        message: `${j.room?.code ?? 'Room'} is already occupied by ${j.course?.title ?? 'a class'} (${j.batch?.name} Section ${j.section?.name}${j.labGroup ? ', Group ' + j.labGroup.name : ''}) with ${j.faculty?.name ?? 'faculty'} in that slot.`,
        conflictWith: j,
      });
    }
  }

  // 3. section conflict (theory + any class of the same section occupying the slot)
  if (candidate.batch_id && candidate.section_id) {
    const hit = others.find(
      (e) =>
        e.batch_id === candidate.batch_id &&
        e.section_id === candidate.section_id &&
        sameSlot(e),
    );
    if (hit) {
      const j = joinEntries(db, hit);
      issues.push({
        kind: 'section',
        message: `${j.batch?.name} Section ${j.section?.name} already has ${j.course?.title ?? 'a class'}${j.labGroup ? ' (Group ' + j.labGroup.name + ')' : ''} in ${j.timeSlot?.label ?? 'that slot'}. A section cannot have two classes at the same time.`,
        conflictWith: j,
      });
    }
  }

  // 4. lab-group conflict (only meaningful for labs)
  if (candidate.lab_group_id) {
    const hit = others.find((e) => e.lab_group_id === candidate.lab_group_id && sameSlot(e));
    if (hit) {
      const j = joinEntries(db, hit);
      issues.push({
        kind: 'lab_group',
        message: `Laboratory group ${j.labGroup?.name ?? '?'} already has ${j.course?.title ?? 'a lab'} in that slot. A group cannot attend two lab sessions at the same time.`,
        conflictWith: j,
      });
    }
  }

  // rule on cancelled candidate
  return issues;
}

export function conflictSummary(issues: ConflictIssue[]): string {
  const kinds: Record<string, string> = {
    faculty: 'Faculty double-booking',
    room: 'Room double-booking',
    section: 'Section overlap',
    lab_group: 'Lab group overlap',
  };
  return [...new Set(issues.map((i) => kinds[i.kind]))].join(', ');
}
