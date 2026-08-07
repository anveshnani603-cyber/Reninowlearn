// ============================================================
// Auth middleware
// Every request to a protected route must carry:
//   Authorization: Bearer <supabase access_token>
// (the same token the browser already holds after supabase.auth
// signIn — sb.auth.getSession().data.session.access_token)
//
// We ask Supabase who this token belongs to (requireUser), then
// optionally check their profile role (requireRole).
// ============================================================
const { supabaseAdmin } = require('./supabaseAdmin');

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server not configured (missing Supabase service role key)' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' });

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
    if (profileErr) return res.status(500).json({ error: 'Could not load profile' });

    req.user = data.user;
    req.profile = profile;

    if (profile.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact your instructor.' });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { requireUser, requireRole };
