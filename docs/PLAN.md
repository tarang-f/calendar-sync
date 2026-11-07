# Calendar Sync — High-Level Plan

**Version:** v4 · **Date:** 2026-11-07 · **Status:** Draft

## 1. Summary

A web app that keeps several calendars in sync in a hub-and-spoke layout. The **hub** (master) calendar receives full details of every event. Each **spoke** is connected to the hub by an **edge**. The user assigns each edge a **rule** that controls how much detail flows from the hub to that spoke. Google Calendar and Microsoft 365 / Outlook.com are supported first.

## 2. Decisions (from interview)

| Topic | Decision |
|---|---|
| Sync direction | Bidirectional. Spoke events flow into the hub, then out to the other spokes. |
| Inbound to hub | Always full detail. Rules apply only to outbound edges. |
| Rule model | Preset levels: Busy only, Title only, Title + location, Full details. |
| Edits to copies | All copies, including hub copies of spoke events, are read-only. The app restores any changed or deleted copy on the next sync. |
| Latency | Polling every 10 min, one global interval for the MVP. |
| Providers | Google Calendar API and Microsoft Graph (M365 + Outlook.com). No on-prem EWS. |
| Audience | Multi-tenant design, private beta first, public SaaS later. |
| Hub provider | Google or Microsoft, chosen at sign-in. |
| Topology | One hub per user. Each spoke account can have many calendars, and each calendar is one edge. |
| Sync window | Rolling: 7 days back to 90 days ahead. Recurring events are expanded into instances. |
| Attendees | Never invited on copies. Names go in the description only at Full details. |
| Rule / edge changes | Existing copies are left as-is. Changes apply only to future syncs. |
| Stack | Firebase: Next.js on App Hosting, Cloud Functions (2nd gen, TypeScript), Firestore, Cloud KMS. |
| MVP | Core sync only, with a basic sync log. |

## 3. Architecture

```
            ┌──────────────────────────── Firebase / GCP ─────────────────────────────┐
 Browser ──▶│ App Hosting (Next.js UI + OAuth cb)  ──▶  Cloud Functions (API)         │
            │                                     │                                   │
            │  Cloud Scheduler ─▶ onSchedule "poller" (every 10 min)                  │
            │                                     │ enqueue 1 task per user           │
            │                                     ▼                                   │
            │                         Task Queue fn "syncUser"  ──▶ Google Calendar API│
            │                                     │              ──▶ Microsoft Graph   │
            │                                     ▼                                   │
            │                 Firestore (config, links, cursors, log)                 │
            │                 Cloud KMS (encrypt refresh tokens)                      │
            └─────────────────────────────────────────────────────────────────────────┘
```

- **One task per user.** The poller enqueues one task per user. Running each user's sync on its own avoids races between the hub and spoke passes for the same user.
- **Task Queue settings.** Retries use backoff, and a concurrency cap keeps the app under provider rate limits.
- **Daily window job.** Moves the rolling window forward, creating copies for events that have just entered it and leaving copies that have passed out of it alone.

## 4. Authentication

| Flow | How it works |
|---|---|
| App sign-in = hub connect | A server-side OAuth code flow (Google or Microsoft) requests calendar scopes and offline access. The callback (a Next.js route on App Hosting at `/api/auth/callback/{google|microsoft}`) stores the refresh token encrypted with KMS, then mints a **Firebase custom token** so the user is signed in. One step for the user. |
| Connect a spoke | The same OAuth flow, linked to the signed-in user. Afterwards the user picks which calendars on that account become spokes. |
| Google scopes | `openid email`, `calendar.events`, `calendar.calendarlist.readonly` |
| Microsoft scopes | `openid email offline_access User.Read Calendars.ReadWrite` |
| Token handling | Refresh tokens are encrypted with KMS and never sent to the client. On `invalid_grant` or a revoked token, the account is marked *needs re-auth* and its edges are paused. |

The hub can be either a Google or a Microsoft account.

## 5. Rules (preset levels)

| Level | Title | Time / all-day | Free/busy | Location | Description | Video link | Attendee names |
|---|---|---|---|---|---|---|---|
| Busy only | "Busy" | ✓ | ✓ | – | – | – | – |
| Title only | ✓ | ✓ | ✓ | – | – | – | – |
| Title + location | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Full details | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (in description) | ✓ (in description) |

- **Copy properties.** Every copy is set to private visibility, has no attendees and no reminders, and is tagged as a copy.
- **What a rule is.** A user-named object (e.g. "Work → Personal") that wraps one level, so one rule can be reused on many edges.

## 6. Sync engine

### Tagging and loop prevention
- **Tag every copy.** Each copy carries a hidden marker: `extendedProperties.private` on Google, a single-value extended property on Graph. The marker holds `csyncLinkId` and `csyncRole=copy`.
- **Skip copies as sources.** Events with the marker are never treated as originals, which prevents sync loops.

### Change detection
- **Google:** `events.list` with `singleEvents=true` and a stored `syncToken`. Events outside the window are dropped locally, because `syncToken` can't be combined with `timeMin`/`timeMax`. A `410 Gone` response means a full resync.
- **Microsoft:** `calendarView/delta` for the window, with a stored `deltaLink`.
- **Avoid needless writes:** each target keeps a `contentHash` of the projected fields, and a write happens only when that hash changes.

### Algorithm (per user, per run)
1. **Pull changes** from each calendar (hub and spokes) since its cursor.
2. **Handle copies** (events carrying our marker): if one was changed or deleted, restore it from its link (read-only rule).
3. **Spoke originals:** upsert a full-detail copy on the hub, then fan out to every *other* spoke edge using that edge's rule. The origin spoke is skipped.
4. **Hub originals:** fan out to every spoke edge using that edge's rule.
5. **Original deleted:** delete all of its copies.
6. **Save** the new cursors and write a sync-log entry.

### Edge cases
- **Recurring events:** expanded into single instances inside the window, and each instance is synced as its own event. Exceptions come through naturally.
- **All-day events and time zones:** copied as-is, using provider-native date and timeZone fields.
- **Declined events:** an event the user declined on the source is not propagated.
- **Rule change, or edge or spoke removed:** existing copies stay untouched (per decision). An edge or spoke that has been removed leaves orphan copies that the app no longer manages.

## 7. Data model (Firestore)

```
users/{uid}
  hubCalendarId, windowPastDays=7, windowFutureDays=90, createdAt
  accounts/{accountId}      provider, email, encRefreshToken, status(active|needs_reauth)
  calendars/{calendarId}    accountId, providerCalendarId, name, role(hub|spoke),
                            cursor(syncToken|deltaLink), lastPolledAt, status
  rules/{ruleId}            name, level(busy|title|title_location|full)
  edges/{edgeId}            spokeCalendarId, ruleId, enabled, createdAt
  links/{linkId}            origin{calendarId, eventId}, hubCopy{eventId, hash}?,
                            copies{ [calendarId]: {eventId, hash} }, updatedAt
  syncLog/{logId}           runAt, calendarId, created, updated, deleted, restored,
                            errors[], expiresAt (TTL 30 days)
```

- **Security rules:** the client can read and write only its own config (`rules`, `edges`, calendar selection). Accounts, tokens, links and cursors are written by the server only.

## 8. MVP screens

- **Sign in:** Google or Microsoft (this connects the hub).
- **Accounts:** connect or reconnect spoke accounts, and see each account's status.
- **Calendars:** pick the hub calendar, and choose which calendars from each account are spokes.
- **Rules:** create, rename and delete rules, and choose each rule's level.
- **Edges:** assign a rule to each spoke, or turn the spoke off.
- **Sync log:** recent runs with counts and errors.

## 9. Delivery phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0. Setup | Firebase project (Blaze plan), GCP OAuth client, Azure app registration, KMS key ring, repo + CI, emulators. Code done; console steps in [SETUP.md](SETUP.md) | Deploys a hello-world app and function |
| 1. Auth & accounts | OAuth code flows, custom-token sign-in, encrypted token storage, adding spoke accounts | User can sign in and connect a spoke on each provider |
| 2. Config UI | Calendars, rules, edges screens + Firestore security rules | User can set up a full hub-and-spoke config |
| 3. Hub → spokes | Provider adapters (a single interface over both APIs), projection by level, links, poller + task queue | Hub events appear on spokes at the correct level |
| 4. Spokes → hub → spokes | Inbound mirroring, fan-out that skips the origin, copy restore, delete propagation | Full bidirectional sync with no loops |
| 5. Hardening & beta | Rate limiting and backoff, re-auth handling, daily window job, sync log UI, monitoring and alerts | Private beta with a small group of users |
| 6. Real-time sync (post-MVP) | Webhooks per §12; polling becomes a backup | Changes show up in under a minute |
| Later | Dashboard and "sync now", Stripe billing, Google/Microsoft app verification | Public SaaS launch |

## 10. Risks

| Risk | Mitigation |
|---|---|
| In Google OAuth **testing** mode, refresh tokens expire after 7 days | For the beta, publish the OAuth app as "In production" even while unverified (up to 100 users, with a warning screen). Complete verification before the public launch. |
| Provider rate limits | Run each user's sync one at a time, limit queue concurrency, use exponential backoff, and skip writes when the hash is unchanged. |
| Duplicate copies after a crash part-way through a write | Write the link before creating the event, and use an idempotency key in the event's marker. |
| Recurring-event quirks between providers | Expand events into instances inside the window and never sync whole series. |
| Leaked tokens | Encrypt with KMS, access tokens only from server-side code, request minimal scopes, write an audit log. |
| Polling cost as the user count grows | Move to webhooks in Phase 6 (§12). Poll less often for idle calendars. |

## 11. Confirmed assumptions

- **Hub provider:** the hub can be Google or Microsoft, chosen at sign-in.
- **Poll interval:** a single global 10-minute interval for the MVP.
- **Copies on the hub:** copies of spoke events on the hub are read-only, so edits are made on the origin spoke.
- **Removing an edge or spoke:** existing copies become orphans that the app no longer updates or deletes. The user cleans them up by hand.

## 12. Future: real-time sync with webhooks (Phase 6)

The engine stays the same: it still fetches changes with `syncToken` / `deltaLink`. Only the trigger changes, from a timer to a change notification.

| Area | MVP (polling) | Phase 6 (webhooks) |
|---|---|---|
| Trigger | `onSchedule` every 10 min | Google `events.watch` / Graph subscription notification |
| Unit of work | One task per user | One task per changed calendar, with a per-user lock |
| Latency | 5–15 min | Seconds to about 1 min |
| Endpoints | None | `onRequest` `/webhooks/google` and `/webhooks/graph` |
| Polling | Main mechanism | Backup every ~6 h |
| Data | — | New `users/{uid}/subscriptions/{id}`: calendarId, provider, channelId/subscriptionId, resourceId, expiresAt, secret |

New pieces:
- **Endpoints:** check the `X-Goog-Channel-Token` header (Google) or `clientState` (Graph), echo Graph's `validationToken`, reply with 2xx quickly, and enqueue the sync job.
- **Subscription lifecycle:** subscribe when a calendar is connected and unsubscribe when it is removed. A daily job renews subscriptions before expiry: Graph is extended with PATCH (max ~7 days); Google channels are replaced with new ones and the old channel stopped.
- **Graph lifecycle events:** handle `missed`, `reauthorizationRequired` and `subscriptionRemoved`.
- **Debounce:** delay each calendar's task by 5–10 s and use a named task to drop duplicates.
- **Per-user lock:** a lease in Firestore, so the hub and spoke passes never run at the same time.
- **Echo of our own writes:** copy writes trigger notifications that come back to us. The copy tags and `contentHash` turn these into no-ops.
- **Hosting:** a stable HTTPS URL (custom domain recommended), with `minInstances=1` on the webhook functions to avoid cold starts.

Estimated effort: about 1–2 weeks once Phase 4 is stable.
