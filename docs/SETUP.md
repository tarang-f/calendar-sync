# Phase 0 Setup Guide

**Version:** v2 · **Date:** 2026-11-07

The code is already in the repo. These are the one-time steps you do in the Google, Firebase and Microsoft consoles. Run the shell commands in **Google Cloud Shell**, or on any machine with `gcloud` and Node 22 installed.

## Checklist

| # | Step | Where | Done |
|---|---|---|---|
| 1 | Create the Firebase project and upgrade it to Blaze | Firebase console | ☐ |
| 2 | Run `scripts/setup-gcp.sh` | Cloud Shell | ☐ |
| 3 | Set up the Google OAuth consent screen and client | Google Cloud console | ☐ |
| 4 | Register the Microsoft Entra app | Entra admin center | ☐ |
| 5 | Store the OAuth client IDs and secrets | Cloud Shell | ☐ |
| 6 | Create the App Hosting backend (web) | Firebase console | ☐ |
| 7 | Deploy functions and Firestore rules | Cloud Shell / local | ☐ |
| 8 | (Optional) Set up the CI deploy identity | Cloud Shell + GitHub | ☐ |

---

## 1. Firebase project

1. Go to https://console.firebase.google.com and click **Add project**. Write down the project ID.
2. Click **Upgrade** to switch to the **Blaze** plan. Scheduled functions, task queues and outbound API calls all need it.
3. In Google Cloud Billing, under **Budgets & alerts**, add a small budget (for example $10/month) with email alerts.

## 2. Cloud resources

```bash
git clone https://github.com/tarang-f/calendar-sync && cd calendar-sync
PROJECT_ID=<your-project-id> REGION=us-central1 FIRESTORE_LOCATION=nam5 ./scripts/setup-gcp.sh
```

The script:
- **APIs:** turns on the Calendar, Functions, Run, Build, Scheduler, Tasks, Firestore, KMS, Secret Manager and App Hosting APIs.
- **Firestore:** creates the database in native mode. **Its location can never be changed.** Use `nam5` (US) or `eur3` (EU).
- **KMS:** creates the key `calendar-sync/oauth-tokens`, which encrypts refresh tokens, and gives the functions' runtime account permission to use it.
- **Secrets:** creates four empty secrets in Secret Manager. You fill them in during step 5.

If you change `REGION`, also update `functions/src/config.ts`.

## 3. Google OAuth

In the Google Cloud console, open **APIs & Services → OAuth consent screen** (Google Auth Platform):

1. **Audience:** choose **External**.
2. **Branding:** enter the app name, support email and developer contact.
3. **Data access:** add these scopes:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/calendar.events`
   - `.../auth/calendar.calendarlist.readonly`
4. **Publishing status:** click **Publish app**, which moves it to **In production**.
   - ⚠️ Don't leave it in **Testing**. In testing mode, refresh tokens expire after 7 days.
   - An unverified app shows users a warning screen and is limited to 100 users. That's fine for the private beta.
5. Go to **Clients → Create client → Web application**.
   - **Authorised redirect URIs:**
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<app-hosting-domain>/api/auth/callback/google`. You'll know this domain after step 6.
   - Copy the **Client ID** and **Client secret**.

## 4. Microsoft Entra app

At https://entra.microsoft.com, go to **App registrations → New registration**:

1. **Supported account types:** choose *Accounts in any organizational directory and personal Microsoft accounts*.
2. **Redirect URI (Web):**
   - `http://localhost:3000/api/auth/callback/microsoft`
   - Add `https://<app-hosting-domain>/api/auth/callback/microsoft` after step 6.
3. **Certificates & secrets → New client secret:** choose 24 months and set a reminder to rotate it. Copy the secret's **Value**.
4. **API permissions → Microsoft Graph → Delegated:** add `openid`, `email`, `offline_access`, `User.Read` and `Calendars.ReadWrite`.
5. Copy the **Application (client) ID** from the Overview page.

## 5. Store the OAuth credentials

```bash
printf '%s' '<google-client-id>'        | gcloud secrets versions add google-oauth-client-id --data-file=-
printf '%s' '<google-client-secret>'    | gcloud secrets versions add google-oauth-client-secret --data-file=-
printf '%s' '<microsoft-client-id>'     | gcloud secrets versions add microsoft-oauth-client-id --data-file=-
printf '%s' '<microsoft-client-secret>' | gcloud secrets versions add microsoft-oauth-client-secret --data-file=-
```

Never commit these values. For local development, put them in `apps/web/.env.local`, which git ignores.

## 6. App Hosting backend (web)

In the Firebase console, go to **Build → App Hosting → Get started**:

1. Connect GitHub and choose the repo `tarang-f/calendar-sync`.
2. **Root directory:** `apps/web`
3. **Live branch:** `main`. Every push to `main` deploys automatically.
4. **Region:** use the same region as the functions (for example `us-central1`).
5. Once the backend is created, add its `*.hosted.app` domain to the redirect URIs from steps 3 and 4.
6. Fill in the `REPLACE-…` values in `apps/web/apphosting.yaml`, then commit:
   - `APP_URL`: the backend's URL.
   - `FIREBASE_API_KEY`: in **Project settings → General → Web API key**. It's public, not a secret.
   - `KMS_KEY_NAME`: printed at the end of `setup-gcp.sh`.
7. Give the backend's service account access to what sign-in needs:

```bash
BACKEND=<backend-id>   # shown in the App Hosting console
npx firebase-tools@15.35.0 apphosting:secrets:grantaccess \
  google-oauth-client-id,google-oauth-client-secret,microsoft-oauth-client-id,microsoft-oauth-client-secret \
  --backend "$BACKEND" --project "$PROJECT_ID"

APPHOSTING_SA="firebase-app-hosting-compute@${PROJECT_ID}.iam.gserviceaccount.com"
# Encrypt and decrypt refresh tokens
gcloud kms keys add-iam-policy-binding oauth-tokens --keyring=calendar-sync --location=us-central1 \
  --member="serviceAccount:${APPHOSTING_SA}" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
# Sign Firebase custom tokens (used to create sign-in sessions)
gcloud iam service-accounts add-iam-policy-binding "$APPHOSTING_SA" \
  --member="serviceAccount:${APPHOSTING_SA}" --role=roles/iam.serviceAccountTokenCreator
```

To check it worked, open `https://<app-hosting-domain>/api/health`. It should return `{"status":"ok",...}`.

## 7. Deploy functions and Firestore rules

```bash
npx firebase-tools@15.35.0 login
npx firebase-tools@15.35.0 use --add <your-project-id>   # alias: prod
npm ci --prefix functions
npx firebase-tools@15.35.0 deploy --only functions,firestore --project prod
```

To check it worked, open `https://us-central1-<project-id>.cloudfunctions.net/health`. It should return `{"status":"ok",...}`.

## 8. (Optional) Deploy from CI

The workflow `.github/workflows/deploy-functions.yml` is started manually. It signs in to Google Cloud using GitHub's identity tokens (Workload Identity Federation), so it needs no stored keys.

```bash
SA=github-deployer@${PROJECT_ID}.iam.gserviceaccount.com
gcloud iam service-accounts create github-deployer
for r in roles/firebase.admin roles/cloudfunctions.admin roles/iam.serviceAccountUser \
         roles/run.admin roles/artifactregistry.admin roles/cloudscheduler.admin roles/cloudtasks.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$r" >/dev/null
done
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='tarang-f/calendar-sync'"
POOL=$(gcloud iam workload-identity-pools describe github --location=global --format='value(name)')
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL}/attribute.repository/tarang-f/calendar-sync"
echo "GCP_WIF_PROVIDER=${POOL}/providers/github"
```

In GitHub, go to **Settings → Environments → New environment `production`** and add three **variables**:
- `GCP_PROJECT_ID`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SA`

## Local development

```bash
npm run install:all
npm run emulators     # Auth, Firestore, Functions and Tasks emulators + UI at http://localhost:4000
npm run dev:web       # Next.js at http://localhost:3000
```

The emulators use the offline `demo-calendar-sync` project, so they don't need cloud credentials.

Sign-in works locally with no Google or Microsoft setup. `apps/web/.env.development` turns on a **mock OAuth provider**: click **Sign in with Google**, type any email, then click **Allow**. To use the real providers locally, copy `apps/web/.env.example` to `apps/web/.env.development.local` and fill in your client IDs.

| Command | What it checks |
|---|---|
| `npm test` | Unit tests (functions + web) |
| `npm run e2e` | Full sign-in → connect → disconnect → sign-out flow, run against the emulators |

## Phase 0 exit criteria

- ☐ `/api/health` on App Hosting returns `ok`
- ☐ The `health` Cloud Function returns `ok`
- ☐ CI passes on GitHub
- ☐ The OAuth clients exist and their secrets are stored
