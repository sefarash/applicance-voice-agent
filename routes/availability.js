const { Router } = require('express');
const { getAvailableSlots, AVAILABLE_SLOTS, TIMEZONE } = require('../services/calendly');

const router = Router();

router.post('/', async (req, res, next) => {
  const { date } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required in YYYY-MM-DD format' });
  }

  try {
    const { available, booked } = await getAvailableSlots(date);

    res.json({
      date,
      timezone: TIMEZONE,
      available_slots: available,
      booked_slots: booked,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
