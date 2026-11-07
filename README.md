# Calendar Sync

Keeps multiple calendars in sync in a hub-and-spoke layout. The hub calendar gets every event in full detail. Each spoke receives events at the level set by the rule on its edge. Google Calendar and Microsoft 365 / Outlook.com are supported.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- One-time cloud setup: [docs/SETUP.md](docs/SETUP.md)

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js app (Firebase App Hosting) |
| `functions` | Cloud Functions, 2nd gen (TypeScript) |
| `firestore.rules` | Firestore security rules (deny-all in Phase 0) |
| `scripts/setup-gcp.sh` | Idempotent script that creates the GCP resources |
| `.github/workflows` | CI, plus a manual functions deploy |

## Quick start

```bash
npm run install:all
npm run emulators   # local Firebase emulators (UI at :4000)
npm run dev:web     # http://localhost:3000
npm test            # functions unit tests
```

Requires Node 22 (`.nvmrc`). The Firestore emulator also needs Java 21+.
