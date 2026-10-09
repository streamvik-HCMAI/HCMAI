# Firebase security setup

The clients must not decide who is an administrator. The website and iOS app now read the verified Firebase ID-token claim `admin`. Firestore and Storage enforce the same claim server-side.

## Deploy rules

On a trusted computer with Node.js and the Firebase CLI, run these commands from the repository root:

```powershell
npm install -g firebase-tools
firebase login
firebase use hcmai-v3e0h9
firebase deploy --only firestore:rules,storage
```

The Google account used by `firebase login` must have permission to administer the Firebase project. The deployment should report both `firestore.rules` and `storage.rules` as deployed.

## Grant administrator access

Admin access is a Firebase custom claim, not a separate login account. The production admin UID is `09JvBvWi5rebnT4honz5Q2N6Uoe2`. To grant the claim in development, the verified teacher account is UID `OX7ntJciyGdTROqASx4j1WTQevq2` (`swapnilthakre@gmail.com`). Run the guarded helper from the repository root in Google Cloud Shell or another trusted environment. It checks that the UID's email matches before changing claims and uses Application Default Credentials:

```bash
npm ci --prefix functions
gcloud auth application-default login
node tools/set-admin-claim.js hcmai-dev OX7ntJciyGdTROqASx4j1WTQevq2 swapnilthakre@gmail.com
```

The Google identity used for Application Default Credentials must have permission to manage Firebase Authentication users in the target project. Never commit a service-account JSON file, private key, password, or token. This workspace has no local `gcloud` or Application Default Credentials, so the grant must be run from Cloud Shell or another authorized environment.

After changing claims, the user must sign out and sign in again, or refresh the ID token. To remove access, set `{ admin: false }` or revoke the user session from the trusted Admin SDK environment.

The rules allow published raags to be read publicly, require authentication for protected topics and audio, and restrict all raag/topic writes and audio uploads to users with the verified `admin` claim. Raw imported records in `raagSourceRecords` and composition datasets in `compositionDatasets` (including their `records` subcollections) are readable and writable only by admins; they are never public through Firestore rules.

## Environment-aware website

The website selects Firebase by hostname:

- `localhost`, `127.0.0.1`, `.local`, and `hcmai-dev.web.app` use `hcmai-dev`.
- Other hosts use production project `hcmai-v3e0h9`.

Production Google sign-in uses `hcm.streamvik.com` as its authentication domain.
Keep this domain in Firebase Authentication's authorized domains and
`https://hcm.streamvik.com/__/auth/handler` in the production Google OAuth web
client's authorized redirect URIs. Keep existing Firebase redirect URIs as well.
Development continues to use `hcmai-dev.firebaseapp.com`.

The commands below deploy hosting and access rules only. They leave Moodle
Cloud Functions unchanged; deploying those functions requires their Secret
Manager configuration first.

Deploy development rules and hosting with:

```powershell
firebase deploy --project dev --only firestore:rules,storage,hosting
```

Deploy production only after reviewing the production pull request:

```powershell
firebase deploy --project prod --only firestore:rules,storage,hosting
```