# ThinKorix Ambassador Portal

A separate website for the Ambassador Program. Same stack and look as the main ThinKorix site (Node/Express, JWT + bcrypt, local JSON or Firestore, nodemailer).

## Run
```bash
npm install
npm start            # http://localhost:4100
```
Admin login (seeded on first boot, change it!): `admin@thinkorix.com` / `change-this-password` -> `admin.html`.
Before deploying set `JWT_SECRET`, `ADMIN_TOKEN`, `INTEGRATION_SECRET`, `APP_URL`, `REGISTER_URL` in `.env`.
For production use `DB_DRIVER=firestore` (same setup as the main backend) and `SEND_EMAIL=true` with SMTP.

## How it works
| Step | What happens |
|---|---|
| Apply (Google Form) | Account + unique code like `TKA7K2MQ` created automatically |
| Student uses the code / link `/r/CODE` | Click counted, student sent to `REGISTER_URL?ref=CODE` |
| Main site records the registration | `POST /api/ambassador/integrations/referral` -> status **pending** |
| Payment confirmed | `POST /api/ambassador/integrations/paid` (or admin clicks *Mark paid*) -> **paid**, commission locked in |
| Ambassador logs in | Sees code, paid/pending referrals, commission, balance, progress to target, payouts, leaderboard |
| Admin | Manages referrals, records payouts, edits commission rate and target, exports CSV |

A referral counts only after payment. Commission is stored per referral when it turns paid, so changing the rate never rewrites history. Ambassadors see students' names masked (e.g. "Riya S.").

## Connect the Google Form (auto-register)
Your application form: https://docs.google.com/forms/d/e/1FAIpQLScTRbUOw4FHh3KwtpyeXcAsyXCVqWudVkkVqPsYQIP2fzAdnA/viewform
Its questions are `Email`, `Full Name`, `Phone Number`, `College / Institution`, `Preferred Start Date`, `Program Duration`, `Referral Code (optional)`.
In the form's linked Sheet open Extensions -> Apps Script, add this function, then a trigger: `registerInPortal`, From spreadsheet, On form submit.

```javascript
const PORTAL = 'https://YOUR-AMBASSADOR-SITE/api/ambassador/integrations/ambassador';
const SECRET = 'same value as INTEGRATION_SECRET';

function registerInPortal(e) {
  const v = e.namedValues, get = k => (v[k] && v[k][0]) || '';
  UrlFetchApp.fetch(PORTAL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-integration-secret': SECRET },
    payload: JSON.stringify({
      name: get('Full Name'), email: get('Email'), phone: get('Phone Number'),
      college: get('College / Institution'), startDate: get('Preferred Start Date'),
      duration: get('Program Duration'), referredBy: get('Referral Code (optional)')
      // refCode: <the code your existing script generated, if it already makes one>
    })
  });
}
```
- **Referral codes** use the same format your form shows, e.g. `TKX-RAH101`.
- Your form already emails an appointment letter and a referral code. If that existing script creates the code, pass it as `refCode` above so the portal uses the **same** code instead of making a new one. If it does not, the portal generates the code and includes it in its own welcome email (with the portal login).
- If the applicant entered an existing ambassador's code, it is saved as "referred by" and shown in the admin panel.
- Keep the form's question titles exactly as above; the script reads them by name.

## Connect the main ThinKorix internship registration
1. Read `?ref=CODE` on the registration page and send it with the form (hidden field).
2. After a successful registration, call this from your server (never the browser; the secret must stay private):
```javascript
await fetch(AMBASSADOR_URL + '/api/ambassador/integrations/referral', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-integration-secret': process.env.AMBASSADOR_SECRET },
  body: JSON.stringify({ refCode, studentName: fullName, studentEmail: email })
});
```
3. When payment succeeds (gateway webhook), call `/api/ambassador/integrations/paid` with `{ studentEmail }`. Until payments are automated, admins mark referrals paid in `admin.html`.

## Files
`src/ambassadors.js` core logic, `src/routes/ambassador.js` signup, dashboard and integrations, `src/routes/admin.js`, and `public/` (landing, login, dashboard, admin pages).

## Hosting: frontend on Vercel, backend on Render
`public/` is the whole frontend (static). The backend (everything else) runs on Render.

1. **Render (backend):** deploy the repo as a Node web service (`npm install` / `npm start`) with the env vars from `.env.example`. Set `DB_DRIVER=firestore`. Set `APP_URL` to your **Vercel** URL (emails and share links point to the frontend).
2. **Vercel (frontend):** import the same repo, set **Root Directory = `public`**, Framework Preset = Other, leave build/output empty. Before deploying, edit `public/vercel.json` and replace `YOUR-SERVICE.onrender.com` with your Render host.
3. The `rewrites` in `vercel.json` forward `/api/*` and `/r/*` from Vercel to Render, so the browser only talks to one domain (no CORS setup, nice share links like `https://your-site.vercel.app/r/TKX-RAH101`).
4. In the Google Form's Apps Script, point `PORTAL` at the **Render** URL directly (not Vercel), so a sleeping free-tier server isn't cut off by a proxy timeout.

Alternative without rewrites: set `API_BASE` in `public/js/api.js` to your Render URL (CORS is already enabled), and note that `/r/` share links would then use the Render domain.
