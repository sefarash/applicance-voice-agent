const { Router } = require('express');
const { getAvailableSlots, createBooking, AVAILABLE_SLOTS, TIMEZONE } = require('../services/googleCalendar');
const { sendBookingConfirmation, sendBusinessAlert } = require('../services/twilio');

const router = Router();

router.post('/', async (req, res, next) => {
  const { name, phone, email, address, date, time, issue } = req.body;
  // client_id is optional — defaults to the single-tenant config (GOOGLE_REFRESH_TOKEN).
  const client_id = req.body.client_id || 'default';

  if (!name || !phone || !address || !date || !time || !issue) {
    return res.status(400).json({
      error: 'All fields required: name, phone, address, date, time, issue',
    });
  }
  if (!AVAILABLE_SLOTS.includes(time)) {
    return res.status(400).json({
      error: `Invalid time slot. Available: ${AVAILABLE_SLOTS.join(', ')}`,
    });
  }

  try {
    const { available } = await getAvailableSlots(date, client_id);
    if (!available.includes(time)) {
      return res.status(409).json({ error: `${time} on ${date} is not available` });
    }

    const booking = await createBooking({ name, phone, email, address, date, time, issue, clientId: client_id });
    const confirmationNumber = booking.uid;

    // SMS is best-effort — failure must not fail the booking response
    Promise.all([
      sendBookingConfirmation({ phone, name, date, time, issue, confirmationNumber }),
      sendBusinessAlert({ name, phone, address, date, time, issue, confirmationNumber }),
    ]).catch((err) => console.warn('SMS error (non-fatal):', err.message));

    res.json({
      success: true,
      confirmation_number: confirmationNumber,
      appointment: { name, phone, address, date, time, issue, timezone: TIMEZONE },
      message: `Booked for ${date} at ${time} CT. Confirmation #: ${confirmationNumber}.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
