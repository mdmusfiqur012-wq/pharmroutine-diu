/* ============================================================
 * Core domain types — shared by every layer of the portal.
 * Mirrors the Supabase PostgreSQL schema 1:1 (see supabase/).
 * ============================================================ */

export type ID = string;

/* special lab-group selections used by the student routine panel */
export const NO_LAB = 'none';            /* theory only — no lab sessions */
export const COMBINED_LAB = 'combined';  /* both lab groups of the section (e.g. B1 + B2) */

export type FacultyType = 'regular' | 'guest' | 'ged' | 'nfe' | 'external';
export type ClassType = 'theory' | 'lab';
export type EntryStatus = 'active' | 'cancelled' | 'rescheduled';
export type CourseDepartment = 'pharmacy' | 'ged' | 'nfe' | 'agriculture';
export type CourseMode = 'theory' | 'lab' | 'theory_lab';
export type RoomType = 'theory' | 'lab' | 'multipurpose';
export type Role = 'admin' | 'faculty' | 'student';

export interface Semester {
  id: ID;
  name: string;          // e.g. "Spring 2026"
  code: string;          // e.g. "SP26"
  is_active: boolean;
  start_date?: string;
  end_date?: string;
}

export interface Batch {
  id: ID;
  batch_no: number;              // 29 .. 38
  name: string;                  // "Batch 34"
  admission_year: number;
  current_level: number;         // curriculum level / semester number 1..8
  is_active: boolean;
}

export interface Section {
  id: ID;
  name: 'A' | 'B' | 'RT';
  batch_id: ID;
}

export interface LabGroup {
  id: ID;
  name: 'A1' | 'A2' | 'B1' | 'B2';
  section_id: ID;
}

export interface Faculty {
  id: ID;
  name: string;
  initials: string;
  designation: string;
  department: string;
  faculty_type: FacultyType;
  email?: string;
  phone?: string;
  is_active: boolean;
}

export interface Course {
  id: ID;
  code: string;
  title: string;
  credit: number;
  course_mode: CourseMode;
  department: CourseDepartment;
  level: number;                 // curriculum level (1..8)
  is_active: boolean;
}

export interface Room {
  id: ID;
  code: string;
  name: string;
  building: string;
  room_type: RoomType;
  capacity: number;
  is_active: boolean;
}

export interface TimeSlot {
  id: ID;
  label: string;                 // "8:30 AM – 10:00 AM"
  start_time: string;            // "08:30"
  end_time: string;              // "10:00"
  sequence: number;
  is_active: boolean;
}

export interface ClassDay {
  id: ID;
  name: string;                  // "Saturday"
  short_name: string;            // "Sat"
  sequence: number;
  is_active: boolean;
}

export interface RoutineEntry {
  id: ID;
  semester_id: ID;
  batch_id: ID;
  section_id: ID;
  lab_group_id: ID | null;       // null → theory class; set → laboratory class
  course_id: ID;
  faculty_id: ID;
  room_id: ID;
  day_id: ID;
  time_slot_id: ID;
  class_type: ClassType;
  status: EntryStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchOffDay {
  id: ID;
  semester_id: ID;
  batch_id: ID;
  day_id: ID;
  reason?: string | null;
  is_active: boolean;
}

export interface Announcement {
  id: ID;
  title: string;
  body: string;
  category: 'notice' | 'urgent' | 'event' | 'routine';
  semester_id?: ID | null;
  batch_id?: ID | null;
  pinned: boolean;
  is_active: boolean;
  created_by?: ID | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;   // JSON-encoded
}

export interface Profile {
  id: ID;
  full_name: string;
  email: string;
  role: Role;
  department?: string | null;
  faculty_id?: ID | null;
}

/* ---------- Aggregates / views used by the UI ---------- */

export interface Database {
  semesters: Semester[];
  batches: Batch[];
  sections: Section[];
  labGroups: LabGroup[];
  faculty: Faculty[];
  courses: Course[];
  rooms: Room[];
  timeSlots: TimeSlot[];
  classDays: ClassDay[];
  routineEntries: RoutineEntry[];
  batchOffDays: BatchOffDay[];
  announcements: Announcement[];
  settings: Setting[];
}

export interface RoutineSelection {
  semester_id: ID;
  batch_id: ID;
  section_id: ID;
  lab_group_id: ID | typeof NO_LAB | typeof COMBINED_LAB;
}

/** A fully joined routine entry (denormalized for rendering) */
export interface JoinedEntry extends RoutineEntry {
  semester?: Semester;
  batch?: Batch;
  section?: Section;
  labGroup?: LabGroup | null;
  course?: Course;
  faculty?: Faculty;
  room?: Room;
  day?: ClassDay;
  timeSlot?: TimeSlot;
}

export interface ConflictIssue {
  kind: 'faculty' | 'room' | 'section' | 'lab_group';
  message: string;
  conflictWith?: JoinedEntry;
}

export interface ConflictCheckResult {
  ok: boolean;
  issues: ConflictIssue[];
}

export interface SessionUser {
  id: ID;
  email: string;
  role: Role;
  full_name: string;
}

/* ---------- Color system ---------- */

export interface ClassColors {
  theory: string;
  lab: string;
  guest: string;
  ged: string;
  nfe: string;
  agriculture: string;
  cancelled: string;
  rescheduled: string;
}

export interface AppSettings {
  universityName: string;
  departmentName: string;
  universityTagline: string;
  colors: ClassColors;
}
