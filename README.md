# Work Better

Work Better pairs a phone and Android TV to track habits, one-time tasks, streaks, and XP on a shared calendar. This repository includes the React web app, Express API, Turso schema, native Android TV launcher, and GitHub Releases updater.

## Deploy the web app to Vercel

1. Import this repository into Vercel. Use the repository root, the **Vite** preset, and Node.js 22 or newer. The build command and output directory are set in `vercel.json`.
2. In the project's environment variables, add **TURSO_DATABASE_URL** and **TURSO_AUTH_TOKEN** for Production. Use the database that already holds your boards. These are server variables and must never have a `VITE_` prefix. Use a separate test database if enabling Preview deployments.
3. Deploy, then open `/api/health` on the HTTPS app URL. A healthy response is `{"ok":true}`.
4. Open the hosted URL on your phone and set the same HTTPS origin as the Android TV app's server address. For a browser-based TV display, add `/?view=tv` to the URL. The TV and phone sync through Turso, with a refresh about every three seconds while visible.

Leave `PUBLIC_URL` unset on Vercel unless you need a specific canonical HTTPS origin. If you previously ran the app on Wi-Fi, open the old, paired board there and choose **Connect device**. Enter that code on the hosted site using **Connect with a code** to keep your existing calendar. Browser cookies are specific to each host.

## Local development

Use Node.js 22.12 or newer. In the repository root, run:

```sh
npm ci
npm run dev
```

Open the printed Wi-Fi address on your phone or TV, or open http://localhost:4317 on the server computer. Local development uses a SQLite database in `data/` by default. Copy `.env.example` to `.env` and set the Turso variables to use a remote database. Changing databases does not migrate records. For a local production build, run `npm run build`, then `npm start`. The local server uses server-sent events for immediate updates.

## Calendar and pairing

Daily habits repeat from their start date. One-time tasks appear on their scheduled date. A check-off earns 10 XP. Every 100 XP earns a level. Completing any task counts that day toward the board's streak, using the board creator's timezone. Undo reverses the check-off and XP. Archiving a task preserves its completion history.

Pairing codes expire after ten minutes and can be used once. Generating a new code replaces the previous one. A device can join an existing board or start a new one. Keep access to a paired device to generate future codes. Edits require an active connection.

## Android TV

Open `android/` in Android Studio, or use JDK 17+ and Android SDK 36 to run `./gradlew assembleDebug` from that directory. On Windows, use `gradlew.bat`. The APK is under `android/app/build/outputs/apk/debug/`. The app accepts the server address on first launch. Menu or Back opens address settings and manual update checks.

**Release status:** TV build 2 is a prerelease under review because Google Play Protect blocked installation in an Android emulator. The updater skips prereleases. See the [GitHub release record](https://github.com/eivinallen4-netizen/DAY-TRACKER/releases/tag/tv-build-2) and [TV feed notes](android/RELEASE-FEED.md).

Future approved builds can be published using `android/publish-tv.ps1 -Build <higher-number> -NotesFile <file>` with the original local signing identity. The updater verifies the APK digest, package, build, and signing certificate before requesting installation. Signing keys stay outside the repository.

## Verification

Run `npm test` for pairing, workspace isolation, check-offs, streaks, timezone handling, and live-update coverage. Run `npm run build` to build the web client. The API function uses secure cookies on Vercel. The in-process request limiter applies per function instance.

Design assets use TAAM's palette and wordmark. Montserrat's license is in [public/fonts/OFL.txt](public/fonts/OFL.txt).
