const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { roadmap_id, title, type, duration_minutes, page_count, url, published } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'title and type are required' });

  const { data, error } = await supabaseAdmin
    .from('content_items')
    .insert({ roadmap_id, title, type, duration_minutes, page_count, url, published })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/:id', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('content_items')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('content_items').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

module.exports = router;
