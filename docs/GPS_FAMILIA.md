# Ubicación en familia (family location sharing)

Screen: **Iglesia → Comunidad → Ubicación en familia** (`/familia-ubicacion`). Feature key `ubicacion_familia`
(each church can switch it off in Ajustes → Funciones). Database: `supabase/migrations/0082_ubicacion_familia.sql`.

It works like a Life360 circle, with one rule above all: **each person decides for themselves**.
It is OFF for everyone until that person turns it on, on their own phone.

## What is stored

| Data | Where | How long |
|---|---|---|
| Whether I share, with family / pastors, pause time | `loc_shares` (one row per account) | Until I change it or delete my account |
| My **latest** position: latitude, longitude, accuracy, speed, heading, battery %, moving or not, time | `loc_shares` | Replaced by each new position. Erased when I turn sharing off. Erased by the hourly clean-up if no news for 30 days |
| A **short trail** (time + position, rounded to about 1 m) | `loc_shares.trail` | Last 24 hours, 288 points at most. Trimmed on every write and by the hourly clean-up. Erased when I turn sharing off |
| Who can see me (explicit list, with how each one got in: family, pastor, picked by name) | `loc_viewers` | Until I remove them |
| My places (name, point, radius) and which ones I am inside now | `loc_places`, `loc_shares.inside` | Until I remove them |
| Notices ("X llegó a Iglesia", "X pide ayuda", "X comparte su ubicación con vos") | the app's normal `notifications` table | Same as every other notice in the app |

While sharing is **paused**, the phone's positions are thrown away by the server (nothing is stored).
Nothing is sent to any outside company. Children without an account are contact cards, not accounts: they are never tracked.

## Who can read it

* Only the people on **my own list**, only while sharing is on and not paused, only inside my church, and only while their account is active.
* "Mi familia" and "Los pastores" copy the people who are family / pastors **at that moment** into my list.
  If later someone adds a person to my family, or a new pastor is named, that person does **not** see me until I add them
  (the screen offers a "Sumar" button). Anyone I remove by hand stays removed.
* The pastor, the secretary and app administrators have **no** way to read a position or to turn sharing on for someone else:
  the three tables have row-level security on, no policies and no grants, so the app cannot read or write them directly.
  Everything goes through database functions that only act on the signed-in person (`auth.uid()`): `loc_set`, `loc_viewer_add`,
  `loc_viewer_remove`, `loc_pause`, `loc_push`, `loc_help`, `loc_place_save`. Reading goes through `loc_visible` / `loc_trail`,
  which use one single rule (`loc_can_see`).
* Honest limit: whoever has the Supabase project owner login (the database console) can read any table, as with all the app's data.

## Background or only while open

The phone permission text in the builds installed today (iOS build 10, Android build 17) says background location is only for
evangelism outings and bus trips. Using it for something else in those builds could get the app rejected. So:

* `BG_MIN_BUILD` in `src/lib/famLoc.ts` = iOS **11**, Android **18**. Only a store build with that number or higher shares with the app closed.
* Older builds and the web share **only while the app is open**, and the screen says so in plain words.
* `app.json` permission texts were updated (text only) to describe family sharing. They take effect in the **next store build**.
  If the next build numbers are not 11 / 18, change `BG_MIN_BUILD`.
* Battery: balanced accuracy, a new point about every 100 m or every 3 minutes, delivered in batches; when the person is still the phone sends about one point every 5 minutes.
* While sharing, the home screen always shows a pill ("Compartís tu ubicación con N personas"), and Android shows its permanent notification.

## Before sending the next build to the stores

### Google Play — "Location permissions" declaration (Play Console → App content → Sensitive permissions)

Core purpose / why background location is needed (paste, adjust if you wish):

> La Mies is a church app. It uses background location for three features, each one started by the user:
> (1) Family location sharing: a member can choose to share their location with their own family and with specific people they pick,
> so they can see each other on a map and get "arrived / left" notices for saved places, even when the app is closed (the feature's whole
> purpose is to keep working when the phone is in a pocket). It is off by default, the member picks exactly who can see them, can pause
> or stop at any time, and a persistent notification and an in-app indicator are shown while it is on.
> (2) Evangelism outings: recording the streets walked during an outing the user started, with the screen off.
> (3) Church bus: the driver shares the bus position with the riders of that route during a trip the driver started.
> Location is never used for advertising and is never shared with third parties.

Google also asks for (as far as I know — check the form when you fill it in):

* A **short video** (about 30 seconds) showing the feature: open Ubicación en familia, tap "Compartir mi ubicación",
  the in-app explanation that appears **before** the system permission prompt, the system prompt, and the map working.
* The in-app explanation (prominent disclosure). It is already in the app and reads:
  "La Mies recopila la ubicación de este teléfono para que las personas que vos elegiste vean dónde estás en el mapa, incluso con la app cerrada o la pantalla apagada. Podés pausarlo o apagarlo cuando quieras."
* The **privacy policy** must mention it. Suggested paragraph:
  "If you turn on family location sharing, La Mies collects your phone's location, also in the background, and shows it only to the people
  you choose. We keep only your latest position and the last 24 hours of movement. You can pause or stop at any time; stopping erases your position."
* Data safety form: Location → Precise location → Collected, not shared with third parties, optional, purpose "App functionality".

### Apple — App Review note (App Store Connect → App Review Information → Notes)

> Background location ("Always") is used only for features the user starts themselves:
> 1) Family location sharing (Iglesia → Comunidad → Ubicación en familia). It is off by default. The user taps "Compartir mi ubicación",
> chooses who can see them (their family, people picked by name, optionally the pastors) and can pause or stop at any time. Only those
> people can see the position. An indicator is shown on the home screen while sharing is on.
> 2) Evangelism outings and 3) the church bus, as in previous versions.
> To test: sign in with the demo account, open Iglesia → Ubicación en familia, tap "Compartir mi ubicación" and allow location.
> A second demo account in the same family sees the first one on the map.

(You will need two demo accounts in the same family for the reviewer. They do not exist yet.)

## Not tested

Built and checked with type-check, unit tests, web and Android bundling, and a rolled-back database test of the privacy rules.
**Not** tested on real phones: background delivery, running together with an outing or the bus at the same moment, battery use,
what happens after the phone restarts, and how the map markers look. Treat the first week as a trial with a few families.
