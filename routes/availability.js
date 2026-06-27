const { Router } = require('express');
const { getAvailableSlots, AVAILABLE_SLOTS, TIMEZONE } = require('../services/googleCalendar');

const router = Router();

router.post('/', async (req, res, next) => {
  const { date, time } = req.body;
  // client_id is optional — defaults to the single-tenant config (GOOGLE_REFRESH_TOKEN).
  const client_id = req.body.client_id || 'default';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
  }

  try {
    const { available, booked } = await getAvailableSlots(date, client_id);

    if (time) {
      const isAvailable = available.includes(time);
      return res.json({
        date,
        time,
        timezone: TIMEZONE,
        available: isAvailable,
        available_slots: available,
        booked_slots: booked,
        message: isAvailable
          ? `Yes, ${time} on ${date} is available.`
          : available.length > 0
            ? `No, ${time} on ${date} is not available. The available slots are: ${available.join(', ')}.`
            : `Sorry, there are no available slots on ${date}.`,
      });
    }

    res.json({
      date,
      timezone: TIMEZONE,
      available_slots: available,
      booked_slots: booked,
      message: available.length > 0
        ? `Available slots on ${date}: ${available.join(', ')}.`
        : `There are no available slots on ${date}.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
