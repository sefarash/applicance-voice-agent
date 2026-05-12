const { Router } = require('express');
const { seedTokenCache } = require('../services/jobber');

const router = Router();

const AUTH_URL = 'https://api.getjobber.com/api/oauth/authorize';
const TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';

// Step 1 — redirect to Jobber OAuth consent screen
// Usage: GET /jobber/auth?client_id=my-client
router.get('/auth', (req, res) => {
  const { client_id: clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'client_id query param is required' });
  if (!process.env.JOBBER_CLIENT_ID) return res.status(500).json({ error: 'JOBBER_CLIENT_ID env var not set' });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.JOBBER_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/jobber/callback`,
    state: clientId,
  });

  res.redirect(`${AUTH_URL}?${params}`);
});

// Step 2 — Jobber redirects here with ?code=...&state=<client_id>
router.get('/callback', async (req, res) => {
  const { code, state: clientId } = req.query;
  if (!code || !clientId) return res.status(400).json({ error: 'Missing code or state param' });

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.JOBBER_CLIENT_ID,
        client_secret: process.env.JOBBER_CLIENT_SECRET,
        redirect_uri: `${process.env.BASE_URL}/jobber/callback`,
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(data.error_description || data.error || 'Token exchange failed');

    // Seed the in-memory cache so requests work immediately without a restart
    seedTokenCache(clientId, data.access_token, data.refresh_token);

    res.json({
      message: `Jobber connected for "${clientId}". Copy these tokens into your CLIENTS_CONFIG in Railway.`,
      client_id: clientId,
      jobberAccessToken: data.access_token,
      jobberRefreshToken: data.refresh_token,
      expires_in: data.expires_in,
      instructions: `Add jobberAccessToken and jobberRefreshToken to the "${clientId}" entry in your CLIENTS_CONFIG env var, then redeploy.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
