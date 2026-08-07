const express = require('express');
const QRCode = require('qrcode');
const { requireUser, requireRole } = require('./auth-middleware');

const router = express.Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// A student's own QR — encodes a link to their public verify page.
// Any signed-in student can fetch their own; used for an ID badge / pass.
router.get('/me', requireUser, async (req, res) => {
  try {
    const url = `${baseUrl(req)}/verify-student.html?id=${req.user.id}`;
    const png = await QRCode.toBuffer(url, { width: 320, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'Could not generate QR code' });
  }
});

// Admin/instructor — QR for any given student (e.g. printing ID cards)
router.get('/student/:id', requireUser, requireRole('instructor', 'admin'), async (req, res) => {
  try {
    const url = `${baseUrl(req)}/verify-student.html?id=${req.params.id}`;
    const png = await QRCode.toBuffer(url, { width: 320, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'Could not generate QR code' });
  }
});

// QR for a recognition letter — encodes a link to the public verify page
// for that certificate. No auth required to fetch (the code itself is the
// secret-ish part), matching how a printed certificate QR works.
router.get('/letter/:code', async (req, res) => {
  try {
    const url = `${baseUrl(req)}/verify-letter.html?code=${encodeURIComponent(req.params.code)}`;
    const png = await QRCode.toBuffer(url, { width: 320, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'Could not generate QR code' });
  }
});

module.exports = router;
