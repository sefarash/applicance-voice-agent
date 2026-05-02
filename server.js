require('dotenv').config();
const express = require('express');
const { listEventTypes } = require('./services/calendly');

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

// ─── Calendly helper — REMOVE AFTER GETTING EVENT TYPE URI ───────────────────

app.get('/calendly/event-types', async (_req, res, next) => {
  try {
    const types = await listEventTypes();
    res.json(types);
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
