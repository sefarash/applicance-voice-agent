require('dotenv').config();
const express = require('express');
const { oauth2Client } = require('./services/googleCalendar');

const availabilityRouter = require('./routes/availability');
const bookingRouter = require('./routes/booking');
const faqRouter = require('./routes/faq');

const app = express();
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API routes ───────────────────────────────────────────────────────────────

app.post('/check-availability', availabilityRouter);
app.post('/book-appointment', bookingRouter);
app.post('/get-faq', faqRouter);

// ─── OAuth helper routes — REMOVE AFTER GETTING REFRESH TOKEN ─────────────────

app.get('/oauth/start', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
  res.redirect(url);
});

app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code parameter');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.send(`
      <h2>OAuth Success</h2>
      <p><strong>Refresh Token:</strong></p>
      <pre style="background:#111;color:#0f0;padding:16px;border-radius:6px">${tokens.refresh_token || '(none — revoke app access in Google account and try again)'}</pre>
      <p>Copy this value into your <code>GOOGLE_REFRESH_TOKEN</code> environment variable, then remove the <code>/oauth</code> routes from server.js.</p>
    `);
  } catch (err) {
    res.status(500).send(`Token exchange failed: ${err.message}`);
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Appliance voice agent running on port ${PORT}`);
});
