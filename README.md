# ThinKorix Ambassador Program

Referral portal for the ThinKorix ambassador program. Students get a pass with a personal code, share it, and unlock rewards at **20, 30 and 50 paid referrals**.

| Referrals | Rewards (editable in the admin panel) |
|---|---|
| 20 | T-shirt, cash bonus |
| 30 | Goodies pack, more gifts, cash bonus |
| 50 | Premium hamper, cash reward, **paid internship (stipend up to ₹9,000+)**, offer letter, LOR, certificate, more gifts |

**Frontend** (`public/`, static) goes on Vercel. **Backend** (`src/`, Node/Express) goes on Render. Data lives in Firebase Firestore.

## What is in it
- **Home page** shows the logged-in ambassador's own pass (name, college, code, progress, rank), their next reward and a welcome strip. Visitors see a labelled sample pass.
- **Reward ladder and tier cards** with illustrations, driven by the tiers you set in admin.
- **Dashboard**: pass, progress, share link and WhatsApp share, stats, referrals, payouts, leaderboard, account (details and password), and **Claim this reward** with delivery address and T-shirt size.
- **Gallery** with category filters and a full-screen viewer. Admins add photos by link.
- **Admin**: ambassadors, referrals (mark paid), reward claims (status and courier note, emailed to the ambassador), payouts, gallery, commission rate and reward tiers.
- **Security**: bcrypt passwords (8+ chars), hashed reset tokens, login and reset rate limits, helmet, CORS allow-list, strict CSP on Vercel, the app refuses to start in production with default secrets, timing-safe integration secret, self-referral and duplicate-student protection.

## 1. Firebase (database)
1. Firebase console → create a project → Build → Firestore Database → Create (production mode).
2. Project settings → Service accounts → Generate new private key. Keep the JSON private.
3. No indexes are needed.

## 2. Render (backend)
1. Push this folder to GitHub. Render → New → Blueprint (it reads `render.yaml`) or New → Web Service (build `npm install --omit=dev`, start `node src/index.js`).
2. Set environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_DRIVER` | `firestore` |
| `FIREBASE_PROJECT_ID` | your project id |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | paste the whole key JSON |
| `JWT_SECRET` | 48+ random bytes (Render can generate it) |
| `INTEGRATION_SECRET` | random string, also used in the Google Form script |
| `APP_URL` | your Vercel URL, e.g. `https://thinkorix-ambassador.vercel.app` |
| `REGISTER_URL` | your internship registration page (students land here from `/r/CODE`) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | your first admin login (10+ chars) |
| `SEND_EMAIL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | to send real emails (Gmail needs an app password) |
| `STIPEND_TEXT`, `INSTAGRAM_URL`, `LINKEDIN_URL` | optional |

3. Open `https://YOUR-SERVICE.onrender.com/api/health`. It should return `{"ok":true,...}`.

Free Render services sleep after 15 minutes idle and take up to a minute to wake. The site shows a "server is waking up" notice. To avoid it, use a paid plan or ping `/api/health` every 10 minutes with UptimeRobot.

## 3. Vercel (frontend)
1. Edit `public/vercel.json` and replace both `YOUR-SERVICE.onrender.com` with your Render host.
2. Vercel → Add New Project → import the repo. **Root Directory = `public`**, Framework Preset = Other, leave build and output empty.
3. Rewrites send `/api/*` and `/r/*` to Render, so the browser talks to one domain and share links look like `https://your-site.vercel.app/r/TKX-RIY926`.
4. Put the Vercel URL into Render's `APP_URL`, then redeploy Render.

## 4. First login
Open `/login.html` with the seeded admin email and password, then `/admin.html`. In **Settings** set the cash amounts per tier, edit reward lists and the commission. In **Gallery** replace the illustrated samples with real photos.

## 5. Connect the Google Form and the main site
Same flow as before. Point both at the **Render** URL with the `x-integration-secret` header.

```javascript
// Google Form → Apps Script, trigger: From spreadsheet, On form submit
const PORTAL = 'https://YOUR-SERVICE.onrender.com/api/ambassador/integrations/ambassador';
const SECRET = 'same value as INTEGRATION_SECRET';
function registerInPortal(e) {
  const v = e.namedValues, get = k => (v[k] && v[k][0]) || '';
  UrlFetchApp.fetch(PORTAL, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-integration-secret': SECRET },
    payload: JSON.stringify({ name: get('Full Name'), email: get('Email'), phone: get('Phone Number'),
      college: get('College / Institution'), startDate: get('Preferred Start Date'),
      duration: get('Program Duration'), referredBy: get('Referral Code (optional)') }) });
}
```
- Main site, after a student registers (server side only): `POST /api/ambassador/integrations/referral` with `{ refCode, studentName, studentEmail }`.
- After payment succeeds: `POST /api/ambassador/integrations/paid` with `{ studentEmail }`. Until payments are automated, mark referrals paid in the admin panel.

## Run locally
```bash
cp .env.example .env
npm install
npm start        # http://localhost:4100 (API and site together)
npm test         # 31 end-to-end checks
```

## Notes
- Gallery images are links, not uploads, because Render's disk is wiped on each deploy.
- Cash, gifts and internship details are fulfilled by your team. The portal records claims and status; it does not issue letters or certificates.
- `.env` files were left out of this package. If the `.env` in your original zip held real secrets, rotate them.

## Commission slabs
Commission depends on the ambassador's paid-referral number (set in `src/config.js` → `COMMISSION_SLABS`):

| Paid referrals | Commission per referral |
|---|---|
| 1 to 10 | ₹100 |
| 11 to 20 | ₹136 |
| 21 to 50 | ₹200 |

The paid-internship reward is unlocked at 50 paid referrals (Legend tier). The rate is fixed at the moment a referral turns paid.

## Welcome email and appointment letter
After the application form the student gets one email: the **mail body** has the login ID (email), temporary password, portal link and referral code, and the **appointment letter is attached** as a separate file (referral code, share link, commission slabs and rewards, no login details). Requires `SEND_EMAIL=true` and SMTP settings on Render.

## Tracking without login
Ambassadors open `/track.html` and enter their referral code plus the email they applied with (no password). They see paid and pending referrals, commission, balance, payouts, reward progress and progress toward the 50-referral internship. They also get an email each time a referral is marked paid. Endpoint: `POST /api/ambassador/track` (rate limited).
