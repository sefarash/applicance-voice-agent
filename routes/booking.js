const { Router } = require('express');
const { getAvailableSlots, createSchedulingLink, AVAILABLE_SLOTS, TIMEZONE } = require('../services/calendly');
const { sendBookingConfirmation, sendBusinessAlert } = require('../services/twilio');

const router = Router();

function generateConfirmationNumber() {
  return 'APR-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

router.post('/', async (req, res, next) => {
  const { name, phone, address, date, time, issue } = req.body;

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
    const { available } = await getAvailableSlots(date);
    if (!available.includes(time)) {
      return res.status(409).json({ error: `${time} on ${date} is not available` });
    }

    const confirmationNumber = generateConfirmationNumber();

    // Try to create a single-use Calendly link (requires Teams plan).
    // Falls back to the general event type URL on lower plans.
    let bookingUrl = process.env.CALENDLY_EVENT_TYPE_URL || null;
    try {
      bookingUrl = await createSchedulingLink();
    } catch (e) {
      console.warn('Scheduling link unavailable (Teams plan required):', e.message);
    }

    // SMS is best-effort — failure must not fail the booking response
    const smsData = { phone, name, date, time, issue, confirmationNumber, bookingUrl };
    Promise.all([
      sendBookingConfirmation(smsData),
      sendBusinessAlert({ ...smsData, address }),
    ]).catch((err) => console.warn('SMS error (non-fatal):', err.message));

    res.json({
      success: true,
      confirmation_number: confirmationNumber,
      booking_url: bookingUrl,
      appointment: { name, phone, address, date, time, issue, timezone: TIMEZONE },
      message: `${time} on ${date} CT is reserved. Confirmation #: ${confirmationNumber}. Complete booking at the link sent to ${phone}.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
