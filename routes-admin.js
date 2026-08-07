const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// List all students (for an instructor dashboard to pick who to grade/award/etc.)
// Merges profiles with their auth email, since email lives on auth.users
// and profiles only carries what students filled in themselves.
router.get('/students', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, phone, phone_verified, role, blocked, member_since, created_at')
    .order('full_name');

  if (error) return res.status(400).json({ error: error.message });

  const { data: usersPage, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) return res.status(400).json({ error: usersErr.message });

  const emailById = new Map(usersPage.users.map(u => [u.id, u.email]));
  const merged = profiles.map(p => ({ ...p, email: emailById.get(p.id) || null }));

  res.json(merged);
});

// Block or unblock a student's access. The frontend checks this flag right
// after login (see app.js) and signs a blocked student straight back out.
router.patch('/students/:id/block', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { blocked } = req.body;
  if (typeof blocked !== 'boolean') return res.status(400).json({ error: 'blocked must be true or false' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ blocked })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Promote/demote a user's role (admin only)
router.patch('/students/:id/role', requireUser, requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!['student', 'instructor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be student, instructor, or admin' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
