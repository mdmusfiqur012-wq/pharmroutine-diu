/* ============================================================
 * Smart Routine Generator — type definitions.
 * Pure data shapes shared by the parser, the scheduling engine
 * and the admin workflow UI. Nothing here touches student UI.
 * ============================================================ */

export type OfferType = 'theory' | 'lab' | 'ged' | 'prj';

/** One imported course-offer row (batch · section · course · faculty). */
export interface OfferRow {
  id: string;
  batchNo: number;
  section: 'A' | 'B';
  code: string;
  title: string;
  credits: number;
  type: OfferType;          // theory | lab (practical) | ged | prj
  faculty: string;          // initials (resolved alias, e.g. MMS, RZ)
  facultyRaw: string;       // as printed on the sheet (GT(MM), …)
  /** rows flagged during review: missing title / unknown faculty / no faculty */
  issues: string[];
  source: 'official' | 'xlsx' | 'paste' | 'manual';
}

/** Review state of an offer row — what the admin corrected before generation. */
export interface OfferIssue {
  kind: 'missing-title' | 'unknown-faculty' | 'no-faculty' | 'missing-type' | 'no-credits' | 'unknown-code';
  offerId: string;
  message: string;
}

/* ---------------- configuration (department rules) ---------------- */

export interface GenConfig {
  /** batchNo → class-day id ('' = no off day) */
  offDays: Record<string, string>;
  /** faculty initials → [day names] the faculty never teaches */
  facultyOff: Record<string, string[]>;
  /** faculty initials → room code, always used for THEORY classes (DSS → AB-1 104, MSH → AB-1 406) */
  fixedRooms: Record<string, string>;
  /** faculty initials the generator must never alter (MUA) */
  lockedFaculty: string[];
  /** classroom codes available for theory/GED/PRJ (AB-1 103 & AB-1 504 excluded by default) */
  theoryRooms: string[];
  /** laboratory codes available */
  labRooms: string[];
  /** course code → allowed laboratory codes (empty = use labRooms) */
  labRoomsByCourse: Record<string, string[]>;
  /** sessions per week for a 3-credit / 2-credit / 1-credit theory-style course */
  sessions: { 3: number; 2: number; 1: number };
}

export const DEFAULT_CONFIG: GenConfig = {
  offDays: {},
  facultyOff: {},
  fixedRooms: { DSS: 'AB-1 104', MSH: 'AB-1 406' },
  lockedFaculty: ['MUA'],
  theoryRooms: ['AB-1 103', 'AB-1 104', 'AB-1 402', 'AB-1 403', 'AB-1 404', 'AB-1 405', 'AB-1 406', 'AB-1 504'],
  labRooms: ['AB-1 602', 'AB-1 603', 'AB-1 605', 'AB-1 606', 'AB-1 702', 'AB-1 703', 'AB-1 704', 'AB-1 706'],
  labRoomsByCourse: {},
  sessions: { 3: 2, 2: 1, 1: 1 },
};

/* ---------------- locks & rotations ---------------- */

/** A class the admin pinned to an exact day/slot (and optional rooms). Survives regeneration. */
export interface ClassLock {
  uid: string;              // stable unit id
  dayId: string;
  slotId: string;
  roomId?: string;          // theory/ged/prj room
  groupRooms?: Record<string, string>; // lab groupId → roomId
  label: string;
}

/** Persistent lab-group rotation memory per (course, section). */
export type RotationState = Record<string, { a: string; b: string }>; // key course:section → room codes

/* ---------------- scheduling ---------------- */

export interface GenDay { id: string; name: string; short: string; seq: number }
export interface GenSlot { id: string; label: string; start: string; end: string; seq: number }
export interface GenRoom { id: string; code: string; type: 'theory' | 'lab' | 'multipurpose' }
export interface GenGroup { id: string; name: string; sectionId: string }
export interface GenCtx {
  semesterId: string;
  days: GenDay[];
  slots: GenSlot[];
  rooms: GenRoom[];
  groups: GenGroup[];
  sections: { id: string; name: string; batchId: string }[];
  batches: { id: string; batchNo: number; name: string }[];
}

/** A scheduled class (one cell = one group row). Labs produce one row per group. */
export interface GenClass {
  uid: string;
  offerId: string;
  code: string;
  title: string;
  type: OfferType;
  credits: number;
  faculty: string;
  batchNo: number;
  section: 'A' | 'B';
  groupId: string | null;   // lab rows only
  dayId: string;
  slotId: string;
  roomId: string;
  labPartnerUid?: string;   // the twin group row of the same lab session
  locked: boolean;
  /** publishing bookkeeping */
  entryId?: string;
}

export interface ConflictIssue {
  severity: 'error' | 'warning';
  kind: 'faculty' | 'room' | 'batch' | 'lab' | 'offday' | 'fixed' | 'data';
  message: string;
  unit?: string;
}

export interface ConflictReport {
  issues: ConflictIssue[];
  scheduled: number;
  failed: number;
  ok: boolean;
}

export interface GenStats {
  theory: number;
  labs: number;
  prj: number;
  batches: number;
  facultyUsed: number;
  roomsUsed: number;
  utilization: number;      // scheduled cells / available cells
}

export interface GenResult {
  classes: GenClass[];
  report: ConflictReport;
  stats: GenStats;
  rotation: RotationState;
}
