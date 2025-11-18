const nodemailer = require('nodemailer');

let cachedTransporter = null;

function buildTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
    SMTP_FROM
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP environment variables are missing. Email sending disabled.');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  cachedTransporter = { transporter, defaultFrom: SMTP_FROM || SMTP_USER };
  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transportData = buildTransporter();
  if (!transportData) {
    return false;
  }

  if (!to) {
    console.warn('[email] Missing recipient. Skip sending.');
    return false;
  }

  const { transporter, defaultFrom } = transportData;

  try {
    await transporter.sendMail({
      from: defaultFrom,
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send email', err);
    return false;
  }
}

module.exports = {
  sendEmail
};

