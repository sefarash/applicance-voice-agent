require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const twilio = require('twilio');
const moment = require('moment-timezone');

const app = express();
app.use(express.json());

const TIMEZONE = 'America/Chicago';
const AVAILABLE_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];
const SLOT_DURATION_HOURS = 2;

// ─── Google Calendar ──────────────────────────────────────────────────────────

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// ─── Twilio ───────────────────────────────────────────────────────────────────

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ = [
  {
    keywords: ['cost', 'price', 'charge', 'fee', 'how much', 'rate'],
    answer:
      'Our service call fee is $75, which covers the diagnostic visit. Repair costs vary by appliance and part — we provide a full quote before any work begins.',
  },
  {
    keywords: ['warranty', 'guarantee', 'guarantee'],
    answer:
      'All repairs come with a 90-day parts and labor warranty. If the same issue returns within 90 days, we fix it at no additional charge.',
  },
  {
    keywords: ['refrigerator', 'fridge', 'freezer'],
    answer:
      'We repair all major refrigerator and freezer brands including Samsung, LG, Whirlpool, GE, and more. Common issues include cooling problems, ice maker failures, and compressor issues.',
  },
  {
    keywords: ['washer', 'washing machine', 'dryer', 'laundry'],
    answer:
      'We service washers and dryers from all major brands. Common repairs include drum issues, heating element failures, and drain pump replacements.',
  },
  {
    keywords: ['dishwasher', 'dish washer'],
    answer:
      'We repair dishwashers of all brands. Common issues include leaking, not draining, and not cleaning properly.',
  },
  {
    keywords: ['oven', 'stove', 'range', 'microwave', 'cooktop'],
    answer:
      'We service ovens, stoves, ranges, and microwaves. Common repairs include heating element replacements, igniter repairs, and control board issues.',
  },
  {
    keywords: ['how long', 'time', 'duration', 'appointment length'],
    answer:
      'Most appointments take 1–2 hours. Complex repairs or part orders may require a follow-up visit.',
  },
  {
    keywords: ['available', 'hours', 'schedule', 'open', 'service area'],
    answer:
      'We offer appointments Monday through Saturday. Available time slots are 9:00 AM, 11:00 AM, 1:00 PM, and 3:00 PM. Call or use our booking system to reserve your slot.',
  },
  {
    keywords: ['emergency', 'urgent', 'same day', 'today'],
    answer:
      'We do our best to accommodate same-day service requests based on availability. Please call us directly for urgent repair needs.',
  },
  {
    keywords: ['brand', 'make', 'model', 'manufacturer'],
    answer:
      'We repair all major appliance brands including Samsung, LG, Whirlpool, GE, Bosch, Maytag, Frigidaire, KitchenAid, and many others.',
  },
];

function matchFAQ(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of FAQ) {
    const score = entry.keywords.filter((kw) => q.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best
    ? best.answer
    : "I'm not sure about that — please call us directly and our team will be happy to help!";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotToMoment(dateStr, timeStr) {
  return moment.tz(`${dateStr} ${timeStr}`, 'YYYY-MM-DD h:mm A', TIMEZONE);
}

function generateConfirmationNumber() {
  return 'APR-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

async function getBookedSlotsForDate(dateStr) {
  const dayStart = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day');
  const dayEnd = dayStart.clone().endOf('day');

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  const booked = new Set();

  for (const event of events) {
    const start = event.start.dateTime;
    if (!start) continue;
    const eventMoment = moment.tz(start, TIMEZONE);
    const formatted = eventMoment.format('h:mm A');
    if (AVAILABLE_SLOTS.includes(formatted)) {
      booked.add(formatted);
    }
  }

  return booked;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/check-availability', async (req, res) => {
  const { date } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
  }

  try {
    const booked = await getBookedSlotsForDate(date);
    const available = AVAILABLE_SLOTS.filter((slot) => !booked.has(slot));

    res.json({
      date,
      timezone: TIMEZONE,
      available_slots: available,
      booked_slots: [...booked],
    });
  } catch (err) {
    console.error('check-availability error:', err.message);
    res.status(500).json({ error: 'Failed to check availability', details: err.message });
  }
});

app.post('/book-appointment', async (req, res) => {
  const { name, phone, address, date, time, issue } = req.body;

  if (!name || !phone || !address || !date || !time || !issue) {
    return res.status(400).json({ error: 'All fields required: name, phone, address, date, time, issue' });
  }

  if (!AVAILABLE_SLOTS.includes(time)) {
    return res.status(400).json({
      error: `Invalid time slot. Available slots: ${AVAILABLE_SLOTS.join(', ')}`,
    });
  }

  try {
    // Check the slot is still free
    const booked = await getBookedSlotsForDate(date);
    if (booked.has(time)) {
      return res.status(409).json({ error: `Time slot ${time} on ${date} is already booked` });
    }

    const startMoment = slotToMoment(date, time);
    const endMoment = startMoment.clone().add(SLOT_DURATION_HOURS, 'hours');
    const confirmationNumber = generateConfirmationNumber();

    // Create Google Calendar event
    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: {
        summary: `Appliance Repair – ${name}`,
        description: `Customer: ${name}\nPhone: ${phone}\nAddress: ${address}\nIssue: ${issue}\nConfirmation: ${confirmationNumber}`,
        location: address,
        start: { dateTime: startMoment.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: endMoment.toISOString(), timeZone: TIMEZONE },
        colorId: '2', // Sage green
      },
    });

    // Send Twilio SMS to customer
    const smsBody =
      `Appointment Confirmed!\n` +
      `📅 ${date} at ${time} (CT)\n` +
      `🔧 ${issue}\n` +
      `📍 ${address}\n` +
      `Confirmation #: ${confirmationNumber}\n` +
      `Questions? Call ${process.env.BUSINESS_PHONE || 'us'}.`;

    await twilioClient.messages.create({
      body: smsBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    // Optionally notify the business
    if (process.env.BUSINESS_PHONE) {
      const bizBody =
        `New Booking – ${confirmationNumber}\n` +
        `${date} at ${time}\nCustomer: ${name} | ${phone}\n` +
        `Address: ${address}\nIssue: ${issue}`;

      await twilioClient.messages.create({
        body: bizBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.BUSINESS_PHONE,
      }).catch((e) => console.warn('Business SMS failed:', e.message));
    }

    res.json({
      success: true,
      confirmation_number: confirmationNumber,
      appointment: { name, phone, address, date, time, issue, timezone: TIMEZONE },
      message: `Appointment booked for ${date} at ${time} CT. Confirmation sent to ${phone}.`,
    });
  } catch (err) {
    console.error('book-appointment error:', err.message);
    res.status(500).json({ error: 'Failed to book appointment', details: err.message });
  }
});

app.post('/get-faq', (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }

  const answer = matchFAQ(question.trim());
  res.json({ question, answer });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Appliance voice agent running on port ${PORT} (${TIMEZONE})`);
});
