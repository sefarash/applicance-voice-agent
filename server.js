require('dotenv').config();
const express = require('express');
const { listEventTypes } = require('./services/calcom');

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

app.use('/check-availability', availabilityRouter);
app.use('/book-appointment', bookingRouter);
app.use('/get-faq', faqRouter);

// ─── Cal.com setup helper — REMOVE AFTER GETTING EVENT TYPE IDs ───────────────

app.get('/calcom/setup', async (req, res, next) => {
  try {
    const { client_id } = req.query;
    const types = await listEventTypes(client_id);
    res.json({
      instructions: 'Copy the id of your event type and set it as CAL_EVENT_TYPE_ID in Railway.',
      event_types: types,
    });
  } catch (err) {
    next(err);
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
