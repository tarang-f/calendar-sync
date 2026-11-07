#!/usr/bin/env bash
# Phase 0 cloud setup. Idempotent: safe to re-run.
# Usage: PROJECT_ID=my-proj [REGION=us-central1] [FIRESTORE_LOCATION=nam5] ./scripts/setup-gcp.sh
# Prereqs: gcloud logged in as a project Owner; Firebase project created and on the Blaze plan.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"   # PERMANENT once created
KEYRING="calendar-sync"
KEY="oauth-tokens"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "==> Enabling APIs"
gcloud services enable \
  calendar-json.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com \
  cloudscheduler.googleapis.com cloudtasks.googleapis.com \
  firestore.googleapis.com cloudkms.googleapis.com secretmanager.googleapis.com \
  firebaseapphosting.googleapis.com iamcredentials.googleapis.com

echo "==> Firestore (${FIRESTORE_LOCATION})"
gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 \
  || gcloud firestore databases create --database='(default)' --location="$FIRESTORE_LOCATION" --type=firestore-native

echo "==> KMS key for refresh-token encryption"
gcloud kms keyrings describe "$KEYRING" --location="$REGION" >/dev/null 2>&1 \
  || gcloud kms keyrings create "$KEYRING" --location="$REGION"
gcloud kms keys describe "$KEY" --keyring="$KEYRING" --location="$REGION" >/dev/null 2>&1 \
  || gcloud kms keys create "$KEY" --keyring="$KEYRING" --location="$REGION" \
       --purpose=encryption --rotation-period=90d \
       --next-rotation-time="$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+90d +%Y-%m-%dT%H:%M:%SZ)"
gcloud kms keys add-iam-policy-binding "$KEY" --keyring="$KEYRING" --location="$REGION" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter >/dev/null

echo "==> Secret Manager placeholders (values added manually, see docs/SETUP.md)"
for s in google-oauth-client-id google-oauth-client-secret microsoft-oauth-client-id microsoft-oauth-client-secret; do
  gcloud secrets describe "$s" >/dev/null 2>&1 || gcloud secrets create "$s" --replication-policy=automatic
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor >/dev/null
done

echo "==> Done."
echo "KMS key: projects/${PROJECT_ID}/locations/${REGION}/keyRings/${KEYRING}/cryptoKeys/${KEY}"
