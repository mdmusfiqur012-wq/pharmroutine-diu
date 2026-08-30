/* ============================================================
 * Generate src/lib/seed.json from the OFFICIAL department sheet
 * (scripts/official-routine.json — extracted 1:1 from
 *  "Class Routine Fall 2026 V1" Google Sheet).
 *
 *   node scripts/generate-seed.mjs
 *
 * Reproduces the official routine exactly: same rooms, days,
 * slots, classes, faculty, off days. No guessing, no
 * re-scheduling.
 * ============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OFF = JSON.parse(readFileSync(path.join('scripts', 'official-routine.json'), 'utf8'));

const SEMESTER = OFF.semester;
const DAYS = OFF.days.map((d) => ({ ...d, short_name: d.name.slice(0, 3), is_active: true }));
const SLOTS = OFF.slots.map((s, i) => ({ id: s.id, label: s.label, start_time: s.start, end_time: s.end, sequence: i + 1, is_active: true }));

const ROOMS = OFF.rooms.map((r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  building: r.code.startsWith('AB-1') ? 'Academic Building (AB-1)' : 'Academic Building',
  room_type: r.type,
  capacity: r.type === 'lab' ? 30 : 60,
  is_active: true,
}));

/* Batches 29–36 run in Fall 2026 (official sheet V1).
   37/38 are dormant rows: they exist so that room-reservation
   entries (AGS/NFE/CQI — not tied to any pharmacy batch) can
   reference a real batch, while staying hidden from students. */
const BATCHES = [
  { no: 29, admission: 2022, level: 8, active: true },
  { no: 30, admission: 2022, level: 7, active: true },
  { no: 31, admission: 2023, level: 6, active: true },
  { no: 32, admission: 2023, level: 5, active: true },
  { no: 33, admission: 2023, level: 4, active: true },
  { no: 34, admission: 2024, level: 3, active: true },
  { no: 35, admission: 2024, level: 2, active: true },
  { no: 36, admission: 2025, level: 1, active: true },
  { no: 37, admission: 2025, level: 1, active: false },
  { no: 38, admission: 2026, level: 1, active: false },
];

const DEPT_FACULTY = OFF.faculty.map((f, i) => ({
  id: `f-${f.initials}`,
  name: f.name,
  initials: f.initials,
  designation: f.designation,
  department: 'Pharmacy',
  faculty_type: 'regular',
  email: `${f.initials.toLowerCase().replace(/\s+/g, '')}@diu.edu.bd`,
  is_active: true,
}));

const GUEST_FACULTY = OFF.guests.map((g) => ({
  id: `f-${g.initials}`,
  name: g.name,
  initials: g.initials,
  designation: 'Guest Faculty',
  department: 'Guest Faculty',
  faculty_type: 'guest',
  email: null,
  is_active: true,
}));

const GED_FACULTY = OFF.ged.map((g) => ({
  id: `f-${g.initials}`,
  name: g.name,
  initials: g.initials,
  designation: 'GED Faculty',
  department: 'GED',
  faculty_type: 'ged',
  email: null,
  is_active: true,
}));

/* pseudo faculty for non-pharmacy room occupancy / meetings (hidden from lists) */
const PSEUDO_FACULTY = [
  { id: 'f-AGS', name: 'Agriculture Department', initials: 'AGS', designation: 'Agriculture Dept (room reserved)', department: 'Agriculture', faculty_type: 'external', is_active: false },
  { id: 'f-NFE', name: 'NFE Department', initials: 'NFE', designation: 'NFE Dept (room reserved)', department: 'NFE', faculty_type: 'nfe', is_active: false },
  { id: 'f-CQI', name: 'CQI Committee', initials: 'CQI', designation: 'CQI Meeting', department: 'Pharmacy', faculty_type: 'external', is_active: false },
];

const FACULTY = [...DEPT_FACULTY, ...GUEST_FACULTY, ...GED_FACULTY, ...PSEUDO_FACULTY];

/* ---------------- courses ---------------- */
const GED_PREFIXES = new Set(['0231', '0541', '0611', '0222', '0223', '0511', '0512']);
const levelOfBatch = Object.fromEntries(BATCHES.map((b) => [b.no, b.level]));

const courseStat = new Map();
for (const c of OFF.cells) {
  if (!c.code) continue;
  const s = courseStat.get(c.code) ?? { batches: new Set(), lab: false, theory: false };
  if (c.batch) s.batches.add(c.batch);
  if (c.group) s.lab = true; else s.theory = true;
  courseStat.set(c.code, s);
}

const courses = [];
for (const [code, st] of [...courseStat.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const level = Math.min(...[...st.batches].map((b) => levelOfBatch[b] ?? 1));
  const mode = st.theory && st.lab ? 'theory_lab' : st.lab ? 'lab' : 'theory';
  const prefix = code.split('-')[0];
  const dept = GED_PREFIXES.has(prefix) ? 'ged' : 'pharmacy';
  /* NOTE: titles are the official DIU course codes for now — the
     department's code→title list is applied in a follow-up pass. */
  courses.push({ id: `c-${code}`, code, title: code, credit: 3, course_mode: mode, department: dept, level, is_active: true });
}
/* pseudo courses for rooms reserved by other departments / meetings */
courses.push(
  { id: 'c-AGS', code: 'AGS', title: 'Agriculture Dept Class', credit: 1, course_mode: 'theory', department: 'agriculture', level: 1, is_active: true },
  { id: 'c-NFE', code: 'NFE', title: 'NFE Dept Class', credit: 1, course_mode: 'theory', department: 'nfe', level: 1, is_active: true },
  { id: 'c-CQI', code: 'CQI', title: 'CQI Meeting', credit: 1, course_mode: 'theory', department: 'pharmacy', level: 1, is_active: true },
);

const PSEUDO_COURSES = new Set(['AGS', 'NFE', 'CQI']);

/* ---------------- batches / sections / groups ---------------- */
const sections = [];
const labGroups = [];
for (const b of BATCHES) {
  const active = b.active !== false;
  sections.push({ id: `s${b.no}-A`, name: 'A', batch_id: `b${b.no}` }, { id: `s${b.no}-B`, name: 'B', batch_id: `b${b.no}` });
  if (active) for (const sec of ['A', 'B']) for (const grp of ['1', '2']) labGroups.push({ id: `g${b.no}-${sec}${grp}`, name: `${sec}${grp}`, section_id: `s${b.no}-${sec}` });
}
/* official sheet has a Retake theory class (Batch 35 course 0531-1205) */
sections.push({ id: 's35-RT', name: 'RT', batch_id: 'b35' });

/* ---------------- off days (per Batch Day off tab) ----------------
   NOTE Batch 36: the tab says "Wednesday", but the official grid
   schedules Batch 36 classes on all six class days (Sat–Thu) —
   e.g. 0912-1105/36A & 36B on Wednesday, 0916-1103/36A & 36B on
   Wednesday, 0611-111/36A & 36B on Wednesday) — so 36 gets no
   off-day row. The grid is authoritative; flag to the department. */
const DAY_IDS = Object.fromEntries(DAYS.map((d) => [d.name.toUpperCase(), d.id]));
const offByBatch = Object.fromEntries(BATCHES.map((b) => [b.no, new Set()]));
for (const o of OFF.batchOffDays) {
  if (o.batch === 36) continue;
  offByBatch[o.batch]?.add(DAY_IDS[o.day]);
}
const batchOffDays = BATCHES.filter((b) => offByBatch[b.no].size).map((b) => ({
  id: `off-${b.no}`,
  semester_id: SEMESTER.id,
  batch_id: `b${b.no}`,
  day_id: [...offByBatch[b.no]][0],
  reason: 'Official department routine — Batch Day Off tab',
  is_active: true,
}));

/* ---------------- entries ---------------- */
const DORMANT = { batch_id: 'b37', section_id: 's37-A' }; /* rooms reserved for other departments */
const entries = [];
let n = 0;
const mk = (cell, extra) => {
  n += 1;
  const day = DAYS.find((d) => d.name === cell.day);
  const slot = SLOTS[cell.slot - 1];
  const room = ROOMS.find((r) => r.code === cell.room);
  if (!day || !slot || !room) throw new Error(`bad cell ${JSON.stringify(cell)}`);
  return {
    id: `e${String(n).padStart(3, '0')}`,
    semester_id: SEMESTER.id,
    day_id: day.id,
    time_slot_id: slot.id,
    room_id: room.id,
    class_type: 'theory',
    status: 'active',
    notes: null,
    ...extra,
  };
};

for (const cell of OFF.cells) {
  if (cell.special === 'AGS') {
    entries.push(mk(cell, { course_id: 'c-AGS', faculty_id: 'f-AGS', batch_id: DORMANT.batch_id, section_id: DORMANT.section_id, lab_group_id: null, notes: 'Agriculture Dept — room reserved' }));
  } else if (cell.special === 'NFE') {
    entries.push(mk(cell, { course_id: 'c-NFE', faculty_id: 'f-NFE', batch_id: DORMANT.batch_id, section_id: DORMANT.section_id, lab_group_id: null, notes: 'NFE Dept — room reserved' }));
  } else if (cell.special === 'CQI') {
    entries.push(mk(cell, { course_id: 'c-CQI', faculty_id: 'f-CQI', batch_id: DORMANT.batch_id, section_id: DORMANT.section_id, lab_group_id: null, notes: 'CQI Meeting' }));
  } else if (cell.section === 'RT') {
    entries.push(mk(cell, { course_id: `c-${cell.code}`, faculty_id: `f-${cell.faculty}`, batch_id: 'b35', section_id: 's35-RT', lab_group_id: null, notes: 'Retake students' }));
  } else {
    const groupCell = cell.group ? `g${cell.batch}-${cell.group}` : null;
    entries.push(mk(cell, {
      course_id: `c-${cell.code}`,
      faculty_id: `f-${cell.faculty}`,
      batch_id: `b${cell.batch}`,
      section_id: `s${cell.batch}-${cell.section}`,
      lab_group_id: groupCell,
      class_type: groupCell ? 'lab' : 'theory',
    }));
  }
}

const db = {
  semesters: [SEMESTER],
  batches: BATCHES.map((b) => ({ id: `b${b.no}`, batch_no: b.no, name: `Batch ${b.no}`, admission_year: b.admission, current_level: b.level, is_active: b.active !== false })),
  sections,
  labGroups,
  faculty: FACULTY,
  courses,
  rooms: ROOMS,
  timeSlots: SLOTS,
  classDays: DAYS,
  routineEntries: entries,
  batchOffDays,
  announcements: [
    { id: 'a1', title: 'Fall 2026 class routine published (V1)', category: 'routine', semester_id: SEMESTER.id, batch_id: null, body: 'The official Class Routine Fall 2026 V1 for Batch 29 – Batch 36 is now live (shared with the department Google Sheet). Routine is generated per batch, section and laboratory group; off days are per the Batch Day Off tab.', pinned: true, is_active: true, created_by: null, created_by_name: 'Office of the Head, Dept. of Pharmacy', created_at: '2026-08-31T09:00:00Z' },
    { id: 'a2', title: 'Laboratory classes run in groups (A1 / A2 / B1 / B2)', category: 'notice', semester_id: SEMESTER.id, batch_id: null, body: 'All laboratory classes follow the official group rotation — students see only their own group\u2019s lab sessions in the portal. Each lab session is 1 hour 30 minutes in the lab rooms AB-1 602, AB-1 603, AB-1 605, AB-1 606, AB-1 702, AB-1 703, AB-1 704 and AB-1 706.', pinned: false, is_active: true, created_by: null, created_by_name: 'Lab Coordinator, Dept. of Pharmacy', created_at: '2026-08-31T09:10:00Z' },
    { id: 'a3', title: 'Guest lecture: Pharmacovigilance in Bangladesh', category: 'event', semester_id: SEMESTER.id, batch_id: 'b29', body: 'A guest lecture on "Pharmacovigilance in Bangladesh" by Prof. Dr. Muniruddin Ahamed will be held for Batch 29 in the Seminar Hall, AB-1 504. Attendance is mandatory.', pinned: false, is_active: true, created_by: null, created_by_name: 'Dept. of Pharmacy', created_at: '2026-08-24T14:00:00Z' },
    { id: 'a4', title: 'Mid-term examination schedule (Batch 29–33)', category: 'notice', semester_id: SEMESTER.id, batch_id: null, body: 'Mid-term examinations for Batch 29 – Batch 33 will commence from the third week of Fall 2026. Detailed exam routine will be published on the department notice board.', pinned: false, is_active: true, created_by: null, created_by_name: 'Exam Committee, Pharmacy', created_at: '2026-08-22T09:30:00Z' },
    { id: 'a5', title: 'Rooms AB-1 103 & AB-1 504 — other departments', category: 'notice', semester_id: SEMESTER.id, batch_id: null, body: 'Per the official routine, Classroom AB-1 103 is reserved for the Agriculture Dept and Seminar Hall AB-1 504 is used by the NFE Dept (Sun–Thu). Pharmacy students should report to their scheduled rooms; these two rooms are not Pharmacy teaching rooms.', pinned: false, is_active: true, created_by: null, created_by_name: 'Dept. of Pharmacy', created_at: '2026-08-31T09:20:00Z' },
  ],
  settings: [
    { key: 'app', value: JSON.stringify({ universityName: 'Daffodil International University', departmentName: 'Department of Pharmacy', universityTagline: 'Permanent Campus · Daffodil Smart City, Birulia, Savar, Dhaka · Estd. 2002', colors: { theory: '#7c3aed', lab: '#2563eb', guest: '#ea580c', ged: '#ca8a04', nfe: '#db2777', agriculture: '#15803d', cancelled: '#dc2626', rescheduled: '#d97706' } }) },
  ],
};

writeFileSync(path.join('src', 'lib', 'seed.json'), JSON.stringify(db, null, 2));

/* ================= conflict verification ================= */
const problems = [];
const roomSeen = new Map();
const facultySeen = new Map();
const sectionSeen = new Map();
const groupSeen = new Map();
const dayName = Object.fromEntries(DAYS.map((d) => [d.id, d.name]));
const slotLabel = Object.fromEntries(SLOTS.map((sl, i) => [sl.id, `CLASS ${i + 1} (${sl.start_time}–${sl.end_time})`]));
const courseCode = Object.fromEntries(db.courses.map((c) => [c.id, c.code]));
const facInit = Object.fromEntries(db.faculty.map((f) => [f.id, f.initials]));
const roomCode = Object.fromEntries(db.rooms.map((r) => [r.id, r.code]));
const batchNo = Object.fromEntries(db.batches.map((b) => [b.id, b.batch_no]));
const secName = Object.fromEntries(db.sections.map((s) => [s.id, s.name]));

for (const e of entries) {
  const at = `${dayName[e.day_id]} ${slotLabel[e.time_slot_id]} – ${roomCode[e.room_id]}`;
  const isPseudo = PSEUDO_COURSES.has(courseCode[e.course_id]);
  const isDormant = e.batch_id === 'b37';

  /* 1. room double-booking */
  const rk = `${e.day_id}|${e.time_slot_id}|${e.room_id}`;
  if (roomSeen.has(rk)) problems.push(`Room clash: ${at} (${courseCode[e.course_id]} × ${courseCode[roomSeen.get(rk)]})`);
  else roomSeen.set(rk, e.course_id);

  /* 2. faculty double-booking (exclude pseudo/dormant blocks) */
  if (!isPseudo && !isDormant) {
    const fk = `${e.day_id}|${e.time_slot_id}|${e.faculty_id}`;
    if (facultySeen.has(fk)) problems.push(`Faculty clash: ${facInit[e.faculty_id]} ${at} (${courseCode[facultySeen.get(fk)]} × ${courseCode[e.course_id]})`);
    else facultySeen.set(fk, e.course_id);

    /* 3. section double-booking (theory) */
    if (e.class_type === 'theory') {
      const sk = `${e.day_id}|${e.time_slot_id}|${e.batch_id}|${e.section_id}`;
      if (sectionSeen.has(sk)) problems.push(`Section clash: Batch ${batchNo[e.batch_id]}-${secName[e.section_id]} ${dayName[e.day_id]} ${slotLabel[e.time_slot_id]} (${courseCode[sectionSeen.get(sk)]} × ${courseCode[e.course_id]})`);
      else sectionSeen.set(sk, e.course_id);
    }

    /* 4. lab group double-booking */
    if (e.lab_group_id) {
      const gk = `${e.day_id}|${e.time_slot_id}|${e.lab_group_id}`;
      if (groupSeen.has(gk)) problems.push(`Lab-group clash: ${e.lab_group_id} ${at}`);
      else groupSeen.set(gk, e.course_id);
    }

    /* 5. class on the batch's off day (retake group exempt — the official
          sheet schedules retake classes per the retake cohort's needs) */
    if (secName[e.section_id] !== 'RT' && offByBatch[batchNo[e.batch_id]]?.has(e.day_id)) {
      problems.push(`Off-day class: Batch ${batchNo[e.batch_id]}-${secName[e.section_id]} ${dayName[e.day_id]} ${slotLabel[e.time_slot_id]} (${courseCode[e.course_id]})`);
    }
  }
}

const theory = entries.filter((e) => e.class_type === 'theory').length;
const labs = entries.length - theory;
console.log(`✓ Seed written to src/lib/seed.json`);
console.log(`  entries=${entries.length} (theory=${theory}, labs=${labs})  offDays=${batchOffDays.length}  courses=${courses.length}  faculty=${FACULTY.length}  rooms=${ROOMS.length}`);
if (problems.length) {
  console.log(`  ✗ CONFLICTS FOUND (${problems.length}):`);
  problems.slice(0, 25).forEach((p) => console.log('   -', p));
  process.exitCode = 1;
} else {
  console.log('  ✓ conflict verification passed (room / faculty / section / lab-group / off-day)');
}
const perBatch = BATCHES.filter((b) => b.active !== false).map((b) => `${b.no}:${entries.filter((e) => e.batch_id === `b${b.no}` && e.section_id !== `s${b.no}-RT`).length}`).join(' ');
console.log('  per-batch class counts:', perBatch);
const reserved = entries.filter((e) => e.batch_id === 'b37').length;
console.log(`  room-reservation entries (AGS/NFE/CQI): ${reserved}`);
