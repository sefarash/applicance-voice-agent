const { Router } = require('express');

const router = Router();

const FAQ = [
  {
    keywords: ['cost', 'price', 'charge', 'fee', 'how much', 'rate'],
    answer: 'Our service call fee is $75, which covers the diagnostic visit. Repair costs vary by appliance and part — we provide a full quote before any work begins.',
  },
  {
    keywords: ['warranty', 'guarantee'],
    answer: 'All repairs come with a 90-day parts and labor warranty. If the same issue returns within 90 days, we fix it at no additional charge.',
  },
  {
    keywords: ['refrigerator', 'fridge', 'freezer'],
    answer: 'We repair all major refrigerator and freezer brands including Samsung, LG, Whirlpool, GE, and more. Common issues include cooling problems, ice maker failures, and compressor issues.',
  },
  {
    keywords: ['washer', 'washing machine', 'dryer', 'laundry'],
    answer: 'We service washers and dryers from all major brands. Common repairs include drum issues, heating element failures, and drain pump replacements.',
  },
  {
    keywords: ['dishwasher'],
    answer: 'We repair dishwashers of all brands. Common issues include leaking, not draining, and not cleaning properly.',
  },
  {
    keywords: ['oven', 'stove', 'range', 'microwave', 'cooktop'],
    answer: 'We service ovens, stoves, ranges, and microwaves. Common repairs include heating element replacements, igniter repairs, and control board issues.',
  },
  {
    keywords: ['how long', 'duration', 'appointment length'],
    answer: 'Most appointments take 1–2 hours. Complex repairs or part orders may require a follow-up visit.',
  },
  {
    keywords: ['available', 'hours', 'schedule', 'open', 'service area'],
    answer: 'We offer appointments Monday through Saturday. Available slots are 9:00 AM, 11:00 AM, 1:00 PM, and 3:00 PM.',
  },
  {
    keywords: ['emergency', 'urgent', 'same day', 'today'],
    answer: 'We do our best to accommodate same-day service based on availability. Please call us directly for urgent repair needs.',
  },
  {
    keywords: ['brand', 'make', 'model', 'manufacturer'],
    answer: 'We repair all major brands: Samsung, LG, Whirlpool, GE, Bosch, Maytag, Frigidaire, KitchenAid, and many others.',
  },
];

function matchFAQ(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of FAQ) {
    const score = entry.keywords.filter((kw) => q.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best
    ? best.answer
    : "I'm not sure about that — please call us directly and our team will be happy to help!";
}

router.post('/', (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }

  res.json({ question, answer: matchFAQ(question.trim()) });
});

module.exports = router;