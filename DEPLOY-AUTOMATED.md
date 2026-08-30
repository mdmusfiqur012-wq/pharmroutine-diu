# 🤖 Fully automated deploy — one command

`scripts/deploy.mjs` creates a **free Supabase project**, applies the schema, seeds the
Batches 29–38 dataset, creates the **admin account**, then creates and deploys the app on
**Vercel** — with the Supabase env vars wired in automatically.

## What you need (3 tokens)

| Token | Where to get it | Permissions |
|---|---|---|
| **Supabase** (`sbp_…`) | https://supabase.com/dashboard/account/tokens | `ALL` (Management API) |
| **Vercel** | https://vercel.com/account/tokens | Full access |
| **GitHub** (optional — pushes repo updates) | fine-grained PAT | Contents: read/write |

## Admin access (as requested — no visible admin login)

There is **no admin login section** shown anywhere. On the login page, typing the
**admin passcode** (default `adminlogin7766`, override with `ADMIN_PASSCODE=…`) into the
**email field** and pressing **Verify & Continue** signs you straight into the admin
dashboard. The passcode is verified **server-side** by the `magic-admin` Edge Function
(`supabase/functions/magic-admin`, deployed automatically, `verify_jwt = false`) against
the `FUNCTIONS_ADMIN_PASSCODE` secret — it then issues a one-time session token for the
`role='admin'` profile. The demo-accounts card is hidden whenever Supabase is connected.

## Run it

```bash
SUPABASE_TOKEN=sbp_xxx \
VERCEL_TOKEN=xxxx \
GITHUB_TOKEN=github_pat_xxx \
node scripts/deploy.mjs
```

Optional knobs:

```bash
SUPABASE_REGION=ap-southeast-1   # default; closest to Bangladesh
ADMIN_EMAIL=admin@diu.edu.bd     # default
ADMIN_PASSWORD=YourStrongPass!   # default: generated & printed
```

## What the script does, step by step

1. **Creates the project** — `POST /v1/projects` (free plan, `ap-southeast-1`)
2. **Waits for health** — polls the Management API until the DB is up (~1–3 min)
3. **Applies `supabase/schema.sql`** — connects through the session pooler
   (`aws-0-{region}.pooler.supabase.com:5432`, `postgres.<ref>` user) and runs the DDL:
   14 tables, RLS policies, the conflict-prevention trigger, RPC, auto-profile trigger
4. **Seeds the dataset** — `scripts/seed-supabase.mjs` inserts Batches 29–38
   (316 conflict-free classes, catalog, off days, announcements, colors) using
   deterministic UUIDs → idempotent, safe to re-run
5. **Creates the admin** — Auth Admin API (`service_role` key) creates
   `admin@diu.edu.bd` (email confirmed) and promotes the profile to `role='admin'`
6. **Deploys to Vercel** — `vercel link` (project `pharmroutine-diu`) →
   `vercel env add VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY production` →
   `vercel deploy --prod`
7. **Prints everything**: dashboard URLs, anon key, admin credentials, live app URL
8. *(with `GITHUB_TOKEN`)* commits the tooling and pushes it to GitHub

## Result

```
Supabase project : https://supabase.com/dashboard/project/<ref>
Supabase URL     : https://<ref>.supabase.co
Admin login      : admin@diu.edu.bd / <password>
Live app         : https://pharmroutine-diu.vercel.app
```

## Notes

- RLS is on: catalog & routines are world-readable (students need no account);
  writes are admin-only; the conflict trigger blocks overlapping classes server-side.
- The free-tier Supabase project can be upgraded later without any code change.
- Re-run the script against an existing project? Delete the project first, or pass
  your own `SUPABASE_DB_URL` and skip creation — the seed script alone does
  `SUPABASE_DB_URL=... node scripts/seed-supabase.mjs`.
