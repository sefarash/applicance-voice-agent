const { Router } = require('express');
const { getAuthUrl, exchangeCode, seedTokenCache } = require('../services/googleCalendar');

const router = Router();

// Step 1 — redirect to Google OAuth consent screen
// Usage: GET /google/auth?client_id=my-client
router.get('/auth', (req, res) => {
  const { client_id: clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'client_id query param is required' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID env var not set' });

  res.redirect(getAuthUrl(clientId));
});

// Step 2 — Google redirects here with ?code=...&state=<client_id>
router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) return res.status(400).json({ error: 'Missing code or state param' });

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return res.status(400).json({
        error: 'Google did not return a refresh token. Revoke prior access at https://myaccount.google.com/permissions and try again.',
      });
    }

    // Seed the in-memory cache so requests work immediately without a restart
    seedTokenCache(clientId, tokens.refresh_token);

    res.json({
      message: `Google Calendar connected for "${clientId}". Copy this refresh token into your CLIENTS_CONFIG in Railway.`,
      client_id: clientId,
      googleRefreshToken: tokens.refresh_token,
      instructions: `Add "googleRefreshToken" (and optionally "googleCalendarId") to the "${clientId}" entry in your CLIENTS_CONFIG env var, then redeploy.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
