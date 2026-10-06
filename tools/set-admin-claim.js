const { createRequire } = require('module');
const requireFunctions = createRequire(require.resolve('../functions/package.json'));
const { initializeApp, applicationDefault } = requireFunctions('firebase-admin/app');
const { getAuth } = requireFunctions('firebase-admin/auth');

const [, , projectId, adminUserUid, expectedEmail] = process.argv;

if (!projectId || !adminUserUid || !expectedEmail) {
  console.error('Usage: node tools/set-admin-claim.js <project-id> <firebase-uid> <expected-email>');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId
});

async function grantAdminClaim() {
  const user = await getAuth().getUser(adminUserUid);
  if (user.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(`UID email mismatch: expected ${expectedEmail}, found ${user.email || 'no email'}.`);
  }

  await getAuth().setCustomUserClaims(adminUserUid, {
    ...user.customClaims,
    admin: true
  });
  console.log(`Admin claim granted to ${adminUserUid}.`);
  console.log('Sign out and sign back in to refresh the Firebase ID token.');
}

grantAdminClaim().catch((error) => {
  console.error('Unable to grant admin claim:', error.message);
  process.exitCode = 1;
});