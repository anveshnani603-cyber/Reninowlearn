const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

function generateCode() {
  return 'RENI-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Issue a recognition letter to a student who has completed a roadmap
router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { student_id, roadmap_id, duration_label, completed_on, director_name } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id is required' });

  const { data, error } = await supabaseAdmin
    .from('recognition_letters')
    .insert({
      student_id,
      roadmap_id,
      recognition_code: generateCode(),
      duration_label,
      completed_on,
      director_name
    })
    .select('*, profiles(full_name), roadmaps(title)')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// List every letter issued (admin console table)
router.get('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('recognition_letters')
    .select('*, profiles(full_name), roadmaps(title)')
    .order('issued_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Public verification — this is what the QR code on a printed/PDF
// certificate resolves to. No auth: anyone who scans the code (e.g. an
// employer) can confirm a letter is genuine, without seeing anything else
// about the student's account.
router.get('/verify/:code', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Server not configured (missing Supabase service role key)' });

  const { data, error } = await supabaseAdmin
    .from('recognition_letters')
    .select('recognition_code, duration_label, completed_on, director_name, issued_at, profiles(full_name), roadmaps(title)')
    .eq('recognition_code', req.params.code)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ valid: false, error: 'No certificate found with this code' });
  res.json({ valid: true, ...data });
});

module.exports = router;
