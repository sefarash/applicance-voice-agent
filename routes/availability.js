const { Router } = require('express');
const { getAvailableSlots, AVAILABLE_SLOTS, TIMEZONE } = require('../services/calcom');

const router = Router();

router.post('/', async (req, res, next) => {
  const { date, time, client_id } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
  }

  try {
    const { available, booked } = await getAvailableSlots(date, client_id);

    // If a specific time was requested, give a direct yes/no answer the agent can speak
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

    // No specific time — return the full day overview
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
