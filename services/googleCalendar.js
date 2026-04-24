const { google } = require('googleapis');
const moment = require('moment-timezone');

const TIMEZONE = 'America/Chicago';
const AVAILABLE_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];
const SLOT_DURATION_HOURS = 2;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function getBookedSlots(dateStr) {
  const dayStart = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day');
  const dayEnd = dayStart.clone().endOf('day');

  const { data } = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const booked = new Set();
  for (const event of data.items || []) {
    if (!event.start.dateTime) continue;
    const label = moment.tz(event.start.dateTime, TIMEZONE).format('h:mm A');
    if (AVAILABLE_SLOTS.includes(label)) booked.add(label);
  }
  return booked;
}

async function createEvent({ name, phone, address, date, time, issue, confirmationNumber }) {
  const start = moment.tz(`${date} ${time}`, 'YYYY-MM-DD h:mm A', TIMEZONE);
  const end = start.clone().add(SLOT_DURATION_HOURS, 'hours');

  await calendar.events.insert({
    calendarId: CALENDAR_ID,
    resource: {
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
}

module.exports = { oauth2Client, getBookedSlots, createEvent, AVAILABLE_SLOTS, TIMEZONE };