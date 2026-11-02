# How La Mies is protected

Plain-language summary of the security decisions, and where each one lives in the code.

## Opening the app

- **Face ID / fingerprint / phone code** is required to open the app and again whenever it
  has been in the background for more than 2 minutes (`src/components/LockGate.tsx`).
  A member can turn it off in Ajustes; the default is on.
- The login session is stored **encrypted**: a random 256-bit AES key lives in the phone's
  Keychain (iPhone) / Keystore (Android), and the encrypted session blob in app storage.
  Without the key the blob is useless (`src/lib/secureStore.ts`).
- Tokens are refreshed only while the app is in the foreground, and never written to logs.

## Accounts and passwords

- Logins go through Supabase Auth over HTTPS. Passwords are hashed with bcrypt on the
  server; the app never sees other people's passwords.
- Minimum 8 characters. Supabase rate-limits sign-in attempts.
- Joining a church requires the church's **join code**. The administrator can generate a new
  one at any time (Panel del pastor → Nuevo código); the old one stops working immediately.
- "Forgot password" sends a reset email; nothing can be reset from inside the app.

## Who can see what (the important part)

The app itself cannot "decide" what to show: the database enforces it with **Row Level
Security** (`supabase/migrations/0002_security.sql`). Even if someone modifies the app or
calls the API directly with the public key, they only get what the rules allow.

- Every record carries a `church_id`. A church never sees another church's data (tested).
- **Members** see: the people of their own church, the coverage map, live positions while
  outings are active, their own contacts, contacts shared with their group, and contacts
  shared with them personally.
- **Captains** also mark attendance, discipleship and baptisms, and open the panel.
- **Administrators** see every contact of their church, change roles and the join code.
- **Nobody can promote themselves**: a database trigger rejects any change of role, church or
  group that is not made by an administrator (tested).
- Raw GPS trails are visible only to their owner, to administrators, and to the team while
  the outing is active (to show teammates live). Live positions are deleted when the
  outing ends.
- Church-wide totals for a network administrator are computed by a function that returns
  numbers only, never contacts or trails.
- Administrative actions (role changes, join-code changes, trimmed outings) are written to
  `audit_log`.

## Keys

- The app ships only the **publishable** key (formerly "anon"), which is designed to be public and does nothing
  without a valid login plus the security rules.
- The **secret** key (formerly "service_role", the master key) is used only by `scripts/import-roads.mjs` on the
  administrator's computer. It must never be put in the app, in a group chat, or in git.
  `.env` is git-ignored.

## Location privacy

- Location is collected **only between "Iniciar salida" and "Finalizar salida"**.
- The map stores which street sides were covered and when, not where members are.
- Vehicle detection cuts an outing automatically; the member can also trim an outing they
  forgot to stop, and the deleted part is removed from the map, not just hidden.

## Personal data of the people visited

Names, ages, phone numbers and spiritual interest of contacts are **sensitive data** under
Argentina's Ley 25.326 (religious beliefs). Recommendations:

- Only write down a phone number the person gave you for that purpose.
- Keep the member list small and remove people who leave the church (an administrator can
  delete their account in Supabase → Authentication).
- Export or delete a contact's data if the person asks.
- Keep the Supabase project on a strong password and enable 2-factor login on the Supabase
  and Expo accounts.

## Not done yet (worth adding before scaling to many churches)

- Two-factor login for administrators (Supabase supports it; needs a screen in the app).
- Signed over-the-air updates (`expo-updates`) so fixes reach phones without reinstalling.
- hCaptcha on sign-up to stop bots.
- Automatic deletion of raw GPS points older than N months.
