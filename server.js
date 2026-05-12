require('dotenv').config();
const express = require('express');

const availabilityRouter = require('./routes/availability');
const bookingRouter = require('./routes/booking');
const faqRouter = require('./routes/faq');
const jobberRouter = require('./routes/jobber');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/check-availability', availabilityRouter);
app.use('/book-appointment', bookingRouter);
app.use('/get-faq', faqRouter);
app.use('/jobber', jobberRouter);

app.get('/debug/config', (_req, res) => {
  res.json({
    CLIENTS_CONFIG_set: !!process.env.CLIENTS_CONFIG,
    JOBBER_CLIENT_ID_set: !!process.env.JOBBER_CLIENT_ID,
    JOBBER_CLIENT_SECRET_set: !!process.env.JOBBER_CLIENT_SECRET,
    BASE_URL: process.env.BASE_URL || '(not set)',
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Appliance voice agent running on port ${PORT}`);
});
