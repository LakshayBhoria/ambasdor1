require('dotenv').config();
const path = require('path');
const bool = (v, f) => (v === undefined ? f : String(v).toLowerCase() === 'true');
module.exports = {
  PORT: parseInt(process.env.PORT || '4100', 10),
  COMPANY_NAME: process.env.COMPANY_NAME || 'ThinKorix',
  MAIN_SITE: process.env.MAIN_SITE || 'https://www.thinkorix.com',
  REGISTER_URL: process.env.REGISTER_URL || 'https://www.thinkorix.com',
  APP_URL: process.env.APP_URL || 'http://localhost:4100',
  JWT_SECRET: process.env.JWT_SECRET || 'CHANGE-ME',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'CHANGE-ME-too',
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL || 'admin@thinkorix.com',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || 'change-this-password',
  FORM_URL: process.env.FORM_URL || 'https://docs.google.com/forms/d/e/1FAIpQLScTRbUOw4FHh3KwtpyeXcAsyXCVqWudVkkVqPsYQIP2fzAdnA/viewform',
  ALLOW_SELF_SIGNUP: bool(process.env.ALLOW_SELF_SIGNUP, false),
  INTEGRATION_SECRET: process.env.INTEGRATION_SECRET || '',
  COMMISSION_PER_REFERRAL: Number(process.env.COMMISSION_PER_REFERRAL || 100),
  TARGET_REFERRALS: Number(process.env.TARGET_REFERRALS || 36),
  SEND_EMAIL: bool(process.env.SEND_EMAIL, false),
  MAIL_FROM: process.env.MAIL_FROM || 'ThinKorix <no-reply@thinkorix.com>',
  SMTP_HOST: process.env.SMTP_HOST || '', SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '', SMTP_PASS: process.env.SMTP_PASS || '',
  DB_DRIVER: (process.env.DB_DRIVER || 'local').toLowerCase(),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  PATHS: { dataDir: path.join(__dirname, '..', 'data'), public: path.join(__dirname, '..', 'public') }
};
