# PharmRoutine DIU — Handover & Setup Guide

This document is for the new owner of this repository. It explains what the product is,
which external services it depends on, and exactly how to deploy and run it.

---

## 1. What this product is

A class-routine portal for the Department of Pharmacy, Daffodil International University:

- **Student side** — view routine by batch/section, faculty schedules, batch schedule,
  laboratory view (A1/A2 · B1/B2 combined or individual), search, notices, contacts.
- **Admin side (secret access only)** — Batches & Groups, Rooms, Faculty, Courses,
  Batch Advisors, Off Days, Announcements, and the **Smart Routine Generator**
  (import official offer → review → configure rules → generate conflict-free routine →
  publish to students). Admin login is intentionally hidden: visit `/login`,
  press `Ctrl+Shift+L`, or tap the footer logo 5 times.

Tech stack: **Vite + React + TypeScript** (frontend), **Supabase** (Postgres database,
auth, edge function), deployed on **Vercel**.

---

## 2. Required accounts / services

| Service | Purpose | Cost |
|---|---|---|
| GitHub | Source control (this repo) | free |
| Vercel | Hosts the website | free (Hobby plan) |
| Supabase | Database, auth, `magic-admin` edge function | free tier |

---

## 3. Secrets & environment variables (ALL must be set; no real values here)

| Variable | Where it goes | What it is |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel → Project → Settings → Environment Variables (and `.env.local` for local dev) | e.g. `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | same as above | Supabase anon/public API key (Dashboard → Project Settings → API) |
| `VITE_ADMIN_PASSCODE` | same as above | Admin passcode used by the client to call `magic-admin` |
| `FUNCTIONS_ADMIN_PASSCODE` | Supabase Dashboard → Edge Functions → `magic-admin` → Settings → Secrets | **Must equal `VITE_ADMIN_PASSCODE`** — this is the server-side verifier |

> ⚠️ **Before go-live, CHANGE the passcode**: set new values for both
> `VITE_ADMIN_PASSCODE` (Vercel) and `FUNCTIONS_ADMIN_PASSCODE` (Supabase function
> secret). The repository contains a legacy default fallback; once the real secrets
> are set, the fallback is ignored. After changing, redeploy.

---

## 4. Deploy steps (fresh setup)

1. **Vercel** — import this repo → framework preset **Vite** → add the 3 environment
   variables above → deploy. The site builds automatically on every push.
2. **Supabase** — create a project, then run the SQL in `supabase/schema.sql`
   (tables, RLS policies, `is_admin()` helper) via SQL Editor.
3. **Edge function** — deploy `supabase/functions/magic-admin` with the
   `FUNCTIONS_ADMIN_PASSCODE` secret set (see §3).
4. **Database content** — the live data (batches, faculty, rooms, routine entries,
   settings, batch-advisor map, off days) must be provided by the previous owner
   (dump via Supabase Dashboard → Database → Backup, or export via the SQL editor)
   or re-created through the admin panel.
5. **Official course offer** — the bundled Fall 2026 offer lives in
   `src/admin/generator/official-offer.json` (replace with the current semester's
   official file when changed).

---

## 5. Admin access (intentionally hidden — do not publish these)

1. Visit `<your-domain>/login` — **or** press `Ctrl+Shift+L` — **or** tap the
   Daffodil footer logo 5 times.
2. Enter the admin passcode (see §3).
3. Admin dashboard lives at `<your-domain>/admin`.

Demo shortcuts never appear in production builds.

---

## 6. Notes for the buyer

- Badge/SSO users, student selection preferences, and published routines are stored
  in the Supabase `settings` / `routine_entries` tables — they move with the
  database, not with this repo.
- The PNG/PDF export includes the official DIU emblem and the credit banner
  ("Md Musfiqur Rahaman — Research & Academic Affairs Secretary") as per the
  department's requirements.
- All UI text, faculty contacts, room labels (AB-1 "Inspiration Building", Classroom
  AB-402/403/404/504) and rules encoding DIU Pharmacy policy are in this repo — the
  department maintains them.
