# La Mies — soul-winning app for the church

One app for Android and iPhone. Members press **Iniciar salida**, the app marks every
street side they walk (one color per day for the whole team), they mark houses with the
people they talked to, promises to come to church get tracked, and the pastor gets
reports per outing / week / month. Face ID (or fingerprint / phone code) opens the app.

Since version 0.2 it is the whole church in one app: people with photos, attendance by tapping
faces, faithfulness and the journey of each person, Sunday-school classes with teachers,
materials and notes, ministries with group chat and duty rosters, Monday reminders, absence
reports, sermons (YouTube + audio), and the church's giving details.

Everything in the app is in Argentine Spanish. This README is for the person setting it up.

## What is in this folder

| Folder | What it is |
| --- | --- |
| `app/` | The screens (Expo Router). One file per screen. |
| `src/` | The logic: GPS tracking, street-side math, secure storage, Supabase calls. |
| `supabase/migrations/` | The database: tables, security rules, functions. Run once, in order. |
| `supabase/seed.sql` | Your church + three sample training articles. |
| `supabase/PEGAR_EN_SUPABASE_2.sql` | **Part 2** for a church that already ran part 1 (adds everything new, deletes nothing). |
| `supabase/PEGAR_EN_SUPABASE.sql` | Everything in one file, for a brand-new Supabase project. |
| `supabase/tests/` | Security tests (who can see what). They pass. |
| `scripts/import-roads.mjs` | Loads the streets of a city from OpenStreetMap (free). |
| `tests/` | Unit tests for the math (street side, vehicle detection, scoring). They pass. |
| `docs/` | Security notes and the Phase 1 spec. |

## What it costs

| Service | Cost | Needed for |
| --- | --- | --- |
| Supabase | Free (upgrade later if the church grows past the free tier). Free projects pause after a week with no use; restore with one click in the dashboard. | Database, logins, live positions |
| Expo (EAS) | Free tier builds the app in the cloud (limited builds per month) | Building the app (no Xcode needed) |
| Google Maps key | Free (needs a Google Cloud account with a card on file; mobile maps are not charged) | Map on **Android** only |
| Apple Developer | US$99 / year | Putting the app on **any iPhone**, even for testing |
| Google Play | US$25 once | Only when you want the app in the Play Store. Android testing works without it (APK file). |

## Setup, step by step (Mac)

### 1. Create the database (Supabase) — in the browser
1. https://supabase.com → **Start your project** → create an account (email + password, then confirm the email they send you).
2. Create an **organization**: name `Hope for Argentina`, plan **Free**.
3. **New project**: name `la-mies`, **Generate a password** and save it, region **South America (São Paulo)** → **Create new project**. Wait ~2 minutes.
4. Left menu **SQL Editor** → **New query**. Open `supabase/PEGAR_EN_SUPABASE.sql` (right-click → Open With → TextEdit), Cmd+A, Cmd+C, paste into Supabase → **Run**. If it warns about the query, choose **Run this query**. At the bottom you'll see your church's **join code** — write it down.
5. Left menu **Authentication** → **Sign In / Providers** → **Email**: turn **off** "Confirm email" → **Save**.
6. Left menu **Project Settings** → **API Keys**: keep this page open. You need the **Project URL** and the **publishable key** (`sb_publishable_...`).

### 2. Paste the two values into the app
Open `app.json` (TextEdit). Near the bottom:

```json
"extra": {
  "supabaseUrl": "PEGAR_ACA_PROJECT_URL",
  "supabaseAnonKey": "PEGAR_ACA_PUBLISHABLE_KEY"
}
```

Replace each `PEGAR_ACA...` with the real value (keep the quotes). Save. These two values are public by design; the security rules protect the data.

### 3. Install the tools on the Mac (once)
1. https://nodejs.org → download the **LTS** installer (.pkg) → install.
2. Open **Terminal** (Cmd + Space, type Terminal, Enter).
3. Go into the project folder (if you put it in Documents):

```bash
cd ~/Documents/la-mies
npm install
```

### 4. Load the streets (once per city)
In Supabase → Project Settings → API Keys copy the **secret key** (`sb_secret_...`; master key: never in the app, never shared). Then in Terminal (one line):

```bash
SUPABASE_URL=https://XXXX.supabase.co SUPABASE_SECRET_KEY=sb_secret_... node scripts/import-roads.mjs --city "Posadas"
```

For another city: `--city "Oberá" --bbox south,west,north,east` (box from https://boundingbox.klokantech.com, "CSV").

### 5. Build the iPhone app (needs the Apple Developer membership to be **Active**)
Create a free account at https://expo.dev first. Then:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile production
```

Answers to the questions it asks:
- *Log in to your Apple account?* **Yes** → your Apple ID email → password → the 6-digit code that pops up on your iPhone.
- *Generate a new Apple Distribution Certificate?* **Yes**.
- *Generate a new Apple Provisioning Profile?* **Yes**.

The build runs on Expo's computers (about 15–30 minutes). Then send it to Apple:

```bash
npx eas-cli@latest submit --platform ios --latest
```

It logs into Apple again, creates the app in App Store Connect and uploads the build. If it says the name "La Mies" is taken, change `"name"` in `app.json` (e.g. `La Mies Evangelismo`) and run build + submit again.

### 6. TestFlight (install on phones)
1. https://appstoreconnect.apple.com → **Apps** → La Mies → **TestFlight**. Wait until the build says **Ready to Test** (10–30 min after upload).
2. **Internal testing** → **+** → group "Equipo" → add yourself (your Apple ID). Install the **TestFlight** app on your iPhone; the invitation arrives by email. No review needed.
3. For church members: **External testing** → **+** → group "Iglesia" → add the build → fill in Test Information (description, feedback email, and a **demo account** for Apple's reviewer: an email + password already joined to your church) → submit for Beta App Review (usually about a day) → enable **Public Link** and send it by WhatsApp. Up to 10,000 testers.

### 7. Android

**Quick way, no store (free):**

```bash
npx eas-cli@latest build --platform android --profile preview
```

You get a link to an `.apk`; send it by WhatsApp. The Android map needs a Google Maps key in
`app.json` → `android.config.googleMaps.apiKey` (Google Cloud Console → enable **Maps SDK for
Android** → Credentials → API key).

**Google Play:** see `docs/ANDROID.md` (account, the 12-testers/14-days rule for new personal
accounts, upload, store listing).

### 8. Make yourself the administrator
Create your account in the app (Crear cuenta → name, email, password, the join code shown at the end of the SQL run). Then Supabase → SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

### 8b. Run part 2 of the database (once; running it again is harmless)
Supabase → SQL Editor → New query → paste **all** of `supabase/PEGAR_EN_SUPABASE_2.sql` → Run.
It ends with a small table: your church with 4 meetings, 3 classes, 5 ministries.
Then Supabase → **Integrations** (or Database → Extensions) → check that **pg_cron** and
**pg_net** are on (the script tries to turn them on). They send the Monday reminders and the
Sunday 17:00 absence report.

### 8c. Push notifications
Run these once in the project folder (they write the project id and the update address into
`app.json`):

```bash
npx eas-cli@latest init
npx eas-cli@latest update:configure
```
 After the next build, phones register for notifications by themselves.
Notifications also always appear inside the app under **Yo → Avisos**.

### 9. Hand it to the members
Share the church code from **Panel del pastor**. Members install, create an account with the code, allow **Location: Always** and notifications. On Android (Samsung, Motorola, Xiaomi) also set battery to **Unrestricted** for La Mies.

## The web version (computer, for the pastor and the secretary)

The same app runs in the browser: people, attendance by tapping faces, faithfulness, classes,
ministries, sermons, giving, the map. Outings (GPS) are phone-only; Face ID is not used on the web.

Put it online with Expo's free hosting (about 5 minutes, after `eas init` from step 8c):

```bash
cd ~/Documents/la-mies
npx expo export --platform web
npx eas-cli@latest deploy --prod
```

The first time it asks for a subdomain name (for example `la-mies`). The address is then
`https://la-mies.expo.app`. Run the same three lines again after every change. Before that,
Supabase → Authentication → URL Configuration → add that address to **Redirect URLs**
(only needed for password-reset links).

## Tablets and iPads

The app installs on iPads and Android tablets like on phones (same TestFlight / Play Store
links). On wide screens the lists use two columns and the attendance grid shows up to 8 faces
per row, which is the comfortable way for the usher at the door and for teachers.

## Try it before publishing (Expo Go)

1. On the iPhone, install **Expo Go** from the App Store.
2. On the Mac (same Wi-Fi as the phone): `cd ~/Documents/la-mies` → `npm install` → `npx expo start`.
3. A QR code appears in Terminal. Open the iPhone **Camera**, point at it, tap the banner.
4. Everything works except: GPS with the screen off (only with the app open), Face ID (asks
   for the phone code instead), and push notifications (they still show in Avisos).
5. To stop: in Terminal press `Ctrl + C`.

## Things to know

- **Nothing here has run on a real phone yet.** It compiles, the database security tests
  pass, and the math is unit-tested, but the first install will surface bugs. Plan a test
  outing with 3–4 phones (one iPhone, one Samsung, one Motorola) before the whole church.
- **GPS and street sides.** Phone GPS is accurate to roughly 3–10 m. The app picks the side
  automatically and shows it in a pill; one tap flips it. Houses marked also confirm the side.
- **Forgot to stop?** Yo → Mis salidas → pick the outing → choose the time you really
  stopped → everything after it is deleted (with a confirmation).
- **Vehicle detection.** 20 km/h for more than 20 seconds (4+ GPS readings) ends the outing
  automatically at the last walking point and sends a notification.
- **Scoring.** Presentation 1 · promise 3 · came to church 10. Blocks walked never count.
  Baptisms and discipleship are counted and reported but give no points (change in
  `supabase/migrations/0003_functions.sql`, function `scoreboard`, and `src/lib/levels.ts`).
- **Training content.** Supabase → Table Editor → `training_items`. `church_id` empty =
  visible to every church; set it to your church id for church-only material. `kind`
  `video` + `video_url` (YouTube/Vimeo link) opens the video.
- **Other churches.** Each church is a row in `churches` with its own join code. Their data
  is separated by the security rules; a network administrator (`is_network_admin`) sees
  totals only through `network_summary()`. The network dashboard screen is Phase 3.
- **GPS retention.** Raw GPS points are deleted automatically 30 days after an outing ends
  (they are only needed to trim a forgotten outing). The covered street sides are kept
  forever, so the church keeps the history of the whole city.
- **Outing types.** Evangelismo (green/blue lines) and Volantes (orange lines) are separate
  maps; the filter on the map shows Todo / Evangelismo / Volantes.
- **Who takes attendance.** Captains, secretaría, pastor, members of a ministry marked
  "takes attendance" (Recepción), and anyone the staff flags in Iglesia → Roles y cuentas →
  person → "Puede tomar asistencia". Class attendance: the teachers of that class and staff.
- **Roles.** Miembro · Capitán · Secretaría · Pastor/admin. Secretaría loads members, links
  accounts, edits classes, rosters, sermons and giving details, but cannot name administrators.
- **Linking accounts.** When someone creates an account with the same cell number the
  secretary already loaded, the account links to that card by itself. If not, the app makes
  a card and the secretary links it from the person's page (Cuenta en la app → Vincular).
- **Storage.** Free Supabase: 1 GB of files, 50 MB per file. Photos are shrunk to ~50 KB.
  A one-hour sermon as MP3 at 64 kbps is ~28 MB, so about 30 sermons fit; after that the
  Pro plan (US$25/month, 100 GB) or keep only the YouTube link for older sermons.
- **Reminders.** Every Monday at 9:00 (church time): duties and classes for the week, naming
  the chapter. Sunday 17:00: pastor gets the members who were not marked present Saturday or
  Sunday; each bus captain gets the people of his route. Change the hours in the `churches`
  table (`reminder_dow`, `reminder_hour`, `absence_dow`, `absence_hour`).
- **Not built yet:** weekly report email, network dashboard screen, photos/documents in chat.

## Checks you can run

```bash
npm run typecheck     # TypeScript
npm test              # math tests
npm run test:sql      # database + security tests (needs a local Postgres; see scripts/test-sql.mjs)
npx expo export --platform web   # builds the web version into dist/
```

See `docs/SECURITY.md` for how the app is protected.
