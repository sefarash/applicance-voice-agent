const { Router } = require('express');
const { getBookedSlots, createEvent, AVAILABLE_SLOTS, TIMEZONE } = require('../services/googleCalendar');
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
    const booked = await getBookedSlots(date);
    if (booked.has(time)) {
      return res.status(409).json({ error: `${time} on ${date} is already booked` });
    }

    const confirmationNumber = generateConfirmationNumber();
    await createEvent({ name, phone, address, date, time, issue, confirmationNumber });

    // SMS is best-effort — failure must not fail the booking
    const smsData = { phone, name, date, time, issue, confirmationNumber };
    Promise.all([
      sendBookingConfirmation(smsData),
      sendBusinessAlert({ ...smsData, address }),
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