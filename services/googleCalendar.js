const { google } = require('googleapis');
const moment = require('moment-timezone');

const TIMEZONE = 'America/Chicago';
const AVAILABLE_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];
const SLOT_DURATION_HOURS = 2;

// ─── Per-client token resolution ──────────────────────────────────────────────
// App credentials (client id/secret/redirect) are shared; each client supplies
// its own Google refresh token, stored in CLIENTS_CONFIG or seeded via OAuth.

const tokenCache = {};

function getClientGoogleConfig(clientId) {
  if (process.env.CLIENTS_CONFIG) {
    const configs = JSON.parse(process.env.CLIENTS_CONFIG);
    const config = configs[clientId];
    if (config?.googleRefreshToken) return config;
    return null;
  }
  if (!process.env.GOOGLE_REFRESH_TOKEN) return null;
  return {
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  };
}

function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL}/google/callback`;
}

function buildOAuthClient(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
  if (refreshToken) oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function getCalendarForClient(clientId) {
  const config = getClientGoogleConfig(clientId);
  // A token seeded via the OAuth callback this process takes precedence.
  const refreshToken = tokenCache[clientId]?.refreshToken || config?.googleRefreshToken;
  if (!refreshToken) throw new Error(`Google Calendar not configured for client: ${clientId}`);

  const calendarId = config?.googleCalendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
  const auth = buildOAuthClient(refreshToken);
  return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
}

// ─── Availability ─────────────────────────────────────────────────────────────

async function getAvailableSlots(dateStr, clientId) {
  const { calendar, calendarId } = getCalendarForClient(clientId);

  const dayStart = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day');
  const dayEnd = dayStart.clone().endOf('day');

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const bookedTimes = new Set();
  for (const event of data.items || []) {
    if (!event.start?.dateTime) continue;
    const label = moment.tz(event.start.dateTime, TIMEZONE).format('h:mm A');
    if (AVAILABLE_SLOTS.includes(label)) bookedTimes.add(label);
  }

  return {
    available: AVAILABLE_SLOTS.filter((s) => !bookedTimes.has(s)),
    booked: AVAILABLE_SLOTS.filter((s) => bookedTimes.has(s)),
  };
}

// ─── Booking ──────────────────────────────────────────────────────────────────

function generateConfirmationNumber() {
  return 'APR-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function createBooking({ name, phone, address, date, time, issue, clientId }) {
  const { calendar, calendarId } = getCalendarForClient(clientId);

  const start = moment.tz(`${date} ${time}`, 'YYYY-MM-DD h:mm A', TIMEZONE);
  const end = start.clone().add(SLOT_DURATION_HOURS, 'hours');
  const confirmationNumber = generateConfirmationNumber();

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Appliance Repair – ${name}`,
      description: [
        `Customer: ${name}`,
        `Phone: ${phone}`,
        `Address: ${address}`,
        `Issue: ${issue}`,
        `Confirmation: ${confirmationNumber}`,
      ].join('\n'),
      location: address,
      start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
      colorId: '2',
    },
  });

  return { uid: confirmationNumber, eventId: data.id };
}

// ─── OAuth helpers (used by routes/google.js) ─────────────────────────────────

function getAuthUrl(clientId) {
  return buildOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: clientId,
  });
}

async function exchangeCode(code) {
  const { tokens } = await buildOAuthClient().getToken(code);
  return tokens;
}

function seedTokenCache(clientId, refreshToken) {
  tokenCache[clientId] = { refreshToken };
}

module.exports = {
  getAvailableSlots,
  createBooking,
  getAuthUrl,
  exchangeCode,
  seedTokenCache,
  AVAILABLE_SLOTS,
  TIMEZONE,
};
