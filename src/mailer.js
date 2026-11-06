const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_PORT === 465,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html, attachments }) {
  if (!config.SEND_EMAIL) { console.log(`[mailer] SEND_EMAIL is false, skipped "${subject}" to ${to}`); return { skipped: true }; }
  if (!config.SMTP_HOST || !config.SMTP_USER) { console.warn('[mailer] SMTP not configured, skipping send.'); return { skipped: true }; }
  return getTransporter().sendMail({ from: config.MAIL_FROM, to, subject, text, html, attachments });
}
module.exports = { sendMail };
