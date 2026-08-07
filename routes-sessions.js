const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// List every scheduled session (admin console table)
router.get('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('live_sessions')
    .select('*, roadmaps(title)')
    .order('starts_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Create a live session
router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { roadmap_id, title, instructor_name, starts_at, ends_at, meeting_url } = req.body;
  if (!title || !starts_at) return res.status(400).json({ error: 'title and starts_at are required' });

  const { data, error } = await supabaseAdmin
    .from('live_sessions')
    .insert({ roadmap_id, title, instructor_name, starts_at, ends_at, meeting_url })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Update a session (e.g. attach a recording afterwards)
router.patch('/:id', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('live_sessions')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// See who RSVP'd (instructor/admin only — RSVP rows are private per-student under RLS)
router.get('/:id/rsvps', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('session_rsvps')
    .select('*, profiles(full_name)')
    .eq('session_id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
