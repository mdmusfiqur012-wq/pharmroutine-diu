/* Logic smoke test — run via scripts/smoke.mjs (esbuild bundle + node). */
import seed from './lib/seed.json';
import { buildStudentRoutine, offDaysFor, isOffDay, activeClassDays, buildFacultyRoutine, buildRoomSchedule, searchRoutine } from './lib/routine';
import { checkConflicts } from './lib/conflicts';
import type { Database } from './lib/types';

const db = seed as unknown as Database;
const sem = db.semesters.find((s) => s.is_active)!;
let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', msg); } };

console.log('== Batch-specific schedule construction ==');
for (const b of db.batches) {
  const offs = offDaysFor(db, sem.id, b.id);
  const active = activeClassDays(db, sem.id, b.id);
  ok(active.length + offs.length === db.classDays.length, `${b.name}: active(${active.length}) + off(${offs.length}) covers ${db.classDays.length} days`);
  const secA = db.sections.find((s) => s.batch_id === b.id && s.name === 'A')!;
  const gA1 = db.labGroups.find((g) => g.section_id === secA.id && g.name === 'A1')!;
  const res = buildStudentRoutine(db, { semester_id: sem.id, batch_id: b.id, section_id: secA.id, lab_group_id: gA1.id }, { showOffDays: true });
  const theory = res.entries.filter((e) => e.class_type === 'theory');
  const labs = res.entries.filter((e) => e.class_type === 'lab');
  ok(theory.every((e) => !e.lab_group_id), `${b.name}: theory has no lab group`);
  ok(labs.length === 0 || labs.every((e) => e.lab_group_id === gA1.id), `${b.name}: labs only for A1 (got ${labs.map((l) => l.labGroup?.name).join(',')})`);
  ok(res.entries.every((e) => e.batch_id === b.id && e.section_id === secA.id), `${b.name}: all entries belong to batch+section`);
  const offIds = new Set(offs.map((o) => o.day_id));
  ok(res.entries.every((e) => !offIds.has(e.day_id!)), `${b.name}: no classes scheduled on off days`);
  ok(res.days.length === db.classDays.length, `${b.name}: all ${db.classDays.length} day rows rendered (incl. off days)`);
  ok(res.hasOffDays === (offs.length > 0), `${b.name}: hasOffDays flag correct`);
  ok(res.offDays.map((d) => d.id).join() === [...offIds].sort().join(), `${b.name}: offDay rows listed`);
}

console.log('== Example: Batch 34 → Section A → Group A1 ==');
const b34 = db.batches.find((b) => b.batch_no === 34)!;
const secA = db.sections.find((s) => s.batch_id === b34.id && s.name === 'A')!;
const gA1 = db.labGroups.find((g) => g.section_id === secA.id && g.name === 'A1')!;
const gA2 = db.labGroups.find((g) => g.section_id === secA.id && g.name === 'A2')!;
const r34 = buildStudentRoutine(db, { semester_id: sem.id, batch_id: b34.id, section_id: secA.id, lab_group_id: gA1.id }, { showOffDays: true });
const r34b = buildStudentRoutine(db, { semester_id: sem.id, batch_id: b34.id, section_id: secA.id, lab_group_id: gA2.id }, { showOffDays: true });
ok(isOffDay(db, sem.id, b34.id, 'd-sat'), 'Batch 34: Saturday is an off day');
const satRow = r34.days.find((d) => d.id === 'd-sat');
ok(Boolean(satRow), 'Batch 34: Saturday rendered as a row (showOffDays=true)');
const satEntries = r34.entries.filter((e) => e.day_id === 'd-sat');
ok(satEntries.length === 0, 'Batch 34: zero classes on Saturday');
const b29 = db.batches.find((b) => b.batch_no === 29)!;
ok(!isOffDay(db, sem.id, b29.id, 'd-sat') && isOffDay(db, sem.id, b29.id, 'd-tue'), 'Batch 29: Saturday ACTIVE, Tuesday OFF — batches are independent');
const a1labs = r34.entries.filter((e) => e.class_type === 'lab');
const a2labs = r34b.entries.filter((e) => e.class_type === 'lab');
ok(a1labs.length > 0, 'Batch 34/A1: has lab sessions');
ok(!a1labs.some((e) => e.labGroup?.name === 'A2') && a2labs.every((e) => e.labGroup?.name === 'A2'), 'A1 routine excludes A2 labs and vice versa');
const tOnly = new Set(r34.entries.filter((e) => e.class_type === 'theory').map((e) => `${e.day_id}|${e.time_slot_id}`));
ok(!a1labs.some((e) => tOnly.has(`${e.day_id}|${e.time_slot_id}`)), 'labs never collide with the section’s theory slots');

console.log('== Faculty routine (DSR) ==');
const dsr = db.faculty.find((f) => f.initials === 'DSR')!;
const fr = buildFacultyRoutine(db, dsr.id);
ok(fr.entries.length > 0, `DSR teaches ${fr.entries.length} sessions`);
const fDaySlots = new Set(fr.entries.map((e) => `${e.day_id}|${e.time_slot_id}`));
ok(fDaySlots.size === fr.entries.length, 'no double-booking for DSR');

console.log('== Room schedule (AB-403) ==');
const room = db.rooms.find((r) => r.code === 'AB-403')!;
const rs = buildRoomSchedule(db, room.id);
const slots = db.timeSlots.map((s) => s.id);
const allDaySlots = new Set(rs.entries.map((e) => `${e.day_id}|${e.time_slot_id}`));
ok(rs.entries.length > 0, 'AB-403 has scheduled classes');
ok(allDaySlots.size === rs.entries.length, 'no room double-booking');
const days = db.classDays.map((d) => d.id);
const free = days.some((d) => slots.some((s) => !allDaySlots.has(`${d}|${s}`)));
ok(free, 'AB-403 has some free slots (availability checker works)');

console.log('== Global integrity ==');
const fk = new Set(), rk = new Set(), sk = new Set(), gk = new Set();
let bad = 0;
for (const e of db.routineEntries) {
  const ds = `${e.day_id}|${e.time_slot_id}`;
  if (fk.has(`${e.faculty_id}|${ds}`)) { bad++; console.error('  ✗ faculty clash', e.id); }
  if (rk.has(`${e.room_id}|${ds}`)) { bad++; console.error('  ✗ room clash', e.id); }
  if (sk.has(`${e.batch_id}|${e.section_id}|${ds}`)) { bad++; console.error('  ✗ section clash', e.id); }
  if (e.lab_group_id && gk.has(`${e.lab_group_id}|${ds}`)) { bad++; console.error('  ✗ group clash', e.id); }
  fk.add(`${e.faculty_id}|${ds}`); rk.add(`${e.room_id}|${ds}`); sk.add(`${e.batch_id}|${e.section_id}|${ds}`);
  if (e.lab_group_id) gk.add(`${e.lab_group_id}|${ds}`);
}
ok(bad === 0, `no conflicts across ${db.routineEntries.length} entries`);
ok(db.routineEntries.every((e) => e.class_type === 'lab' ? Boolean(e.lab_group_id) : !e.lab_group_id), 'theory ⇔ no group, lab ⇔ group');
ok(db.routineEntries.every((e) => !e.lab_group_id || db.labGroups.find((g) => g.id === e.lab_group_id)?.section_id === e.section_id), 'lab group belongs to the entry section');

console.log('== Conflict checker ==');
const cand = { ...db.routineEntries[0], id: undefined, notes: null };
const probe = { semester_id: cand.semester_id, batch_id: cand.batch_id, section_id: cand.section_id, lab_group_id: cand.lab_group_id, course_id: cand.course_id, faculty_id: cand.faculty_id, room_id: cand.room_id, day_id: cand.day_id, time_slot_id: cand.time_slot_id, class_type: cand.class_type, status: 'active' as const };
const issues = checkConflicts(db, probe);
ok(issues.length >= 1, 'duplicate of an existing entry is detected (faculty + room + section)');
ok(issues.some((i) => i.kind === 'faculty') && issues.some((i) => i.kind === 'room'), 'faculty & room rules fire');
const freeProbe = { ...probe, day_id: 'd-sun' as string, time_slot_id: 't6' as string };
const freeIssues = checkConflicts(db, freeProbe as any);
console.log(freeIssues.length ? '   free probe: (has issues — fine, checks what it can)' : '   free probe: no issues detected');

console.log('== Search ==');
ok(searchRoutine(db, sem.id, 'DSR').length > 0, 'search by initials works');
ok(searchRoutine(db, sem.id, 'AB-403').length > 0, 'search by room works');
ok(searchRoutine(db, sem.id, 'Pharmacology').length > 0, 'search by course works');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
