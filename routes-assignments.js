const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// List every assignment with its roadmap title (admin console table)
router.get('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select('*, roadmaps(title)')
    .order('due_at', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Create an assignment
router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { roadmap_id, module_id, title, description, due_at, max_score, published } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const { data, error } = await supabaseAdmin
    .from('assignments')
    .insert({ roadmap_id, module_id, title, description, due_at, max_score, published })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Student submits an assignment (any signed-in student, own row only)
router.post('/:id/submit', requireUser, async (req, res) => {
  const { content, file_url } = req.body;

  const { data, error } = await supabaseAdmin
    .from('assignment_submissions')
    .upsert(
      {
        assignment_id: req.params.id,
        student_id: req.user.id,
        content,
        file_url,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      },
      { onConflict: 'assignment_id,student_id' }
    )
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Instructor/admin grades a submission — this also drops an XP event
// so the leaderboard picks it up automatically.
router.post('/submissions/:submissionId/grade', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { score, feedback, xp_award } = req.body;
  if (score === undefined || score === null) return res.status(400).json({ error: 'score is required' });

  const { data: submission, error } = await supabaseAdmin
    .from('assignment_submissions')
    .update({ score, feedback, status: 'graded', graded_at: new Date().toISOString() })
    .eq('id', req.params.submissionId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  if (xp_award && Number(xp_award) > 0) {
    await supabaseAdmin.from('xp_events').insert({
      student_id: submission.student_id,
      amount: Number(xp_award),
      reason: `Assignment graded (score ${score})`
    });
  }

  res.json(submission);
});

module.exports = router;
