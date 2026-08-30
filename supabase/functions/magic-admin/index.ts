// ============================================================================
// magic-admin — server-side verifier for the admin passcode.
//
// Deploy:  supabase functions deploy magic-admin --no-verify-jwt
// (No JWT: the whole point is that the caller is NOT yet signed in.)
//
// It verifies the passcode against the FUNCTIONS_ADMIN_PASSCODE secret,
// looks up the matching admin profile, then issues a one-time magic-link
// token for that user → the app calls verifyOtp(token_hash) and the user
// is signed in server-side with role=admin from the profiles table.
//
// .env.local secret (supabase functions secrets set):
//   FUNCTIONS_ADMIN_PASSCODE=adminlogin7766
//   FUNCTIONS_ADMIN_EMAIL=admin@diu.edu.bd   (must already exist + be role=admin)
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const PASSCODE = Deno.env.get('FUNCTIONS_ADMIN_PASSCODE') ?? 'adminlogin7766';
const ADMIN_EMAIL = Deno.env.get('FUNCTIONS_ADMIN_EMAIL') ?? 'admin@diu.edu.bd';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { passcode } = await req.json().catch(() => ({}));
  if (!passcode || passcode !== PASSCODE) {
    return json({ error: 'Invalid passcode.' }, 401);
  }

  try {
    // service-role admin client — we create the token via the admin API
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // find the admin user + profile
    const { data: user, error: uErr } = await admin.auth.admin.getUserByEmail(ADMIN_EMAIL);
    if (uErr || !user?.user) return json({ error: 'Admin account not found. Create it first (see DEPLOY.md).' }, 404);

    const { data: prof } = await admin
      .from('profiles').select('role').eq('id', user.user.id).maybeSingle();
    if (prof?.role !== 'admin') {
      return json({ error: 'The admin account is not promoted to role=admin.' }, 403);
    }

    // one-time magic-link token (valid ~1h, single use)
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: ADMIN_EMAIL,
      options: { redirectTo: `${req.headers.get('origin') ?? Deno.env.get('APP_URL') ?? 'https://pharmroutine-diu.vercel.app'}/admin` },
    });
    if (error || !data.properties?.hashed_token) return json({ error: 'Could not generate admin session: ' + (error?.message ?? '') }, 500);

    return json({ ok: true, token_hash: data.properties.hashed_token }, 200);
  } catch (e) {
    return json({ error: 'Admin sign-in failed: ' + String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
  });
}
