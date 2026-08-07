const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');

const router = express.Router();

// Public: confirm a student ID badge is genuine. Deliberately returns only
// non-sensitive fields — no email, phone, or blocked status — since anyone
// with a camera can scan this.
router.get('/student/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Server not configured (missing Supabase service role key)' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('full_name, member_since, role')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ valid: false, error: 'No student found' });
  res.json({ valid: true, ...data });
});

module.exports = router;
