const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// Award (or deduct, with a negative amount) XP to a student.
// This is the only writer of xp_events — the client can only read it.
router.post('/award', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { student_id, amount, reason } = req.body;
  if (!student_id || !amount) return res.status(400).json({ error: 'student_id and amount are required' });

  const { data, error } = await supabaseAdmin
    .from('xp_events')
    .insert({ student_id, amount: Number(amount), reason: reason || '' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
