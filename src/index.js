require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const fs = require('fs');
const config = require('./config');
config.validate();
const auth = require('./auth');
const store = require('./store');
const amb = require('./ambassadors');

fs.mkdirSync(config.PATHS.dataDir, { recursive: true });
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: config.SERVE_STATIC ? false : undefined }));
app.use(compression());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                                    // server-to-server, curl, same-origin
    if (!config.isProd) return cb(null, true);                             // open in development
    cb(null, config.CORS_ORIGINS.includes(origin) || origin === config.APP_URL);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'x-integration-secret']
}));
app.use(express.json({ limit: '100kb' }));
if (config.SERVE_STATIC) app.use(express.static(config.PATHS.public));
else app.get('/', (req, res) => res.json({ ok: true, service: 'thinkorix-ambassador-api' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'thinkorix-ambassador', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ambassador', require('./routes/ambassador'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/admin', require('./routes/admin'));

// Share link: counts the click, then sends the student to the internship registration with ?ref=CODE
app.get('/r/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const u = new URL(config.REGISTER_URL);
  if (/^[A-Z0-9-]{4,20}$/.test(code)) {
    try {
      const a = await store.findBy('ambassadors', 'refCode', code);
      if (a) { await store.updateById('ambassadors', a.id, { clicks: (a.clicks || 0) + 1 }); u.searchParams.set('ref', code); }
    } catch (e) { console.error(e); }
  }
  res.redirect(u.toString());
});

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal server error.' }); });
process.on('unhandledRejection', r => console.error('[unhandledRejection]', r));

// Illustrated reward examples so the gallery is never empty. Admins replace them with real photos.
const SEED_GALLERY = [
  ['Ambassador T-shirt', 'Unlocked at 20 paid referrals.', 'Rewards', '/img/gallery-tshirt.svg', true],
  ['Goodies pack', 'Mug, notebook and stickers. Unlocked at 30.', 'Rewards', '/img/gallery-goodies.svg', true],
  ['Premium hamper', 'The full set for Legends at 50.', 'Rewards', '/img/gallery-hamper.svg', false],
  ['Certificate of excellence', 'Awarded to Legend ambassadors.', 'Certificates', '/img/gallery-certificate.svg', false],
  ['Offer letter and LOR', 'Internship offer and recommendation at 50.', 'Certificates', '/img/gallery-letter.svg', false]
];
async function seedGallery() {
  if ((await store.readAll('gallery')).length) return;
  for (const [title, caption, category, imageUrl, featured] of SEED_GALLERY) await store.insert('gallery', { title, caption, category, imageUrl, featured });
}

(async () => {
  await auth.seedAdminIfMissing();
  await amb.getSettings();
  await seedGallery();
  const server = app.listen(config.PORT, '0.0.0.0', () => console.log(`Ambassador API on port ${config.PORT} (${config.NODE_ENV}, db=${config.DB_DRIVER})`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
