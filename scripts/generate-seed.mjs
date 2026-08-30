/* ============================================================
 * Seed generator — builds a deterministic, conflict-free demo
 * dataset for Batches 29–38. Every batch gets its OWN active
 * days, off days, curriculum level, faculty, rooms and slots.
 *
 * Run:  node scripts/generate-seed.mjs
 * Out:  src/lib/seed.json
 * ============================================================ */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'lib', 'seed.json');

/* ---------- deterministic PRNG ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260830);
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ================= Catalog ================= */

const DAYS = [
  { id: 'd-sat', name: 'Saturday', short_name: 'Sat', sequence: 1, is_active: true },
  { id: 'd-sun', name: 'Sunday', short_name: 'Sun', sequence: 2, is_active: true },
  { id: 'd-mon', name: 'Monday', short_name: 'Mon', sequence: 3, is_active: true },
  { id: 'd-tue', name: 'Tuesday', short_name: 'Tue', sequence: 4, is_active: true },
  { id: 'd-wed', name: 'Wednesday', short_name: 'Wed', sequence: 5, is_active: true },
  { id: 'd-thu', name: 'Thursday', short_name: 'Thu', sequence: 6, is_active: true },
];

const SLOTS = [
  { id: 't1', label: '8:30 AM – 10:00 AM', start_time: '08:30', end_time: '10:00', sequence: 1, is_active: true },
  { id: 't2', label: '10:00 AM – 11:30 AM', start_time: '10:00', end_time: '11:30', sequence: 2, is_active: true },
  { id: 't3', label: '11:30 AM – 1:00 PM', start_time: '11:30', end_time: '13:00', sequence: 3, is_active: true },
  { id: 't4', label: '1:00 PM – 2:30 PM', start_time: '13:00', end_time: '14:30', sequence: 4, is_active: true },
  { id: 't5', label: '2:30 PM – 4:00 PM', start_time: '14:30', end_time: '16:00', sequence: 5, is_active: true },
  { id: 't6', label: '4:00 PM – 5:30 PM', start_time: '16:00', end_time: '17:30', sequence: 6, is_active: true },
];

const ROOMS = [
  { id: 'r-ab401', code: 'AB-401', name: 'Lecture Theatre 1', building: 'Academic Building B', room_type: 'theory', capacity: 70 },
  { id: 'r-ab402', code: 'AB-402', name: 'Lecture Theatre 2', building: 'Academic Building B', room_type: 'theory', capacity: 70 },
  { id: 'r-ab403', code: 'AB-403', name: 'Lecture Theatre 3', building: 'Academic Building B', room_type: 'theory', capacity: 80 },
  { id: 'r-ab404', code: 'AB-404', name: 'Lecture Theatre 4', building: 'Academic Building B', room_type: 'theory', capacity: 65 },
  { id: 'r-ab405', code: 'AB-405', name: 'Class Room 5', building: 'Academic Building B', room_type: 'theory', capacity: 60 },
  { id: 'r-ab406', code: 'AB-406', name: 'Class Room 6', building: 'Academic Building B', room_type: 'theory', capacity: 60 },
  { id: 'r-ab407', code: 'AB-407', name: 'Class Room 7', building: 'Academic Building B', room_type: 'theory', capacity: 55 },
  { id: 'r-ab408', code: 'AB-408', name: 'Class Room 8', building: 'Academic Building B', room_type: 'theory', capacity: 55 },
  { id: 'r-ab501', code: 'AB-501', name: 'Seminar Hall', building: 'Academic Building B', room_type: 'theory', capacity: 90 },
  { id: 'r-sw201', code: 'SW-201', name: 'GED Classroom', building: 'SW Tower', room_type: 'theory', capacity: 55 },
  { id: 'r-sw202', code: 'SW-202', name: 'GED Classroom 2', building: 'SW Tower', room_type: 'theory', capacity: 55 },
  { id: 'r-af301', code: 'AF-301', name: 'NFE Seminar Room', building: 'A&B Tower', room_type: 'theory', capacity: 45 },
  { id: 'r-lab601', code: 'AB-601', name: 'Microbiology Laboratory', building: 'Academic Building B', room_type: 'lab', capacity: 32 },
  { id: 'r-lab602', code: 'AB-602', name: 'Pharmacology Laboratory', building: 'Academic Building B', room_type: 'lab', capacity: 32 },
  { id: 'r-lab603', code: 'AB-603', name: 'Pharmaceutical Chemistry Laboratory', building: 'Academic Building B', room_type: 'lab', capacity: 32 },
  { id: 'r-lab604', code: 'AB-604', name: 'Pharmaceutics Laboratory', building: 'Academic Building B', room_type: 'lab', capacity: 32 },
  { id: 'r-lab605', code: 'AB-605', name: 'Instrumentation Laboratory', building: 'Academic Building B', room_type: 'lab', capacity: 30 },
  { id: 'r-lab606', code: 'AB-606', name: 'Computer & Bio-Simulation Lab', building: 'Academic Building B', room_type: 'lab', capacity: 30 },
];

/* Official Department of Pharmacy faculty — Fall 2026 departmental list
 * (names & initials exactly as published; all other entries removed). */
const FACULTY = [
  ['f01', 'Prof. Dr. Muniruddin Ahamed', 'MUA', 'Professor & Head', 'Pharmacy'],
  ['f02', 'Prof. Dr. Sharifa Sultana', 'DSS', 'Professor', 'Pharmacy'],
  ['f03', 'Prof. Dr. Mohammed Shafikur Rahman', 'DSR', 'Professor', 'Pharmacy'],
  ['f04', 'Dr. Md. Sarowar Hossain', 'DSH', 'Associate Professor', 'Pharmacy'],
  ['f05', 'Dr. Md. Shafikur Rahman', 'DMS', 'Associate Professor', 'Pharmacy'],
  ['f06', 'Dr. Md. Mizanur Rahman', 'DMR', 'Associate Professor', 'Pharmacy'],
  ['f07', 'Mr. Md. A.K. Azad', 'AKA', 'Senior Lecturer', 'Pharmacy'],
  ['f08', 'Tahmina Afroz', 'MTA', 'Senior Lecturer', 'Pharmacy'],
  ['f09', 'Nazneen Ahmed Sultana', 'NAS', 'Assistant Professor', 'Pharmacy'],
  ['f10', 'Sultana Juhara Mannan', 'SJM', 'Senior Lecturer', 'Pharmacy'],
  ['f11', 'Md. Shajib Khan', 'MSK', 'Lecturer', 'Pharmacy'],
  ['f12', 'Mr. Md. Sadman Hasib', 'MSH', 'Lecturer', 'Pharmacy'],
  ['f13', 'Mr. Shadhan Kumar Mondal', 'SKM', 'Lecturer', 'Pharmacy'],
  ['f14', 'Mr. Subrato Kumar Barman', 'SKB', 'Lecturer', 'Pharmacy'],
  ['f15', 'Mr. Anwar Parvez', 'MAP', 'Lecturer', 'Pharmacy'],
  ['f16', 'Najibah Nasrin', 'NJN', 'Lecturer', 'Pharmacy'],
  ['f17', 'Md. Mahadi Hasan Lavlu', 'MHL', 'Lecturer', 'Pharmacy'],
  ['f18', 'Ms. Bristi Saha', 'BSS', 'Lecturer', 'Pharmacy'],
  ['f19', 'Most. Shahina Afroz', 'SAF', 'Lecturer', 'Pharmacy'],
  ['f20', 'Ms. Bithe Saha', 'BTS', 'Lecturer', 'Pharmacy'],
].map((r) => ({ id: r[0], name: r[1], initials: r[2], designation: r[3], department: r[4], faculty_type: 'regular' }));

/* Curriculum per level (1..8) — [course, facultyPool, labPool, roomZone] */
const P = (level, code, title, mode, dept, credit, pool, labPool, zone = 'pharma') => ({ level, code, title, mode, dept, credit, pool, labPool, zone });

const CURRICULUM = {
  1: [
    P(1, 'PHAR-1101', 'Anatomy & Physiology I', 'theory', 'pharmacy', 3, ['f03', 'f08', 'f11', 'f17']),
    P(1, 'PHAR-1103', 'General & Inorganic Chemistry', 'theory_lab', 'pharmacy', 4, ['f07', 'f13', 'f12', 'f19'], ['f18', 'f15']),
    P(1, 'PHAR-1105', 'Computer Fundamentals & Programming', 'theory', 'pharmacy', 3, ['f05', 'f08', 'f16']),
    P(1, 'ENG-1121', 'English Language & Communication', 'theory', 'ged', 3, ['f17', 'f09', 'f12', 'f08'], null, 'ged'),
    P(1, 'MAT-1131', 'Basic Mathematics', 'theory', 'ged', 3, ['f17', 'f09', 'f11', 'f07'], null, 'ged'),
    P(1, 'AGR-1101', 'Fundamentals of Agriculture', 'theory', 'agriculture', 3, ['f05', 'f06'], null, 'ext'),
  ],
  2: [
    P(2, 'PHAR-1201', 'Anatomy & Physiology II', 'theory', 'pharmacy', 3, ['f03', 'f08', 'f15']),
    P(2, 'PHAR-1203', 'Organic Chemistry', 'theory_lab', 'pharmacy', 4, ['f09', 'f13', 'f14', 'f20'], ['f16', 'f18']),
    P(2, 'PHAR-1205', 'Biochemistry I', 'theory_lab', 'pharmacy', 4, ['f04', 'f11', 'f01', 'f19'], ['f17', 'f14']),
    P(2, 'PHAR-1207', 'Pharmaceutical Statistics', 'theory', 'pharmacy', 3, ['f05', 'f07', 'f12']),
    P(2, 'BAN-1221', 'Bangla Language & Literature', 'theory', 'ged', 2, ['f09', 'f17', 'f12'], null, 'ged'),
    P(2, 'NFE-1203', 'Life Skills & Community Development', 'theory', 'nfe', 3, ['f16'], null, 'ext'),
  ],
  3: [
    P(3, 'PHAR-2301', 'Pharmaceutical Microbiology', 'theory_lab', 'pharmacy', 4, ['f03', 'f13', 'f10', 'f19'], ['f18', 'f20']),
    P(3, 'PHAR-2303', 'Pharmaceutics I (Dosage Forms)', 'theory_lab', 'pharmacy', 4, ['f06', 'f02', 'f05', 'f04'], ['f14', 'f15']),
    P(3, 'PHAR-2305', 'Biochemistry II', 'theory', 'pharmacy', 3, ['f04', 'f11', 'f19']),
    P(3, 'PHAR-2307', 'Pathophysiology', 'theory', 'pharmacy', 3, ['f01', 'f02', 'f06']),
    P(3, 'STA-2321', 'Statistics & Research Methods', 'theory', 'ged', 3, ['f11', 'f12', 'f07'], null, 'ged'),
    P(3, 'NFE-2301', 'Ethics & Moral Development', 'theory', 'nfe', 2, ['f16'], null, 'ext'),
  ],
  4: [
    P(4, 'PHAR-2401', 'Pharmacology I', 'theory', 'pharmacy', 4, ['f01', 'f02', 'f03', 'f06']),
    P(4, 'PHAR-2403', 'Pharmaceutical Chemistry I', 'theory_lab', 'pharmacy', 4, ['f09', 'f13', 'f07', 'f19'], ['f17', 'f20']),
    P(4, 'PHAR-2405', 'Physical Pharmacy', 'theory_lab', 'pharmacy', 4, ['f06', 'f05', 'f02', 'f08'], ['f14', 'f15']),
    P(4, 'PHAR-2407', 'Pharmacognosy I', 'theory_lab', 'pharmacy', 4, ['f04', 'f11', 'f03', 'f13'], ['f16', 'f18']),
    P(4, 'PHAR-2409', 'Pharmaceutical Microbiology (Practical)', 'lab', 'pharmacy', 1, ['f13', 'f03'], ['f18', 'f19']),
    P(4, 'GED-2421', 'Business Communication', 'theory', 'ged', 3, ['f17', 'f09'], null, 'ged'),
    P(4, 'PHAR-2411', 'Recent Advances in Drug Discovery', 'theory', 'pharmacy', 2, ['f01'], null, 'pharma'),
  ],
  5: [
    P(5, 'PHAR-3501', 'Pharmacology II', 'theory', 'pharmacy', 4, ['f02', 'f01', 'f03', 'f10']),
    P(5, 'PHAR-3503', 'Pharmaceutical Chemistry II', 'theory_lab', 'pharmacy', 4, ['f13', 'f09', 'f20'], ['f15', 'f18']),
    P(5, 'PHAR-3505', 'Biopharmaceutics & Pharmacokinetics', 'theory', 'pharmacy', 3, ['f05', 'f06', 'f16']),
    P(5, 'PHAR-3507', 'Phytochemistry', 'theory_lab', 'pharmacy', 4, ['f04', 'f11', 'f19'], ['f14', 'f17']),
    P(5, 'PHAR-3509', 'Pharmacology (Practical)', 'lab', 'pharmacy', 1, ['f01', 'f02'], ['f16', 'f18']),
    P(5, 'GED-3521', 'Sociology & Public Health', 'theory', 'ged', 3, ['f09', 'f12'], null, 'ged'),
    P(5, 'AGR-3501', 'Medicinal Plants & Agriculture', 'theory', 'agriculture', 2, ['f05', 'f06'], null, 'ext'),
  ],
  6: [
    P(6, 'PHAR-3601', 'Medicinal Chemistry', 'theory', 'pharmacy', 4, ['f09', 'f13', 'f07']),
    P(6, 'PHAR-3603', 'Pharmaceutical Analysis', 'theory_lab', 'pharmacy', 4, ['f07', 'f05', 'f09', 'f12'], ['f17', 'f18']),
    P(6, 'PHAR-3605', 'Clinical Pharmacy I', 'theory', 'pharmacy', 3, ['f01', 'f04', 'f08']),
    P(6, 'PHAR-3607', 'Pharmaceutical Technology', 'theory_lab', 'pharmacy', 4, ['f06', 'f02', 'f10', 'f03'], ['f14', 'f15']),
    P(6, 'PHAR-3609', 'Instrumental Analysis (Practical)', 'lab', 'pharmacy', 1, ['f07', 'f13'], ['f19', 'f14']),
    P(6, 'GED-3621', 'Entrepreneurship & Innovation', 'theory', 'ged', 3, ['f11', 'f17', 'f09'], null, 'ged'),
  ],
  7: [
    P(7, 'PHAR-4701', 'Clinical Pharmacy II & Hospital Pharmacy', 'theory', 'pharmacy', 3, ['f04', 'f01', 'f08']),
    P(7, 'PHAR-4703', 'Pharmaceutical Biotechnology', 'theory_lab', 'pharmacy', 4, ['f13', 'f03', 'f16', 'f18'], ['f17', 'f20']),
    P(7, 'PHAR-4705', 'Pharmacy Practice & Pharmacy Law', 'theory', 'pharmacy', 3, ['f02', 'f11', 'f12']),
    P(7, 'PHAR-4707', 'Industrial Pharmacy', 'theory_lab', 'pharmacy', 4, ['f06', 'f05', 'f10', 'f03'], ['f14', 'f16']),
    P(7, 'PHAR-4709', 'Hospital Pharmacy (Practical)', 'lab', 'pharmacy', 1, ['f04', 'f02'], ['f17', 'f18']),
    P(7, 'PHAR-4711', 'Pharmacovigilance & Regulatory Affairs', 'theory', 'pharmacy', 2, ['f01', 'f02'], null, 'pharma'),
  ],
  8: [
    P(8, 'PHAR-4801', 'Pharmaceutical Management & Marketing', 'theory', 'pharmacy', 3, ['f02', 'f11', 'f07']),
    P(8, 'PHAR-4803', 'Advanced Drug Delivery Systems', 'theory', 'pharmacy', 3, ['f06', 'f05', 'f09']),
    P(8, 'PHAR-4805', 'Biostatistics & Research Methodology', 'theory', 'pharmacy', 3, ['f07', 'f13', 'f20']),
    P(8, 'PHAR-4807', 'Drug Design & Development', 'theory_lab', 'pharmacy', 4, ['f09', 'f04', 'f10', 'f19'], ['f15', 'f20']),
    P(8, 'PHAR-4809', 'Industrial Training & Professional Practice', 'theory', 'pharmacy', 3, ['f01', 'f02'], null, 'pharma'),
    P(8, 'GED-4821', 'Ethics & Professional Conduct', 'theory', 'ged', 2, ['f09', 'f17'], null, 'ged'),
  ],
};

/* Batches 29..38 — each with its OWN level + off-day configuration */
const BATCHES = [
  { no: 29, admission: 2022, level: 8, off: ['d-tue'] },
  { no: 30, admission: 2022, level: 8, off: ['d-thu'] },
  { no: 31, admission: 2023, level: 7, off: ['d-sun'] },
  { no: 32, admission: 2023, level: 6, off: ['d-sat', 'd-wed'] },
  { no: 33, admission: 2023, level: 5, off: ['d-mon'] },
  { no: 34, admission: 2024, level: 4, off: ['d-sat'] },
  { no: 35, admission: 2024, level: 3, off: ['d-wed'] },
  { no: 36, admission: 2025, level: 2, off: ['d-thu'] },
  { no: 37, admission: 2025, level: 1, off: ['d-sat', 'd-sun'] },
  { no: 38, admission: 2026, level: 1, off: ['d-thu'] },
];

const SEMESTER = { id: 'sem-f26', name: 'Fall 2026', code: 'FA26', is_active: true, start_date: '2026-09-01', end_date: '2027-01-15' };

/* ============ Conflict-aware placement engine ============ */

const used = { faculty: new Set(), room: new Set(), section: new Set(), labGroup: new Set() };
const key = (...parts) => parts.join('|');
const secKey = (batch, section, day, slot) => key('sec', batch, section, day, slot);

const ITEMS = []; // {type:'theory'|'lab', batch, section, group?, course, faculty, room, want}

function plan() {
  for (const [bi, bcfg] of BATCHES.entries()) {
    const courses = CURRICULUM[bcfg.level];
    const roomsByZone = {
      pharma: ['r-ab401', 'r-ab402', 'r-ab403', 'r-ab404', 'r-ab405', 'r-ab406', 'r-ab407', 'r-ab408', 'r-ab501'],
      ged: ['r-sw201', 'r-sw202'],
      ext: ['r-af301', 'r-ab405'],
    };
    const labRooms = ['r-lab601', 'r-lab602', 'r-lab603', 'r-lab604', 'r-lab605', 'r-lab606'];

    courses.forEach((course, ci) => {
      const isTheory = course.mode === 'theory' || course.mode === 'theory_lab';
      const isLab = course.mode === 'lab' || course.mode === 'theory_lab';
      const theoryRooms = roomsByZone[course.zone];
      const tRoomA = theoryRooms[(bi + ci) % theoryRooms.length];
      const tRoomB = theoryRooms[(bi + ci + 1) % theoryRooms.length];
      const lRoom = labRooms[(bi + ci) % labRooms.length];
      const guestTaught = course.pool.length === 1;

      for (const sec of ['A', 'B']) {
        const secIdx = sec === 'A' ? 0 : 1;
        if (guestTaught || course.dept !== 'pharmacy') {
          // one shared faculty across both sections (guest / GED / NFE / Agriculture)
          if (isTheory) {
            ITEMS.push({ type: 'theory', batch: bcfg.no, section: sec, course, faculty: course.pool[0], room: secIdx === 0 ? tRoomA : tRoomB, want: 2 });
          }
        } else {
          if (isTheory) {
            const fac = course.pool[(bi + ci + secIdx) % course.pool.length];
            ITEMS.push({ type: 'theory', batch: bcfg.no, section: sec, course, faculty: fac, room: secIdx === 0 ? tRoomA : tRoomB, want: 2 });
          }
          if (isLab) {
            for (const grp of ['1', '2']) {
              const fac = course.labPool[(bi + ci + Number(grp) + secIdx) % course.labPool.length];
              ITEMS.push({ type: 'lab', batch: bcfg.no, section: sec, group: grp, course, faculty: fac, room: lRoom, want: 1 });
            }
          }
        }
        if (isLab && course.dept === 'pharmacy') {
          // fallback: lab for guest/non-pharmacy courses handled above only if theory; labs are pharmacy-only
        }
      }
      if (isLab && guestTaught === false && course.dept !== 'pharmacy' && isTheory) {
        // no lab support for non-pharmacy courses
      }
    });
  }
}

function tryPlace(item, candidateList) {
  const { batch, section, course, faculty, room } = item;
  const placed = [];
  for (const [dayId, slotId] of candidateList) {
    if (placed.length >= item.want) break;
    if (used.faculty.has(key('f', faculty, dayId, slotId))) continue;
    if (used.room.has(key('r', room, dayId, slotId))) continue;
    if (used.section.has(secKey(batch, section, dayId, slotId))) continue;
    if (item.type === 'lab') {
      if (used.labGroup.has(key('g', batch, section, item.group, dayId, slotId))) continue;
      used.faculty.add(key('f', faculty, dayId, slotId));
      used.room.add(key('r', room, dayId, slotId));
      used.section.add(secKey(batch, section, dayId, slotId));
      used.labGroup.add(key('g', batch, section, item.group, dayId, slotId));
      placed.push([dayId, slotId]);
    } else {
      used.faculty.add(key('f', faculty, dayId, slotId));
      used.room.add(key('r', room, dayId, slotId));
      used.section.add(secKey(batch, section, dayId, slotId));
      placed.push([dayId, slotId]);
    }
  }
  return placed;
}

function activeDaysFor(bcfg) {
  return DAYS.filter((d) => !bcfg.off.includes(d.id)).map((d) => d.id);
}

function buildRoutine() {
  plan();
  const entries = [];
  let seq = 0;
  const mkId = () => `e-${++seq}`;
  const byBatch = new Map();
  for (const it of ITEMS) {
    const list = byBatch.get(it.batch) || [];
    list.push(it);
    byBatch.set(it.batch, list);
  }

  // Round-robin over batches so resources spread evenly; 3 passes so
  // nothing is dropped just because it was tried early.
  for (let pass = 0; pass < 8; pass++) {
    const order = [];
    for (let r = 0; r < 10; r++) {
      const items = byBatch.get(BATCHES[r].no) || [];
      order.push(...shuffle(items));
    }
    const todo = order.filter((x) => !x._done);
    for (const item of todo) {
      if (item._done) continue;
      const bcfg = BATCHES.find((b) => b.no === item.batch);
      const days = activeDaysFor(bcfg);
      const candidates = [];
      for (const d of days) for (const s of SLOTS) candidates.push([d, s.id]);
      const got = tryPlace(item, shuffle(candidates));
      if (got.length > 0) {
        item._placed = got;
        item._done = true;
        for (const [dayId, slotId] of got) {
          entries.push({
            id: mkId(),
            semester_id: SEMESTER.id,
            batch_id: `b${item.batch}`,
            section_id: `s${item.batch}-${item.section}`,
            lab_group_id: item.type === 'lab' ? `g${item.batch}-${item.section}${item.group}` : null,
            course_id: `c-${item.course.code}`,
            faculty_id: item.faculty,
            room_id: item.room,
            day_id: dayId,
            time_slot_id: slotId,
            class_type: item.type,
            status: 'active',
            notes: null,
            created_at: '2026-08-20T09:00:00Z',
            updated_at: '2026-08-20T09:00:00Z',
          });
        }
      }
    }
  }
  return entries;
}

function makeOffDays() {
  const res = [];
  let seq = 0;
  for (const bcfg of BATCHES) {
    for (const d of bcfg.off) {
      res.push({
        id: `od-${++seq}`,
        semester_id: SEMESTER.id,
        batch_id: `b${bcfg.no}`,
        day_id: d,
        reason: d === 'd-sat' || d === 'd-sun' ? 'Weekly holiday' : 'No classes scheduled',
        is_active: true,
      });
    }
  }
  return res;
}

/* ================= Main ================= */

const entries = buildRoutine();
const offDays = makeOffDays();

/* Demo: mark a few entries cancelled / rescheduled */
const findE = (pred) => entries.find(pred);
const cancelled1 = findE((e) => e.batch_id === 'b34' && e.class_type === 'lab' && e.day_id === 'd-wed');
if (cancelled1) { cancelled1.status = 'cancelled'; cancelled1.notes = 'Lab postponed — replacement session will be scheduled.'; }
const resched1 = entries.find((e) => e.batch_id === 'b32' && e.class_type === 'theory' && e.day_id === 'd-thu' && e.time_slot_id === 't4');
if (resched1) { resched1.status = 'rescheduled'; resched1.notes = 'Moved to Thursday Slot 5 (4:00 PM) in AB-404.'; }

/* ---------- verify no conflicts ---------- */
function verify(entries) {
  const problems = [];
  const f = {}, r = {}, s = {}, g = {};
  for (const e of entries) {
    const daySlot = `${e.day_id}|${e.time_slot_id}`;
    const fp = f[`${e.faculty_id}|${daySlot}`];
    if (fp) problems.push(`faculty ${e.faculty_id} double-booked with ${fp} (${daySlot})`);
    f[`${e.faculty_id}|${daySlot}`] = e.id;
    const rp = r[`${e.room_id}|${daySlot}`];
    if (rp) problems.push(`room ${e.room_id} double-booked with ${rp} (${daySlot})`);
    r[`${e.room_id}|${daySlot}`] = e.id;
    const sp = s[`${e.batch_id}|${e.section_id}|${daySlot}`];
    if (sp) problems.push(`section ${e.section_id} double-booked with ${sp} (${daySlot})`);
    s[`${e.batch_id}|${e.section_id}|${daySlot}`] = e.id;
    if (e.lab_group_id) {
      const gp = g[`${e.lab_group_id}|${daySlot}`];
      if (gp) problems.push(`lab group ${e.lab_group_id} double-booked with ${gp} (${daySlot})`);
      g[`${e.lab_group_id}|${daySlot}`] = e.id;
    }
  }
  // off-day sanity: no entry on an off day
  const offMap = new Map(offDays.map((o) => [`${o.batch_id}|${o.day_id}`, o]));
  for (const e of entries) {
    if (offMap.has(`${e.batch_id}|${e.day_id}`)) problems.push(`entry ${e.id} on an off day ${e.day_id}`);
  }
  return problems;
}

const problems = verify(entries);

/* ---------- assembles JSON ---------- */

const sections = [];
const labGroups = [];
for (const b of BATCHES) {
  sections.push({ id: `s${b.no}-A`, name: 'A', batch_id: `b${b.no}` }, { id: `s${b.no}-B`, name: 'B', batch_id: `b${b.no}` });
  for (const sec of ['A', 'B']) for (const grp of ['1', '2']) labGroups.push({ id: `g${b.no}-${sec}${grp}`, name: `${sec}${grp}`, section_id: `s${b.no}-${sec}` });
}

const courses = [];
for (const list of Object.values(CURRICULUM)) {
  for (const c of list) {
    courses.push({ id: `c-${c.code}`, code: c.code, title: c.title, credit: c.credit, course_mode: c.mode, department: c.dept, level: c.level, is_active: true });
  }
}

const db = {
  semesters: [SEMESTER],
  batches: BATCHES.map((b) => ({ id: `b${b.no}`, batch_no: b.no, name: `Batch ${b.no}`, admission_year: b.admission, current_level: b.level, is_active: true })),
  sections,
  labGroups,
  faculty: FACULTY.map((f) => ({ id: f.id, name: f.name, initials: f.initials, designation: f.designation, department: f.department, faculty_type: f.faculty_type, email: f.initials.toLowerCase().replace(/\s/g, '') + '@diu.edu.bd', is_active: true })),
  courses,
  rooms: ROOMS,
  timeSlots: SLOTS,
  classDays: DAYS,
  routineEntries: entries,
  batchOffDays: offDays,
  announcements: [
    { id: 'a1', title: 'Fall 2026 class routine published', category: 'routine', semester_id: SEMESTER.id, batch_id: null, body: 'The official Fall 2026 class & laboratory routine for Batch 29 – Batch 38 is now live. Students can generate their personalized routine from the Routine page. Any changes will be notified here.', pinned: true, is_active: true, created_by: null, created_by_name: 'Office of the Head, Dept. of Pharmacy', created_at: '2026-08-20T09:00:00Z' },
    { id: 'a2', title: 'Batch 34 Pharmacology Lab rescheduled', category: 'urgent', semester_id: SEMESTER.id, batch_id: 'b34', body: 'The Pharmacology I laboratory session for Batch 34 Section A, Group A1 on Wednesday is cancelled this week. A replacement session will be announced shortly. Section B groups remain unchanged.', pinned: false, is_active: true, created_by: null, created_by_name: 'Prof. Dr. Mohammed Shafikur Rahman', created_at: '2026-08-26T10:00:00Z' },
    { id: 'a3', title: 'Guest lecture: Pharmacovigilance in Bangladesh', category: 'event', semester_id: SEMESTER.id, batch_id: 'b29', body: 'A guest lecture on "Pharmacovigilance in Bangladesh" by Prof. Dr. Muniruddin Ahamed will be held for Batch 29 in the Seminar Hall, AB-501. Attendance is mandatory.', pinned: false, is_active: true, created_by: null, created_by_name: 'Dept. of Pharmacy', created_at: '2026-08-24T14:00:00Z' },
    { id: 'a4', title: 'Mid-term examination schedule (Batch 29–33)', category: 'notice', semester_id: SEMESTER.id, batch_id: null, body: 'Mid-term examinations for Batch 29 – Batch 33 will commence from the third week of Fall 2026. Detailed exam routine will be published on the department notice board.', pinned: false, is_active: true, created_by: null, created_by_name: 'Exam Committee, Pharmacy', created_at: '2026-08-22T09:30:00Z' },
    { id: 'a5', title: 'New students: Batch 37 & 38 orientation', category: 'event', semester_id: SEMESTER.id, batch_id: null, body: 'Orientation for newly admitted Batch 37 and Batch 38 students will be held on the first Saturday of the semester at the permanent campus auditorium. Routine for Section A & B is available online.', pinned: false, is_active: true, created_by: null, created_by_name: 'Student Affairs', created_at: '2026-08-19T12:00:00Z' },
  ],
  settings: [
    { key: 'app', value: JSON.stringify({ universityName: 'Daffodil International University', departmentName: 'Department of Pharmacy', universityTagline: 'Liberal Arts College · Savar, Dhaka · Estd. 2002', colors: { theory: '#15803d', lab: '#7c3aed', guest: '#db2777', ged: '#0369a1', nfe: '#b45309', agriculture: '#0d9488', cancelled: '#dc2626', rescheduled: '#d97706' } }) },
  ],
};

writeFileSync(OUT, JSON.stringify(db, null, 2));

const theory = entries.filter((e) => e.class_type === 'theory').length;
const labs = entries.length - theory;
console.log(`✓ Seed written to src/lib/seed.json`);
console.log(`  entries=${entries.length} (theory=${theory}, labs=${labs})  offDays=${offDays.length}  courses=${courses.length}  faculty=${FACULTY.length}  rooms=${ROOMS.length}`);
if (problems.length) {
  console.log(`  ✗ CONFLICTS FOUND (${problems.length}):`);
  problems.slice(0, 15).forEach((p) => console.log('   -', p));
  process.exitCode = 1;
} else {
  console.log('  ✓ conflict verification passed (faculty / room / section / lab-group / off-day)');
}
const perBatch = BATCHES.map((b) => `${b.no}:${entries.filter((e) => e.batch_id === `b${b.no}`).length}`).join(' ');
console.log('  per-batch class counts:', perBatch);
