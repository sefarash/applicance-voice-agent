const moment = require('moment-timezone');

const BASE = 'https://api.cal.com/v2';
const TIMEZONE = 'America/Chicago';
const AVAILABLE_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];

// Cal.com uses different API versions per endpoint
const VERSION_LEGACY  = '2024-04-15'; // required for /event-types
const VERSION_CURRENT = '2024-08-13'; // required for /bookings and /slots

// ─── Multi-client config ──────────────────────────────────────────────────────
// Single client: set CAL_API_KEY + CAL_EVENT_TYPE_ID in env
// Multiple clients: set CLIENTS_CONFIG as JSON string, e.g.:
//   {"alex-appliance":{"calApiKey":"cal_live_xxx","calEventTypeId":123}}
// Pass client_id in each request body to select the right config.

function getClientConfig(clientId) {
  if (process.env.CLIENTS_CONFIG) {
    const configs = JSON.parse(process.env.CLIENTS_CONFIG);
    const config = configs[clientId];
    if (!config) throw new Error(`Unknown client: ${clientId}`);
    return { apiKey: config.calApiKey, eventTypeId: Number(config.calEventTypeId) };
  }
  return {
    apiKey: process.env.CAL_API_KEY,
    eventTypeId: Number(process.env.CAL_EVENT_TYPE_ID),
  };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function api(path, apiKey, version, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'cal-api-version': version,
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `Cal.com error ${res.status}`);
  return body;
}

// ─── Availability ─────────────────────────────────────────────────────────────

async function getAvailableSlots(dateStr, clientId) {
  const { apiKey, eventTypeId } = getClientConfig(clientId);

  const startTime = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day').toISOString();
  const endTime = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).endOf('day').toISOString();

  const params = new URLSearchParams({ startTime, endTime, eventTypeId });
  const { data } = await api(`/slots/available?${params}`, apiKey, VERSION_CURRENT);

  const slotsForDay = (data.slots || {})[dateStr] || [];
  const calAvailable = new Set(
    slotsForDay.map((slot) => moment.tz(slot.time, TIMEZONE).format('h:mm A'))
  );

  return {
    available: AVAILABLE_SLOTS.filter((s) => calAvailable.has(s)),
    booked: AVAILABLE_SLOTS.filter((s) => !calAvailable.has(s)),
  };
}

// ─── Booking ──────────────────────────────────────────────────────────────────

async function createBooking({ name, phone, email, address, date, time, issue, clientId }) {
  const { apiKey, eventTypeId } = getClientConfig(clientId);

  const start = moment.tz(`${date} ${time}`, 'YYYY-MM-DD h:mm A', TIMEZONE).toISOString();

  // Placeholder email uses a real TLD so Cal.com passes validation
  const attendeeEmail = email || `voice.${phone.replace(/\D/g, '')}@placeholder.com`;

  const { data } = await api('/bookings', apiKey, VERSION_CURRENT, {
    method: 'POST',
    body: JSON.stringify({
      eventTypeId,
      start,
      attendee: {
        name,
        email: attendeeEmail,
        timeZone: TIMEZONE,
        language: 'en',
        phoneNumber: phone,
      },
      // bookingFieldsResponses keys must match the identifiers set in Cal.com → Event Type → Questions
      bookingFieldsResponses: { issue, address },
      metadata: { source: 'voice-agent' },
    }),
  });

  return data;
}

// ─── Helper: list event types (used by /calcom/setup) ────────────────────────

async function listEventTypes(clientId) {
  const { apiKey } = getClientConfig(clientId);

  if (!apiKey) throw new Error('CAL_API_KEY is not set in environment variables');

  const me = await api('/me', apiKey, VERSION_LEGACY);
  const username = me.data?.username;

  const params = username ? `?username=${encodeURIComponent(username)}` : '';
  const { data } = await api(`/event-types${params}`, apiKey, VERSION_LEGACY);

  const groups = data.eventTypeGroups || (Array.isArray(data) ? [{ eventTypes: data }] : []);
  return groups
    .flatMap((g) => g.eventTypes || [])
    .map(({ id, title, slug, length }) => ({ id, title, slug, durationMinutes: length }));
}

module.exports = { getAvailableSlots, createBooking, listEventTypes, AVAILABLE_SLOTS, TIMEZONE };
