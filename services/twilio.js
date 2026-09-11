const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_PHONE_NUMBER;
// Preferred for A2P 10DLC: the Messaging Service that holds the approved campaign.
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const BUSINESS_PHONE = process.env.BUSINESS_PHONE;
const TECHNICIAN_PHONE = process.env.TECHNICIAN_PHONE || process.env.BUSINESS_PHONE;

// Normalize whatever the voice agent captured ("555-123-4567", "(555) 123 4567", "15551234567")
// into E.164, which Twilio requires. Returns null if it doesn't look like a US number.
function toE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(phone).trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

async function sendSms(to, body) {
  const dest = toE164(to);
  if (!dest) throw new Error(`Invalid phone number for SMS: ${to}`);

  const sender = MESSAGING_SERVICE_SID
    ? { messagingServiceSid: MESSAGING_SERVICE_SID }
    : { from: FROM };

  const msg = await client.messages.create({ body, to: dest, ...sender });
  console.log(`SMS queued to ${dest}: sid=${msg.sid} status=${msg.status}`);
  return msg;
}

async function sendBookingConfirmation({ phone, name, address, date, time, issue, confirmationNumber, bookingUrl }) {
  const body =
    `Appointment Confirmed!\n` +
    `Date: ${date} at ${time} CT\n` +
    `Issue: ${issue}\n` +
    `Address: ${address}\n` +
    `Confirmation #: ${confirmationNumber}\n` +
    (bookingUrl ? `Complete booking: ${bookingUrl}\n` : '') +
    (TECHNICIAN_PHONE
      ? `If the address above is incorrect, please text the correct address to your technician at ${TECHNICIAN_PHONE}.\n`
      : '') +
    `Questions? Call ${TECHNICIAN_PHONE || BUSINESS_PHONE || 'us'}.`;

  return sendSms(phone, body);
}

async function sendBusinessAlert({ name, phone, address, date, time, issue, confirmationNumber }) {
  if (!BUSINESS_PHONE) return;

  const body =
    `New Booking – ${confirmationNumber}\n` +
    `${date} at ${time} CT\n` +
    `Customer: ${name} | ${phone}\n` +
    `Address: ${address}\n` +
    `Issue: ${issue}`;

  return sendSms(BUSINESS_PHONE, body);
}

module.exports = { sendBookingConfirmation, sendBusinessAlert, toE164 };
