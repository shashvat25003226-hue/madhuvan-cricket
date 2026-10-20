# Madhuban Cricket

**A cricket-first club platform — live scoring, Sunday fixtures, player accounts, career analytics, rankings, reminders, and JARVIS cricket AI.**

> **Created by Swastik Shukla**. Original uploaded logo preserved **byte-for-byte** in `public/logo-original.png` (1024 × 1024 PNG, never downsampled or converted to JPEG).

## What's shipped

- Mobile-responsive dark navy / teal / gold clubhouse UI.
- Player registration and login; password hashes with bcrypt, HTTP-only session cookies, self-managed batting hand, bowling style, role, skill and jersey number.
- New matches with separate team names, overs, ground, toss winner + bat/bowl decision.
- Authorized scorer, ball-by-ball deliveries (0-6 bat runs, wide, no-ball, bye, leg-bye, run out/caught/bowled/LBW/stumped/hit wicket), undo, innings breaks and chase targets.
- Public scorecards, 7-second spectator refresh, batting strike rate, bowling economy, shareable match links.
- Sunday fixtures: RSVP (going/maybe/out), organizer team balancing, JARVIS match plan, start match, optional automated scheduling.
- In-app match reminders; opt-in email via Resend when configured; one-click WhatsApp *share composer* (not unsolicited auto-sending).
- Weekly and all-time leaderboards, player analytics, historic results, career profile.
- JARVIS powered by the Gemini API on the **server only**. Topic-gating, grounded personal stats, authentication and rate-limits restrict it to cricket.

## Requirements

Node.js **20+**, a **Supabase PostgreSQL** project with a database connection/pooler URL, and optionally Google Gemini API and Resend. No preconfigured API keys or database passwords are committed to Git.

## Start locally

```bash
npm install
cp .env.example .env
# Edit .env: SUPABASE_DATABASE_URL, SESSION_SECRET (>=32 chars), ADMIN_EMAIL, ADMIN_SETUP_CODE
npm test
npm run dev
# Open http://localhost:3000
```

The `SUPABASE_DATABASE_URL` must be kept **only** on the server (Vercel encrypted environment variable or local untracked `.env`). Use the Supabase **Transaction Pooler** PostgreSQL connection string (port 6543), with its database password correctly URL-encoded. This backend uses `pg` directly, not the public Firebase configuration or a client-side Supabase anon key. Before starting the app, apply the SQL migration in `supabase/migrations/20261020_madhuban_cricket.sql` to create four isolated `mc_*` tables with database-enforced email uniqueness and row-level security. The database owns all state; Firebase is optional Analytics only. Set a strong `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_SETUP_CODE` before activating an organizer. An organizer must sign up using the exact ADMIN_EMAIL **and** explicitly activate the profile with the secret ADMIN_SETUP_CODE (at least 16 characters); a matching email alone never grants privileges. Email verification is available when Resend is configured, and opt-in email reminders require verification.

## Deploy to Node hosting (Render, Railway, VPS etc.)

Create a **Node web service** with this repository, build command `npm install`, start command `npm start`, and Node 20+. Set `SUPABASE_DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_SETUP_CODE`, `PUBLIC_ORIGIN=https://your-host`, `NODE_ENV=production`, and optionally `GEMINI_API_KEY` / `RESEND_API_KEY` / `REMINDER_FROM_EMAIL` / `CRON_SECRET`. Use the Supabase connection pooler with TLS and keep the database password server-side. TLS/HTTPS is required for secure session cookies.

### Recurring Sunday fixture + reminder automation

1. Set `CRON_SECRET` on the web service to a secure random string.
2. In **GitHub repository Settings → Secrets and variables → Actions**, create secrets `APP_BASE_URL` (public HTTPS base URL) and `CRON_SECRET` (same secret as your web server).
3. Enable GitHub Actions. `.github/workflows/sunday-scheduler.yml` runs **daily at 13:30 IST** (cron expressions use UTC).
4. The server's `/api/cron/tick` idempotently creates the next Sunday fixture (07:00 IST at `DEFAULT_VENUE` or Madhuban Ground). The same task creates an in-app reminder for confirmed players in the 26 hours before kickoff. Email delivery happens only for consenting users when Resend is configured. Group WhatsApp sharing stays manual.
5. The default venue/time are an editable example, **not a confirmed ground booking**. The organizer should review fixtures and communicate changes in the group.

### JARVIS configuration

Set `GEMINI_API_KEY` in your server environment, optionally `GEMINI_MODEL` (default `gemini-2.5-flash`). Do not put the key in public JavaScript, GitHub files, or client-side storage. JARVIS answers only cricket-related questions and can draft a balanced Sunday plan for organizers. Its suggestions are **not official results or actual sent messages**.

## Security and limitations

- Verification links are available only after configuring Resend and a sender domain; unverified players can still access the app but cannot receive email reminders. For a public rollout, add password-reset flow, stronger abuse protection, monitoring and audit logs.
- Team balancing uses player self-ratings and is a helpful starting point; it is not official selection. The organizer decides lineups.
- Scoring supports common limited-overs cases; rare edge cases (DLS, super overs, penalty runs, retired hurt, complex run-out crossing rules, wides with run-outs, third-umpire decisions) are not fully modelled. Agree on how to score non-standard situations.
- A registered player gets career metrics when the scorer chooses their exact player name from the list. Guest names are allowed but don't map to an account.
- Weekly stats are based on the UTC Monday start; Sunday IST results are included but boundary hours may vary.
- Password resets, photo uploads, video highlights, push notifications and payment functionality are not included in this release.
- **Email reminders** require Resend setup, player opt-in, and successful email verification before sending.
- **No WhatsApp auto-messages:** the button opens a share composer; sending is a user action.
- Supabase database passwords, Gemini key and email service secrets must never be committed. Keep `.env` ignored.

## Verify

`npm test` exercises delivery/extras and scorecard accounting. `node --check server.js && node --check public/app.js` checks syntax. For deployment, manually test registration, fixture RSVP, toss, every scoring case, innings finish, undo, leaderboard updates and mobile layout.

**Brand credit:** Created by **Swastik Shukla**.


## iPhone + Android install (PWA)

Madhuban is a mobile-first installable Progressive Web App (not a native App Store release). The original 1024×1024 logo in `public/logo-original.png` is preserved byte-for-byte; generated icons are separate lossless PNGs.

- **iPhone/iPad:** open the deployed HTTPS site in **Safari** → Share → **Add to Home Screen** → Add.
- **Android:** open in Chrome → menu → **Install app** or **Add to Home screen**.
- Internet is required for score changes, accounts, leaderboards, messaging and Gemini. Static shell has an offline fallback; no private API responses are cached.
- iOS remote push messages are not available in this version; only in-app reminders and verified opt-in email reminders. WhatsApp invitations use the user's share composer (they are not auto-sent).

## Firebase

`public/firebase.js` uses the provided Firebase project config for **optional Google Analytics**, after player consent. Firebase public configuration is not a server-side secret. Supabase PostgreSQL is the source of truth for accounts, matches and statistics; Firebase Auth, Firestore, Firebase Cloud Messaging and App Check are **not configured**. The analytics opt-in control is in the footer.

## Club culture

The homepage and footer thank the cricketers, friends and coaches who made childhood memorable, and include original motivational quotes. Developer credit **Swastik Shukla**, Instagram [@swastik_shukla__](https://www.instagram.com/swastik_shukla__/), and the [Madhuban WhatsApp group](https://chat.whatsapp.com/HNSGDgdGJVJGFnXEQfQNNk) are linked. Reference photographs from external fan edits are **not republished** without image rights.


## PostgreSQL migration and production cutover (3.0)

The application is now implemented against **Supabase PostgreSQL**, not MongoDB. Routes, scoring logic, cookies, player profiles, leaderboards, fixtures and notifications are preserved. The SQL database migration is in `supabase/migrations/20261020_madhuban_cricket.sql`. **Do not deploy the 3.0 backend to production until your Supabase project is connected and the migration has been applied.**

1. In Supabase SQL Editor run the migration (or use Supabase CLI migrations with an authorized connection). It creates isolated `public.mc_players`, `public.mc_matches`, `public.mc_fixtures`, `public.mc_notifications` and supporting indexes. RLS is enabled and anonymous client roles are denied access; all reads/writes flow through the authenticated Node backend.
2. In Supabase **Connect** → choose the **transaction pooler** PostgreSQL connection string and database password. Save it as the Vercel encrypted environment variable `SUPABASE_DATABASE_URL` for the production deployment. Never commit this URL. Some IPv4/IPv6 networking setups require the pooler instead of a direct database hostname.
3. Keep Vercel `SESSION_SECRET` unchanged if you want existing login cookies to remain valid. Set `ADMIN_EMAIL` and a secret `ADMIN_SETUP_CODE` if you want organizer controls. Retain `PUBLIC_ORIGIN=https://madhuvan-cricket.vercel.app`.
4. Redeploy the linked GitHub branch and confirm `GET /api/health` returns `database: supabase-postgresql`. Test registration, login, profile update, fixtures, and end-to-end scoring in a browser before pointing production to it.
5. Remove the legacy `MONGODB_URI`/`MONGODB_DB` from Vercel **only after** the Supabase rollout is verified. No migration of old data was needed when checked: the four dedicated MongoDB collections were empty. If new club data was entered since that check, export and migrate before cutting over.

**Note:** This app keeps its own bcrypt/JWT account system with session cookies, storing accounts in Supabase PostgreSQL. It does not use Supabase Auth and does not expose any Supabase private keys to browsers.