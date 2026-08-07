// ============================================================
// Server-side Supabase client, using the SERVICE ROLE key.
// This key bypasses Row Level Security, so it must NEVER be
// sent to the browser — it only ever lives here, on the server,
// read from an environment variable.
// ============================================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[Reni backend] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. ' +
    'Admin API routes will fail until these env vars are configured.'
  );
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

module.exports = { supabaseAdmin };
