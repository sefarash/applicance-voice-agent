const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_PHONE_NUMBER;
const BUSINESS_PHONE = process.env.BUSINESS_PHONE;
const TECHNICIAN_PHONE = process.env.TECHNICIAN_PHONE || process.env.BUSINESS_PHONE;

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
    `Questions? Call ${BUSINESS_PHONE || 'us'}.`;

  await client.messages.create({ body, from: FROM, to: phone });
}

async function sendBusinessAlert({ name, phone, address, date, time, issue, confirmationNumber }) {
  if (!BUSINESS_PHONE) return;

  const body =
    `New Booking – ${confirmationNumber}\n` +
    `${date} at ${time} CT\n` +
    `Customer: ${name} | ${phone}\n` +
    `Address: ${address}\n` +
    `Issue: ${issue}`;

  await client.messages.create({ body, from: FROM, to: BUSINESS_PHONE });
}

module.exports = { sendBookingConfirmation, sendBusinessAlert };
