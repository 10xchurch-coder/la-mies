# Putting La Mies on Google Play — step by step

You can skip the store entirely and share the `.apk` by WhatsApp (README, step 7). The store
is better when many members install it: updates arrive by themselves and nobody has to allow
"unknown apps".

## 1. Decide: personal or organization account

| | Personal (your name) | Organization (the church) |
| --- | --- | --- |
| Shows as developer | Your name | Iglesia Bautista Victoria |
| Extra paperwork | ID + phone verification | A **D-U-N-S number** for the church (free from Dun & Bradstreet, takes days or weeks) plus documents |
| Before going public | **Closed test with at least 12 testers opted in for 14 days in a row** (rule for personal accounts created after 13 Nov 2023) | No 12-tester rule |

For a church with members ready to help, **personal** is the faster path: 12 brothers install
the test version and keep it for two weeks. Organization is better only if the church already
has a legal entity (CUIT, asociación civil) and you want its name on the store.

## 2. Create the account (about 30 minutes, then 1–3 days of verification)
1. On the computer go to **play.google.com/console/signup** and sign in with the Google
   account the church will keep (not a personal one you might lose).
2. Choose **Yourself** (personal) or **An organization**.
3. Pay the one-time registration fee (US$25 at the time of writing; the page shows the amount).
4. Fill in your legal name and address **exactly** as on your DNI. Upload a photo of the DNI
   when asked. Verify the phone and email.
5. Google may ask you to install the **Play Console** app on an Android phone to verify a
   device. Do it on any Android phone you have.
6. Wait for the "identity verified" email.

## 3. Google Maps key (needed for the map on Android)
1. **console.cloud.google.com** → create a project "La Mies" (asks for a card; mobile maps
   are free).
2. **APIs & Services → Library → Maps SDK for Android → Enable.**
3. **Credentials → Create credentials → API key.** Copy it.
4. In `app.json`, paste it in `android.config.googleMaps.apiKey`.

## 4. Build the store version
On the Mac, in the project folder:

```bash
npx eas-cli@latest build --platform android --profile production
```

It takes 15–25 minutes in Expo's cloud. When it finishes, download the **.aab** file from the
link it prints (or from expo.dev → your project → Builds).

## 5. Create the app in Play Console
1. **Create app** → name **La Mies** → default language **Spanish (Latin America) – es-419**
   → **App** → **Free** → accept the declarations.
2. Left menu **Policy and programs → App content**. Fill every item:
   - **Privacy policy**: a public web page (for example on hopeforargentina.com) that says
     what the app collects (name, phone, location during outings, photos) and that it is only
     visible to the church. Required because of location.
   - **App access**: "Some functionality is restricted" → give a test email + password and
     the church code so the reviewer can enter.
   - **Ads**: No. **Content rating**: answer the questionnaire (no violence, etc.).
   - **Target audience**: 18 and over.
   - **Data safety**: collects location (precise, approximate), name, phone, photos; data is
     encrypted in transit; users can ask to delete it (by contacting the church).
   - **Location permissions** (background location): the form asks why the app needs
     location with the screen off and for a **short video** (30–60 s, uploaded to YouTube as
     unlisted) showing: open the app → Iniciar salida → lock the phone → walk → unlock → the
     street is marked. Text you can use: *"La Mies records the streets the church covers
     while evangelizing door to door. The user starts and stops each outing; location is only
     recorded during an active outing, also with the screen off, so the whole route is
     marked."*
   - **Foreground service** (location): same explanation and the same video.
3. **Store listing**: short description, full description, app icon 512×512, feature graphic
   1024×500, at least 2 phone screenshots (take them from your phone).

## 6. Closed test (the 12 testers × 14 days)
1. **Testing → Closed testing → Create track** (name "Iglesia").
2. **Testers**: create an email list with at least 12 members' Google (Gmail) addresses.
   Ask for 15–20 so that some dropping out doesn't restart the clock.
3. **Create new release** → upload the `.aab` → release name `0.2.0` → **Review release** →
   **Start rollout**. The first review takes from a few hours to a few days.
4. Copy the **opt-in link** and send it by WhatsApp. Each tester opens it **on the phone**,
   taps "Become a tester", then installs from the Play Store link.
5. They must stay opted in **14 days in a row**. Ask them to open the app a few times and
   use it (Google also looks at engagement).

## 7. Production
After 14 days, **Dashboard → Apply for production**. Answer the questions about the test
(how many testers, what you changed). Approval takes up to about a week. Then
**Production → Create new release** → choose the same build → roll out.

## 8. Updates later
- Screen and text changes: published over the air with `npx eas-cli@latest update` — phones
  get them the next time they open the app, no store review.
- Changes that need a new build (new permission, new native library): run the build again
  (the version number goes up by itself) and upload it as a new release. After the first
  manual upload, `npx eas-cli@latest submit --platform android` can upload it for you
  (it asks for a Google service-account key the first time).
