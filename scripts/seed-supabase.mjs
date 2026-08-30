/* ============================================================
 * Seed a real Supabase project with the deterministic demo
 * dataset (Batches 29–38, 316 conflict-free classes).
 *
 *  Usage:
 *    SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" \
 *    node scripts/seed-supabase.mjs
 *
 *  - Text ids in src/lib/seed.json are mapped to deterministic
 *    UUIDs, so foreign keys stay consistent and rows are
 *    idempotent (on conflict do nothing).
 *  - Assumes supabase/schema.sql has already been run.
 * ============================================================ */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const seed = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src', 'lib', 'seed.json'), 'utf8'),
);

const DB_URL = (process.env.SUPABASE_DB_URL ?? '').replace(/\?sslmode=[^&]*/, '');

if (!DB_URL) {
  console.error('Missing SUPABASE_DB_URL (session pooler connection string).');
  process.exit(1);
}

/* deterministic UUID from any string id (RFC-4122 shaped, v5-style) */
function uuidFrom(text) {
  const h = createHash('md5').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const id = (v) => (v == null ? null : uuidFrom(String(v)));

/* table -> { columns with special mapping } */
/* jsonKey in seed.json -> sql table name */
const TABLES = [
  { k: 'semesters', t: 'semesters', map: { id: id } },
  { k: 'batches', t: 'batches', map: { id: id } },
  { k: 'sections', t: 'sections', map: { id: id, batch_id: id } },
  { k: 'labGroups', t: 'lab_groups', map: { id: id, section_id: id } },
  { k: 'faculty', t: 'faculty', map: { id: id } },
  { k: 'courses', t: 'courses', map: { id: id } },
  { k: 'rooms', t: 'rooms', map: { id: id } },
  { k: 'timeSlots', t: 'time_slots', map: { id: id } },
  { k: 'classDays', t: 'class_days', map: { id: id } },
  { k: 'routineEntries', t: 'routine_entries', map: { id: id, semester_id: id, batch_id: id, section_id: id, lab_group_id: id, course_id: id, faculty_id: id, room_id: id, day_id: id, time_slot_id: id } },
  { k: 'batchOffDays', t: 'batch_off_days', map: { id: id, semester_id: id, batch_id: id, day_id: id } },
  { k: 'announcements', t: 'announcements', map: { id: id, semester_id: id, batch_id: id } },
];

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('✓ connected to Supabase database');

  const counts = {};
  for (const { k, t, map } of TABLES) {
    const rows = seed[k] ?? [];
    const mapped = rows.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        if (v == null) { out[k] = null; continue; }
        out[k] = map[k] ? map[k](v) : v;
      }
      return out;
    });
    if (!mapped.length) { counts[t] = 0; continue; }
    const cols = Object.keys(mapped[0]);
    /* build parameterized batch insert (single statement, chunked) */
    const CHUNK = 50;
    let inserted = 0;
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK);
      const placeholders = [];
      const params = [];
      chunk.forEach((row, ri) => {
        const rowPh = cols.map((c, ci) => {
          params.push(row[c]);
          return `$${ri * cols.length + ci + 1}`;
        });
        placeholders.push(`(${rowPh.join(',')})`);
      });
      const sql = `insert into ${t} (${cols.join(',')}) values ${placeholders.join(',')}
        on conflict (id) do nothing
        returning id;`;
      const res = await client.query(sql, params);
      inserted += res.rowCount;
    }
    counts[t] = inserted;
    console.log(`  ${t}: ${inserted} inserted (${mapped.length} in seed)`);
  }

  /* settings: upsert by key */
  const settingsRows = (seed.settings ?? []).map((s) => [s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value)]);
  let settingsDone = 0;
  for (const [k, v] of settingsRows) {
    const res = await client.query(
      `insert into settings (key, value) values ($1, $2::jsonb)
       on conflict (key) do update set value = excluded.value`,
      [k, v],
    );
    settingsDone += res.rowCount;
  }
  console.log(`  settings: ${settingsDone} upserted`);

  console.log('✓ seeding complete');
  console.log(JSON.stringify(counts));
  await client.end();
}

main().catch((e) => { console.error('✗ seeding failed:', e.message); process.exit(1); });
