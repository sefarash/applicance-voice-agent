const moment = require('moment-timezone');

const BASE = 'https://api.calendly.com';
const TIMEZONE = 'America/Chicago';
const AVAILABLE_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.CALENDLY_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `Calendly error ${res.status}`);
  return body;
}

async function getAvailableSlots(dateStr) {
  const dayStart = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day').toISOString();
  const dayEnd = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).endOf('day').toISOString();

  const params = new URLSearchParams({
    event_type: process.env.CALENDLY_EVENT_TYPE_URI,
    start_time: dayStart,
    end_time: dayEnd,
  });

  const { collection } = await api(`/event_type_available_times?${params}`);

  const calendlyAvailable = new Set(
    (collection || []).map((slot) => moment.tz(slot.start_time, TIMEZONE).format('h:mm A'))
  );

  const available = AVAILABLE_SLOTS.filter((s) => calendlyAvailable.has(s));
  const booked = AVAILABLE_SLOTS.filter((s) => !calendlyAvailable.has(s));

  return { available, booked };
}

// Creates a single-use booking link for a specific event type.
// Requires Calendly Teams plan — falls back to the general event URL on lower plans.
async function createSchedulingLink() {
  const { resource } = await api('/scheduling_links', {
    method: 'POST',
    body: JSON.stringify({
      max_event_count: 1,
      owner: process.env.CALENDLY_EVENT_TYPE_URI,
      owner_type: 'EventType',
    }),
  });
  return resource.booking_url;
}

// Helper: list all event types for the authenticated user (used by /calendly/event-types)
async function listEventTypes() {
  const { resource } = await api('/users/me');
  const params = new URLSearchParams({ user: resource.uri });
  const { collection } = await api(`/event_types?${params}`);
  return collection.map((et) => ({ name: et.name, uri: et.uri, slug: et.slug }));
}

module.exports = { getAvailableSlots, createSchedulingLink, listEventTypes, AVAILABLE_SLOTS, TIMEZONE };
