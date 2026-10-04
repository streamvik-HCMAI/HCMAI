# Google Classroom course and lesson sync

The website directory and material access are controlled by exact Classroom topic names:

- Add the course topic `HCMAI: Enrollment Open` to show that course in the directory and accept enrollment requests.
- Add the material topic `HCMAI: Public` only to materials anyone on the website may view.
- Other published course materials require a matching Classroom roster membership before the website returns them.

Students request enrollment on HCMAI. The teacher then adds the student to the Classroom course. The hourly roster sync grants website access after the Classroom API reports that membership. Embedded Drive/YouTube resources retain their own Google sharing rules.

## One-time Google Cloud setup

The Classroom API is enabled for `hcmai-dev`, and the project uses the Blaze plan for scheduled Functions. Configure an OAuth client in the same Google Cloud project:

1. Open **APIs & Services > OAuth consent screen**. Configure the audience and add `swapnilthakre@gmail.com` as a test user while testing. Request these read-only scopes:
   - `https://www.googleapis.com/auth/classroom.courses.readonly`
   - `https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly`
   - `https://www.googleapis.com/auth/classroom.coursework.students.readonly`
   - `https://www.googleapis.com/auth/classroom.topics.readonly`
   - `https://www.googleapis.com/auth/classroom.rosters.readonly`
   - `https://www.googleapis.com/auth/classroom.profile.emails` (used only to match roster emails to verified Firebase accounts)
2. Under **APIs & Services > Credentials**, create an OAuth client ID for a Web application. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
3. In OAuth Playground settings, enable **Use your own OAuth credentials** and **Access type: Offline**. Use the client ID and secret. Authorize the scopes above and exchange the code for tokens. Copy the refresh token directly into the Firebase CLI prompt; never put tokens or client secrets in source files, chat, or shell command arguments.
4. From the repository root, set the three Function secrets. Firebase CLI prompts for each value; paste it directly into the terminal:

```powershell
firebase functions:secrets:set CLASSROOM_OAUTH_CLIENT_ID --project dev
firebase functions:secrets:set CLASSROOM_OAUTH_CLIENT_SECRET --project dev
firebase functions:secrets:set CLASSROOM_OAUTH_REFRESH_TOKEN --project dev
```

Google OAuth apps in External/Testing mode can issue refresh tokens that expire after seven days for these scopes. For durable hourly sync, publish and complete Google's app verification requirements. Until then, the refresh-token secret must be replaced when it expires.

## Deploy and use

After setting the secrets, deploy the rules, Hosting page, and scheduled Function:

```powershell
firebase deploy --project dev --only firestore:rules,functions,hosting
```

Sign in to HCMAI with `swapnilthakre@gmail.com`, open **Lessons**, connect Classroom, confirm the topic visibility policy, and sync once. That writes the hourly-sync preference. The verified teacher email can manage the course catalog and requests but does not receive the broad site `admin` claim.
