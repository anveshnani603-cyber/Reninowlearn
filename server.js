// ============================================================
// RENI NOW LEARNING — backend server
// Serves the static frontend (public/) and an admin/instructor
// API backed by the Supabase service-role key. Students keep
// talking to Supabase directly with the anon key + RLS, exactly
// as before; this server only covers what RLS deliberately
// blocks from the browser (grading, XP awards, issuing content,
// recognition letters, billing).
// ============================================================
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('tiny'));
app.use(express.json());

// --------------------------------------------------------------
// Public config endpoint: hands the browser the Supabase URL +
// anon key from environment variables, instead of baking them
// into a committed js/config.js file. The anon key is safe to
// expose — RLS is what actually protects data.
// --------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
  });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// --------------------------------------------------------------
// Admin / instructor API (service-role key, never exposed to the browser)
// --------------------------------------------------------------
app.use('/api/roadmaps', require('./routes-roadmaps'));
app.use('/api/assignments', require('./routes-assignments'));
app.use('/api/assessments', require('./routes-assessments'));
app.use('/api/xp', require('./routes-xp'));
app.use('/api/sessions', require('./routes-sessions'));
app.use('/api/content', require('./routes-content'));
app.use('/api/subscriptions', require('./routes-subscriptions'));
app.use('/api/letters', require('./routes-letters'));
app.use('/api/admin', require('./routes-admin'));
app.use('/api/qr', require('./routes-qr'));
app.use('/api/verify', require('./routes-verify'));

// --------------------------------------------------------------
// Static frontend (index.html, app.js, config.js all live right
// here next to server.js — everything in one folder)
// --------------------------------------------------------------
app.use(express.static(__dirname));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --------------------------------------------------------------
// Catch-all error handler: any route (existing or future) that
// throws synchronously or forwards an error via next(err) ends up
// here as a clean JSON 500 instead of crashing the whole process.
// --------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (err) => {
  console.error('[Reni backend] Unhandled rejection:', err);
});

app.listen(PORT, () => {
  console.log(`[Reni backend] listening on port ${PORT}`);
});
