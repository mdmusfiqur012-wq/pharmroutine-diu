# 🚀 Production deployment — PharmRoutine DIU

Two parts: (1) the Supabase backend, (2) the frontend. Everything below works free-tier.

---

## 1 · Supabase (PostgreSQL backend)

1. Create a project at https://supabase.com → **New project** (pick a region near your users).
2. Open **SQL Editor** → paste the whole contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   This creates all 14 tables, the conflict-prevention trigger, the RLS policies, the
   `check_routine_conflict()` RPC and the auto-profile trigger for new users.
3. Seed the catalog (faculty, courses, rooms, batches, routines, off days):
   - Easiest: run the generator locally and replay the output:
     ```bash
     npm i
     node scripts/generate-seed.mjs      # writes src/lib/seed.json (deterministic, conflict-free)
     ```
     then import `src/lib/seed.json` into Supabase (copy → SQL Editor via `pgsql-json` or use the
     **Table Editor** insert, or a tiny script with the Supabase service key).
   - Or enter data by hand from the app's **Admin dashboard** — every catalog entity has a CRUD UI.

### Make your first admin

1. **Authentication → Users → Add user** (email + password) — e.g. `admin@diu.edu.bd`.
2. **SQL Editor**:
   ```sql
   update profiles set role = 'admin', full_name = 'Routine Administrator'
   where id = (select id from auth.users where email = 'admin@diu.edu.bd');
   ```

### Get the keys

**Project Settings → API** (or **Connect**):
- `Project URL` → `VITE_SUPABASE_URL`
- `anon public` key → `VITE_SUPABASE_ANON_KEY`

> RLS keeps all catalog + routine data world-readable (students need no account).
> Writes are admin-only; faculty may update their own entries. The conflict trigger
> rejects overlapping classes server-side no matter what.

---

## 2 · Frontend (Vercel or Netlify — both free)

### Option A — Vercel (recommended)

1. Import your GitHub repo → **vercel.com/new** → select `pharmroutine-diu`.
2. Framework preset: **Vite** (auto-detected). Build `npm run build`, output `dist`.
3. **Environment Variables** (Settings → Environment Variables):
   ```
   VITE_SUPABASE_URL   = https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJ...
   ```
4. Deploy → you get `https://pharmroutine-diu.vercel.app`.

### Option B — Netlify

1. **netlify.com → Add new site → Import from Git** → `pharmroutine-diu`.
2. Build command `npm run build` · publish directory `dist`.
3. Add the same two env variables (Site settings → Environment variables).
4. Deploy.

### Option C — any static host

`npm run build` produces a `dist/` folder — drop it on GitHub Pages, Cloudflare Pages,
S3, or your own server. Just make sure the two `VITE_*` env vars are set at build time.

---

## 3 · Post-deploy checklist

- [ ] Sign in as admin → **Admin → Settings & Colors** to confirm branding + colors.
- [ ] **Admin → Batch Off Days** — verify each batch's calendar (they are independent by design).
- [ ] **Admin → Routine Entries** → add a class → deliberately pick an overlapping slot →
      confirm the conflict warning appears and the DB trigger blocks the insert.
- [ ] Student flow: `/login` → enter any `@diu.edu.bd` email → non-DIU email is rejected.
- [ ] Generate a routine (Batch 34 → A → A1), export PDF + PNG, print.
- [ ] Add Batch 39 from **Admin → Batches** to see auto-created sections/groups.

## 4 · Local development

```bash
git clone https://github.com/<you>/pharmroutine-diu
cd pharmroutine-diu
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5173
```

> No `.env`? The app runs in **demo mode** with the embedded dataset — every page works
> without any backend (that's what you've been previewing).
