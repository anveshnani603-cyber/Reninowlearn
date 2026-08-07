const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// List every roadmap, including unpublished ones (students only ever see
// published=true via their own direct Supabase+RLS reads).
router.get('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin.from('roadmaps').select('*').order('title');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Create a roadmap (instructor/admin only)
router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { slug, title, track_label, description, icon, total_modules, published } = req.body;
  if (!slug || !title) return res.status(400).json({ error: 'slug and title are required' });

  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .insert({ slug, title, track_label, description, icon, total_modules, published })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Update a roadmap
router.patch('/:id', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Delete a roadmap
router.delete('/:id', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { error } = await supabaseAdmin.from('roadmaps').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// Add a module to a roadmap
router.post('/:id/modules', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { position, title, description } = req.body;
  if (!position || !title) return res.status(400).json({ error: 'position and title are required' });

  const { data, error } = await supabaseAdmin
    .from('roadmap_modules')
    .insert({ roadmap_id: req.params.id, position, title, description })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
