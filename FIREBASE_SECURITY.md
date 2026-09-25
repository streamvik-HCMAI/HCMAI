# Firebase security setup

The clients must not decide who is an administrator. The website and iOS app now read the verified Firebase ID-token claim `admin`. Firestore and Storage enforce the same claim server-side.

## Deploy rules

This computer currently does not have Node.js or the Firebase CLI installed. On a computer with Node.js installed, run these commands from the repository root:

```powershell
npm install -g firebase-tools
firebase login
firebase use hcmai-v3e0h9
firebase deploy --only firestore:rules,storage
```

The Google account used by `firebase login` must have permission to administer the Firebase project. The deployment should report both `firestore.rules` and `storage.rules` as deployed.

## Grant administrator access

The intended admin Firebase UID is `09JvBvWi5rebnT4honz5Q2N6Uoe2`. Run the one-time script in `tools/set-admin-claim.js` from a trusted machine. It uses Application Default Credentials and does not require a service-account file in this repository:

```js
npm install firebase-admin
gcloud auth application-default login
node tools/set-admin-claim.js
```

The Google identity used for Application Default Credentials must have permission to manage Firebase Authentication users in project `hcmai-v3e0h9`. Never commit a service-account JSON file, private key, password, or token.

After changing claims, the user must sign out and sign in again, or refresh the ID token. To remove access, set `{ admin: false }` or revoke the user session from the trusted Admin SDK environment.

The rules allow published raags to be read publicly, require authentication for protected topics and audio, and restrict all raag/topic writes and audio uploads to users with the verified `admin` claim.

## Environment-aware website

The website selects Firebase by hostname:

- `localhost`, `127.0.0.1`, `.local`, and `hcmai-dev.web.app` use `hcmai-dev`.
- Other hosts use production project `hcmai-v3e0h9`.

Deploy development rules and hosting with:

```powershell
firebase deploy --project dev --only firestore:rules,storage,hosting
```

Deploy production only after reviewing the production pull request:

```powershell
firebase deploy --project prod --only firestore:rules,storage,hosting
```