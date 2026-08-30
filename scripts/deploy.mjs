/* ============================================================
 * One-shot automated deploy for PharmRoutine DIU.
 *
 *   SUPABASE_TOKEN=sbp_... \
 *   VERCEL_TOKEN=... \
 *   GITHUB_TOKEN=github_pat_... \
 *   [SUPABASE_REGION=ap-southeast-1] \
 *   [ADMIN_EMAIL=admin@diu.edu.bd] [ADMIN_PASSWORD=...] \
 *   node scripts/deploy.mjs
 *
 * Steps:
 *   1. Create a free Supabase project (region, strong DB password)
 *   2. Wait until it's healthy
 *   3. Apply supabase/schema.sql via the session pooler (tables +
 *      RLS + conflict trigger + RPC)
 *   4. Seed Batches 29–38 demo dataset (deterministic UUIDs)
 *   5. Create the admin auth user + promote to role 'admin'
 *   6. Deploy the frontend to Vercel with VITE_SUPABASE_* env vars
 *   7. Print the live URLs + credentials
 * ============================================================ */

import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const SB = process.env.SUPABASE_TOKEN;
const VC = process.env.VERCEL_TOKEN;
const GH = process.env.GITHUB_TOKEN;
const REGION = process.env.SUPABASE_REGION ?? 'ap-southeast-1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@diu.edu.bd';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? `Admin@${randomBytes(6).toString('hex')}`;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? 'adminlogin7766';

if (!SB || !VC) {
  console.error('Required: SUPABASE_TOKEN (sbp_…) and VERCEL_TOKEN. Optional: GITHUB_TOKEN (to push repo updates), ADMIN_EMAIL, ADMIN_PASSWORD.');
  process.exit(1);
}

const api = async (url, opts = {}, raw = false) => {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status} ${url}\n${text.slice(0, 400)}`);
  return raw ? text : JSON.parse(text || '{}');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 1·2 · create project ---- */
console.log('① Supabase: creating project…');
const orgs = await api('https://api.supabase.com/v1/organizations');
const orgId = orgs[0]?.id;
if (!orgId) throw new Error('No Supabase organization found for this token.');
const dbPass = `Db!${randomBytes(12).toString('hex')}`;
const created = await api('https://api.supabase.com/v1/projects', {
  method: 'POST',
  body: JSON.stringify({ organization_id: orgId, name: 'pharmroutine-diu-db', region: REGION, db_pass: dbPass, plan: 'free' }),
});
const ref = created.id ?? created.ref;
console.log(`   created ref=${ref} region=${REGION} (status: ${created.status ?? 'creating'})`);

let proj = created;
for (let i = 0; i < 40; i++) {
  await sleep(8000);
  proj = await api(`https://api.supabase.com/v1/projects/${ref}`);
  const st = proj.status ?? '';
  if (String(st).includes('HEALTHY')) break;
  console.log(`   waiting… (${st || 'creating'})`);
}
if (!String(proj.status ?? '').includes('HEALTHY')) console.warn('   project still starting — continuing anyway');

/* ---- 3 · schema ---- */
console.log('② Applying schema via session pooler…');
const pooler = `aws-0-${REGION}.pooler.supabase.com`;
const conn = `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@${pooler}:5432/postgres`;
const schema = readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8');
{
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(schema);
  console.log('   schema.sql executed ✓ (tables, RLS, conflict trigger, RPC)');
  await c.end();
}

/* ---- 4 · seed ---- */
console.log('③ Seeding Batches 29–38 dataset…');
execSync(`node scripts/seed-supabase.mjs`, {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_DB_URL: conn },
});

/* ---- 5 · admin user ---- */
console.log('④ Creating admin account…');
const keys = await api(`https://api.supabase.com/v1/projects/${ref}/api-keys`);
const svc = keys.find((k) => k.name === 'service_role');
const anon = keys.find((k) => k.name === 'anon');
if (!svc || !anon) throw new Error('Could not fetch API keys.');
const authRes = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: svc.api_key, Authorization: `Bearer ${svc.api_key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true, user_metadata: { full_name: 'Routine Administrator' } }),
});
if (authRes.status >= 400) {
  const errText = await authRes.text();
  if (authRes.status !== 422) throw new Error(`auth user create failed: ${errText.slice(0, 300)}`);
  console.log('   (admin user may already exist — promoting anyway)');
}
{
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`update profiles set role='admin', full_name='Routine Administrator' where email = $1`, [ADMIN_EMAIL]);
  await c.end();
}
console.log(`   admin ready: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

/* ---- 5b · edge function: server-side passcode verifier ---- */
console.log('⑤ Deploying magic-admin edge function (server-side passcode verification)…');
const supabaseCli = (args) => {
  try {
    return execSync(`npx --yes supabase@latest ${args}`, {
      stdio: 'pipe', encoding: 'utf8',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: SB },
    });
  } catch (e) { return e.stdout ?? ''; }
};
const fnOut = supabaseCli(`functions deploy magic-admin --project-ref ${ref}`);
if (fnOut.includes('Success') || /deployed/i.test(fnOut)) {
  console.log('   function deployed ✓');
  supabaseCli(`secrets set FUNCTIONS_ADMIN_PASSCODE=${JSON.stringify(ADMIN_PASSCODE).slice(1, -1)} FUNCTIONS_ADMIN_EMAIL=${JSON.stringify(ADMIN_EMAIL).slice(1, -1)} --project-ref ${ref}`);
  console.log('   secrets set ✓');
} else {
  console.log('   ⚠ function deploy unresolved — deploy manually later:');
  console.log(`     npx supabase functions deploy magic-admin --project-ref ${ref}`);
  console.log(`     npx supabase secrets set FUNCTIONS_ADMIN_PASSCODE=… FUNCTIONS_ADMIN_EMAIL=${ADMIN_EMAIL} --project-ref ${ref}`);
}

/* ---- 6 · Vercel ---- */
console.log('⑤ Deploying to Vercel…');
const vercel = (args, input) => {
  const cmd = `npx --yes vercel@latest ${args} --yes`;
  return execSync(cmd, { input, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, VERCEL_TOKEN: VC } });
};
// link/create project
try { vercel('link --yes --project pharmroutine-diu'); }
catch (e) { console.log('   (link step note: ' + String(e.message).slice(0, 120) + ')'); }
console.log('   project linked');
// env vars
const sbUrl = `https://${ref}.supabase.co`;
const anonKey = anon.api_key ?? anon.publishable_key;
for (const [k, v] of [['VITE_SUPABASE_URL', sbUrl], ['VITE_SUPABASE_ANON_KEY', anonKey]]) {
  try { vercel(`env add ${k} production`, v + '\n'); console.log(`   env ${k} set`); }
  catch (e) { console.log(`   env ${k}: ` + String(e.message).slice(0, 100)); }
}
// production deploy
const deployOut = vercel('deploy --prod');
const urlMatch = deployOut.match(/https:\/\/[^\s]+/);
console.log('⑦ DONE');
console.log('----------------------------------------');
console.log(`Supabase project: https://supabase.com/dashboard/project/${ref}`);
console.log(`Supabase URL   : ${sbUrl}`);
console.log(`Anon key       : ${anonKey.slice(0, 24)}…`);
console.log(`Admin email    : ${ADMIN_EMAIL}`);
console.log(`Admin password : ${ADMIN_PASSWORD}`);
console.log(`Admin passcode : ${ADMIN_PASSCODE}   (type it in the email field on /login → straight to admin)`);
console.log(`Vercel app     : ${urlMatch ? urlMatch[0] : '(see deploy output above)'}`);
console.log('----------------------------------------');

/* optional: push repo updates */
if (GH) {
  try {
    execSync('git add -A && git commit -m "Automated deployment tooling (deploy.mjs + seed-supabase.mjs)" --allow-empty', { stdio: 'ignore' });
    const pull = `git -c credential.helper= pull --rebase https://x-access-token:${GH}@github.com/mdmusfiqur012-wq/pharmroutine-diu.git main`;
    const push = `git -c credential.helper= push https://x-access-token:${GH}@github.com/mdmusfiqur012-wq/pharmroutine-diu.git main`;
    execSync(pull, { stdio: 'ignore' });
    execSync(push, { stdio: 'ignore' });
    console.log('repo updated on GitHub ✓');
  } catch (e) {
    console.log('repo push skipped: ' + String(e.message).slice(0, 120));
  }
}
