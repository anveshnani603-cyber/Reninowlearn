const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// Create an assessment
router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { roadmap_id, title, total_marks, scheduled_at, published } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const { data, error } = await supabaseAdmin
    .from('assessments')
    .insert({ roadmap_id, title, total_marks, scheduled_at, published })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Instructor/admin records a student's result (also awards XP if given)
router.post('/:id/results', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { student_id, score, xp_award } = req.body;
  if (!student_id || score === undefined) return res.status(400).json({ error: 'student_id and score are required' });

  const { data, error } = await supabaseAdmin
    .from('assessment_results')
    .upsert(
      {
        assessment_id: req.params.id,
        student_id,
        score,
        status: 'attempted',
        attempted_at: new Date().toISOString()
      },
      { onConflict: 'assessment_id,student_id' }
    )
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  if (xp_award && Number(xp_award) > 0) {
    await supabaseAdmin.from('xp_events').insert({
      student_id,
      amount: Number(xp_award),
      reason: `Assessment result recorded (score ${score})`
    });
  }

  res.json(data);
});

module.exports = router;
