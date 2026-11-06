const express = require('express');
const cors = require('cors');
const fs = require('fs');
const config = require('./config');
const auth = require('./auth');
const store = require('./store');

fs.mkdirSync(config.PATHS.dataDir, { recursive: true });
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(config.PATHS.public));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'thinkorix-ambassador' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ambassador', require('./routes/ambassador'));
app.use('/api/admin', require('./routes/admin'));

// Share link: counts the click, then sends the student to the internship registration with ?ref=CODE
app.get('/r/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  try {
    const a = await store.find('ambassadors', x => x.refCode === code);
    if (a) await store.updateById('ambassadors', a.id, { clicks: (a.clicks || 0) + 1 });
  } catch (e) { console.error(e); }
  const u = new URL(config.REGISTER_URL); u.searchParams.set('ref', code);
  res.redirect(u.toString());
});

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error.' }); });
process.on('unhandledRejection', r => console.error('[unhandledRejection]', r));

auth.seedAdminIfMissing().then(() => app.listen(config.PORT, () => console.log(`Ambassador portal on http://localhost:${config.PORT}`)));
