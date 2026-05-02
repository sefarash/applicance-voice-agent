const { Router } = require('express');
const { getAvailableSlots, createBooking, AVAILABLE_SLOTS, TIMEZONE } = require('../services/calcom');
const { sendBookingConfirmation, sendBusinessAlert } = require('../services/twilio');

const router = Router();

router.post('/', async (req, res, next) => {
  const { name, phone, email, address, date, time, issue, client_id } = req.body;

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

    // Creates a real event on the client's Cal.com calendar
    const booking = await createBooking({ name, phone, email, address, date, time, issue, client_id });
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
