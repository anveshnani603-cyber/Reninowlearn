const express = require('express');
const { supabaseAdmin } = require('./supabaseAdmin');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

// Instructor/admin manually sets a student's plan (e.g. after offline payment)
router.post('/', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  const { student_id, plan, status, renews_at } = req.body;
  if (!student_id || !plan) return res.status(400).json({ error: 'student_id and plan are required' });

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .upsert({ student_id, plan, status: status || 'active', renews_at }, { onConflict: 'student_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --------------------------------------------------------------
// Payment provider webhook stub (Razorpay / Stripe).
// Wire your provider's webhook URL to POST here. Verify the
// provider's signature before trusting the payload — the
// verification step depends on which provider you pick, so this
// is left as a clearly marked TODO rather than guessed at.
// --------------------------------------------------------------
router.post('/webhook', express.json({ type: '*/*' }), async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Server not configured (missing Supabase service role key)' });

  // TODO: verify webhook signature using your provider's SDK/secret
  // (e.g. Razorpay: x-razorpay-signature header + webhook secret).
  const { student_id, amount, currency, plan, renews_at } = req.body || {};
  if (!student_id || !amount) return res.status(400).json({ error: 'Unrecognized payload' });

  await supabaseAdmin.from('billing_history').insert({
    student_id,
    amount,
    currency: currency || 'INR'
  });

  if (plan) {
    await supabaseAdmin
      .from('subscriptions')
      .upsert({ student_id, plan, status: 'active', renews_at }, { onConflict: 'student_id' });
  }

  res.status(200).json({ received: true });
});

module.exports = router;
