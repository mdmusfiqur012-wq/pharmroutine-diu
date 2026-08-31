/* ============================================================
 * Smart Routine Generator — import & normalization.
 *  · Loads the official departmental course offer (Fall 2026)
 *  · Parses uploaded Excel/CSV files (SheetJS)
 *  · Parses pasted table text (PDF copy/paste style)
 *  · Produces clean OfferRow[] + inspection issues.
 * Nothing here assumes data the department did not provide —
 * missing info is flagged for the administrator instead.
 * ============================================================ */
import * as XLSX from 'xlsx';
import OFFICIAL from './official-offer.json';
import type { OfferRow, OfferType, GenCtx, OfferIssue } from './types';

let seq = 0;
const oid = () => `off-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function isLabType(s: string): boolean {
  const t = s.toLowerCase();
  return /lab|practical|pract/i.test(t) && !/theory/.test(t);
}
export function isPrjType(s: string): boolean {
  return /prj|oral|project|training|assessment/i.test(s);
}
export function isGedType(s: string): boolean {
  return /ged|english|computer fundamentals|mathematics|art of living|emergence|employability/i.test(s);
}

/** Normalize a type label from the sheet into our OfferType. */
export function normalizeType(raw: string | undefined, title: string, credits: number): OfferType {
  const s = `${raw ?? ''} ${title}`;
  if (!raw || isGedType(s)) {
    if (isGedType(s)) return 'ged';
    if (isLabType(s)) return 'lab';
  }
  if (isLabType(s)) return 'lab';
  if (isPrjType(s)) return 'prj';
  return 'theory';
}

/* ------------------------------------------------------------------ */
/* Official course offer (bundled — the department's Fall 2026 sheet)  */
/* ------------------------------------------------------------------ */

export interface OfficialBundle {
  offers: OfferRow[];
  facultyOff: Record<string, string[]>;
  label: string;
}

/** Full course catalog embedded with the official offer (code → title/credits/type).
 *  Used to auto-fill a course title the moment its code is entered. */
export function officialCatalog(): Record<string, { title: string; credits: number; type: OfferType }> {
  const out: Record<string, { title: string; credits: number; type: OfferType }> = {};
  for (const [code, m] of Object.entries(OFFICIAL.courses as unknown as Record<string, [string, number, string]>)) {
    out[code] = { title: String(m?.[0] ?? ''), credits: Number(m?.[1] ?? 0), type: (m?.[2] ?? 'theory') as OfferType };
  }
  return out;
}

export function loadOfficialOffer(): OfficialBundle {
  const offers: OfferRow[] = [];
  const meta = OFFICIAL.courses as unknown as Record<string, [string, number, string]>;
  for (const b of OFFICIAL.batches as any[]) {
    for (const sec of ['A', 'B'] as const) {
      for (const [code, matrixCredits, rawFac] of b.sections[sec]) {
        const m = meta[code];
        const title = m ? m[0] : '';
        const credits = m ? m[1] : Number(matrixCredits);
        const type: OfferType = m ? (m[2] as OfferType) : 'theory';
        const fac = (OFFICIAL.aliases as any)[rawFac] ?? rawFac;
        offers.push({
          id: oid(),
          batchNo: b.batchNo,
          section: sec,
          code,
          title,
          credits,
          type,
          faculty: fac,
          facultyRaw: rawFac,
          issues: [],
          source: 'official',
        });
      }
    }
  }
  return { offers, facultyOff: OFFICIAL.facultyOff as Record<string, string[]>, label: OFFICIAL.label };
}

/* ------------------------------------------------------------------ */
/* Uploaded Excel / CSV                                                */
/* ------------------------------------------------------------------ */

export interface ImportStats { rows: number; errors: string[] }

function cell(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Parse an uploaded .xlsx / .csv file into OfferRow[]. Header row auto-detected. */
export async function parseWorkbookFile(file: File): Promise<{ offers: OfferRow[]; errors: string[] }> {
  const buf = await file.arrayBuffer();
  const errors: string[] = [];
  let rows: any[][] = [];
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
  } else {
    const text = new TextDecoder().decode(buf);
    rows = text.split(/\r?\n/).map((l) => l.split('\t'));
    if (rows.every((r) => r.length <= 1)) rows = text.split(/\r?\n/).map((l) => l.split(','));
  }
  return { offers: rowsToOffers(rows, errors, file.name), errors };
}

/** Convert a raw 2-D table into offers using header detection (or positional fallback). */
export function rowsToOffers(rows: any[][], errors: string[], source: string): OfferRow[] {
  const head = (rows[0] ?? []).map(cell);
  const idx = (names: string[]): number => {
    for (const n of names) { const i = head.findIndex((h) => h.toLowerCase().includes(n)); if (i >= 0) return i; }
    return -1;
  };
  const iBatch = idx(['batch']); const iSec = idx(['section']); const iCode = idx(['course code', 'subject', 'code']);
  const iTitle = idx(['title', 'course']); const iCred = idx(['credit']); const iType = idx(['type', 'mode']);
  const iFac = idx(['faculty', 'teacher', 'initial']);
  const hasHeader = iBatch >= 0 || iCode >= 0;
  const offers: OfferRow[] = [];
  const body = hasHeader ? rows.slice(1) : rows;
  for (const r of body) {
    const batchRaw = cell(hasHeader ? r[iBatch] : r[0]);
    const code = cell(hasHeader && iCode >= 0 ? r[iCode] : r[1]);
    if (!code || !/^[0-9]{3,4}-?[0-9]{3,4}$/.test(code.replace(/\s/g, ''))) continue;
    const batchNo = parseInt(batchRaw.replace(/\D/g, ''), 10);
    const secRaw = cell(hasHeader && iSec >= 0 ? r[iSec] : r[0]).toUpperCase();
    const section = (secRaw.includes('B') ? 'B' : secRaw.includes('A') ? 'A' : batchRaw.toUpperCase().includes('B') ? 'B' : 'A');
    if (!batchNo) { errors.push(`Row without batch number skipped: ${code}`); continue; }
    const title = cell(hasHeader && iTitle >= 0 ? r[iTitle] : r[2]);
    const credits = Number(hasHeader && iCred >= 0 ? r[iCred] : r[3]) || 0;
    const typeRaw = cell(hasHeader && iType >= 0 ? r[iType] : r[4]);
    const facRaw = cell(hasHeader && iFac >= 0 ? r[iFac] : r[5]).replace(/^GT\s*[-(]/i, 'GT(').replace(/\)$/, ')');
    offers.push({
      id: oid(), batchNo, section, code: code.replace(/\s/g, ''), title, credits,
      type: typeRaw || title ? normalizeType(typeRaw, title, credits) : 'theory',
      faculty: facRaw, facultyRaw: facRaw, issues: [], source: 'xlsx',
    });
  }
  return offers;
}

/* ------------------------------------------------------------------ */
/* Pasted text (matrix style from the official PDF / Excel columns)    */
/* ------------------------------------------------------------------ */

/** Parse a pasted offer table (CSV/TSV, or the batch×faculty matrix). */
export function parsePastedText(text: string): { offers: OfferRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: any[][] = lines.map((l) => l.includes('\t') ? l.split('\t') : l.split(/\s{2,}/));
  if (rows.some((r) => r.length > 2 && /batch|section/i.test(rows[0]?.join(' ') ?? '')) || rows[0]?.length > 2) {
    const offers = rowsToOffers(rows, errors, 'paste').map((o) => ({ ...o, source: 'paste' as const }));
    if (offers.length) return { offers, errors };
  }
  // matrix style: "Subject ..." line then "29 A FAC1 FAC2 ..." lines
  const offers: OfferRow[] = [];
  let codes: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^subject/i.test(l)) {
      codes = (l.replace(/^subject/i, '').match(/[0-9]{4}-?[0-9]{3,4}/g) ?? []).map((c) => c.replace(/\s/g, ''));
      continue;
    }
    const m = l.match(/^(\d{2})\s+([AB])\s+(.*)$/);
    if (m && codes.length) {
      const batchNo = parseInt(m[1], 10);
      const section = m[2] as 'A' | 'B';
      const facs = m[3].split(/\s+/).filter(Boolean);
      let j = 0;
      for (const code of codes) {
        // 0-credit rows (project/training/oral) may have no faculty listed
        const fac = facs[j] ?? '';
        offers.push({ id: oid(), batchNo, section, code, title: '', credits: 0, type: 'theory', faculty: fac, facultyRaw: fac, issues: [], source: 'paste' });
        if (fac) j++;
      }
    }
  }
  if (!offers.length) errors.push('Could not detect a batch × subject × faculty matrix. Provide columns: Batch, Section, Course Code, Title, Credits, Type, Faculty (Excel/CSV works best).');
  return { offers, errors };
}

/* ------------------------------------------------------------------ */
/* Inspection — flag anything the department's data did not provide    */
/* ------------------------------------------------------------------ */

export function inspectOffers(offers: OfferRow[], ctx: GenCtx | null, knownFaculty: string[]): OfferIssue[] {
  const issues: OfferIssue[] = [];
  const known = new Set(knownFaculty);
  const seen = new Set<string>();
  for (const o of offers) {
    seen.add(o.code);
    if (!o.title) issues.push({ kind: 'missing-title', offerId: o.id, message: `Course ${o.code} has no title yet — add it or map it in Review.` });
    if (!o.credits) issues.push({ kind: 'no-credits', offerId: o.id, message: `Course ${o.code} has no credits — provide them (they set the weekly session count).` });
    if (!o.faculty) {
      // PRJ (Project / Industrial Training / Oral Assessment) is supervised by the
      // department coordinator — no individual faculty is required, so it never blocks.
      if (o.type !== 'prj') issues.push({ kind: 'no-faculty', offerId: o.id, message: `No faculty assigned to ${o.code} (${o.batchNo}${o.section}).` });
    }
    else if (!known.has(o.faculty) && !/^[A-Z]{2,4}$/.test(o.faculty)) issues.push({ kind: 'unknown-faculty', offerId: o.id, message: `Unknown faculty "${o.faculty}" for ${o.code} — match to a staff member in Review.` });
    if (o.type === 'lab' && !ctx) issues.push({ kind: 'missing-type', offerId: o.id, message: `${o.code} marked as Laboratory — ensure lab rooms are configured.` });
  }
  return issues;
}

export function missingCourseMeta(offers: OfferRow[]): { code: string; batchNo: number }[] {
  const byCode = new Map<string, { title: string; credits: number; type: string }>();
  for (const o of offers) {
    const cur = byCode.get(o.code);
    if (!cur || (!cur.title && o.title)) byCode.set(o.code, { title: o.title, credits: o.credits, type: o.type });
  }
  return [...byCode.entries()].filter(([, v]) => !v.title || !v.credits).map(([code, v]) => ({ code, batchNo: offers.find((o) => o.code === code)?.batchNo ?? 0 }));
}
