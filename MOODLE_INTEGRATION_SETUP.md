# Moodle Lessons integration

Moodle is the source of truth for course content, enrollment, progress, and media. HCMAI lists only visible courses from one configured Moodle category; selecting a card opens the Moodle course. Course files and private enrollment data are not copied to Firebase.

The Lessons catalog accepts a Moodle base URL, so it can link to a Moodle path such as `/learn` on the same hostname. That requires a Moodle web server behind a Firebase Hosting rewrite to Cloud Run, plus a Moodle database and persistent file storage. This is more operationally involved than using a Moodle host at a dedicated `learn` host name; neither option is configured by this code change.

## Moodle setup

1. Create the Moodle site and a course category for courses that should appear in HCMAI. Courses in that category and its subcategories will be listed if visible to students.
2. In **Site administration > Server > Web services**, enable web services and the REST protocol.
3. Create an external service named `HCMAI public catalog` with only these functions:
   - `core_course_get_courses`
   - `core_course_get_categories`
4. Create a dedicated service user with read-only access to that category, enable the service for the user, and create a token. Do not use a site administrator token if a restricted service role is available.
5. Configure Moodle Google OAuth2 authentication if students should use the same Google account. Firebase Google sign-in does not automatically create a Moodle session; students may need to sign in to Moodle the first time they open a course.

Keep full course content, enrollment, and media in Moodle. A course card opens Moodle rather than embedding the whole LMS in an iframe. Moodle's own access checks then protect restricted courses and files.

## Firebase development setup

Set the Moodle URL, service token, and public category ID as Firebase Function secrets. Firebase CLI prompts for each value; enter the token directly at the terminal prompt, never in chat, source files, or command arguments:

```powershell
firebase functions:secrets:set MOODLE_BASE_URL --project dev
firebase functions:secrets:set MOODLE_WEB_SERVICE_TOKEN --project dev
firebase functions:secrets:set MOODLE_PUBLIC_CATEGORY_ID --project dev
```

Then deploy the scheduled catalog sync and its manual teacher action:

```powershell
firebase deploy --project dev --only functions
```

The sync runs hourly. A teacher-only **Sync now** button is also available on Lessons. The Firebase function verifies the teacher email, calls Moodle using the server-side token, filters to visible courses in the configured category, and writes only public catalog metadata to Firestore.

## Student experience

Students browse the published Moodle catalog on HCMAI and open a course in Moodle. Moodle handles self-enrolment or teacher approval, lesson access, completion tracking, and video playback. If Moodle later supports a configured SSO connection, the same Google identity can be used there; the Firebase session alone does not provide Moodle SSO.
