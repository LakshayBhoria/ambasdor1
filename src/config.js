require('dotenv').config();
const path = require('path');
const bool = (v, f) => (v === undefined || v === '' ? f : String(v).toLowerCase() === 'true');
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const config = {
  NODE_ENV, isProd,
  PORT: parseInt(process.env.PORT || '4100', 10),
  COMPANY_NAME: process.env.COMPANY_NAME || 'ThinKorix',
  MAIN_SITE: process.env.MAIN_SITE || 'https://www.thinkorix.com',
  REGISTER_URL: process.env.REGISTER_URL || 'https://www.thinkorix.com',
  APP_URL: (process.env.APP_URL || 'http://localhost:4100').replace(/\/+$/, ''),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  JWT_SECRET: process.env.JWT_SECRET || 'CHANGE-ME',
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL || 'admin@thinkorix.com',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || 'change-this-password',
  FORM_URL: process.env.FORM_URL || 'https://docs.google.com/forms/d/e/1FAIpQLScTRbUOw4FHh3KwtpyeXcAsyXCVqWudVkkVqPsYQIP2fzAdnA/viewform',
  INSTAGRAM_URL: process.env.INSTAGRAM_URL || '',
  LINKEDIN_URL: process.env.LINKEDIN_URL || '',
  STIPEND_TEXT: process.env.STIPEND_TEXT || '₹9,000+',
  ALLOW_SELF_SIGNUP: bool(process.env.ALLOW_SELF_SIGNUP, false),
  INTEGRATION_SECRET: process.env.INTEGRATION_SECRET || '',
  COMMISSION_PER_REFERRAL: Number(process.env.COMMISSION_PER_REFERRAL || 100),
  SEND_EMAIL: bool(process.env.SEND_EMAIL, false),
  MAIL_FROM: process.env.MAIL_FROM || 'ThinKorix <no-reply@thinkorix.com>',
  SMTP_HOST: process.env.SMTP_HOST || '', SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '', SMTP_PASS: process.env.SMTP_PASS || '',
  DB_DRIVER: (process.env.DB_DRIVER || 'local').toLowerCase(),
  ALLOW_LOCAL_DB: bool(process.env.ALLOW_LOCAL_DB, false),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  SERVE_STATIC: bool(process.env.SERVE_STATIC, !isProd),
  PATHS: { dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'), public: path.join(__dirname, '..', 'public') }
};

// Refuse to boot in production with unsafe defaults.
config.validate = function validate() {
  if (!isProd) return;
  const errs = [];
  if (config.JWT_SECRET.length < 32 || /CHANGE-ME/i.test(config.JWT_SECRET)) errs.push('JWT_SECRET must be a random string of at least 32 characters.');
  if (config.INTEGRATION_SECRET.length < 16 || /CHANGE-ME/i.test(config.INTEGRATION_SECRET)) errs.push('INTEGRATION_SECRET must be set to a random string of at least 16 characters.');
  if (config.SEED_ADMIN_PASSWORD === 'change-this-password' || config.SEED_ADMIN_PASSWORD.length < 10) errs.push('SEED_ADMIN_PASSWORD must be changed (10+ characters).');
  if (!/^https:\/\//.test(config.APP_URL)) errs.push('APP_URL must be your public https frontend URL.');
  if (config.DB_DRIVER !== 'firestore' && !config.ALLOW_LOCAL_DB) errs.push('DB_DRIVER=firestore is required in production (Render disks are wiped on every deploy). Set ALLOW_LOCAL_DB=true only if you attach a persistent disk.');
  if (errs.length) throw new Error('Unsafe production configuration:\n - ' + errs.join('\n - '));
};
module.exports = config;
