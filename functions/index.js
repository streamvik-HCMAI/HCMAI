const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const db = getFirestore();
const moodleBaseUrl = defineSecret('MOODLE_BASE_URL');
const moodleServiceToken = defineSecret('MOODLE_WEB_SERVICE_TOKEN');
const moodlePublicCategoryId = defineSecret('MOODLE_PUBLIC_CATEGORY_ID');
const teacherEmail = 'swapnilthakre@gmail.com';

async function callMoodle(functionName, baseUrl, serviceToken) {
  const endpoint = new URL('webservice/rest/server.php', `${baseUrl.replace(/\/+$/, '')}/`);
  const body = new URLSearchParams({
    wstoken: serviceToken,
    wsfunction: functionName,
    moodlewsrestformat: 'json'
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const result = await response.json();
  if (!response.ok || result.exception) {
    throw new Error(result.message || `Moodle ${functionName} failed with HTTP ${response.status}.`);
  }
  return result;
}

function belongsToCategory(categoryId, categories, publicCategoryId) {
  const byId = new Map(categories.map((category) => [String(category.id), category]));
  let currentId = String(categoryId);
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    if (currentId === publicCategoryId) return true;
    visited.add(currentId);
    currentId = String(byId.get(currentId)?.parent || '');
  }
  return false;
}

async function syncMoodlePublicCatalog() {
  const baseUrl = moodleBaseUrl.value().replace(/\/+$/, '');
  if (!baseUrl.startsWith('https://')) throw new Error('MOODLE_BASE_URL must use HTTPS.');
  const serviceToken = moodleServiceToken.value();
  const publicCategoryId = moodlePublicCategoryId.value().trim();
  if (!publicCategoryId) throw new Error('MOODLE_PUBLIC_CATEGORY_ID is not configured.');

  const [moodleCourses, categories] = await Promise.all([
    callMoodle('core_course_get_courses', baseUrl, serviceToken),
    callMoodle('core_course_get_categories', baseUrl, serviceToken)
  ]);
  const publicCourses = moodleCourses.filter((course) =>
    Number(course.id) !== 1
      && Number(course.visible) === 1
      && belongsToCategory(course.categoryid, categories, publicCategoryId)
  );
  const categoryNames = new Map(categories.map((category) => [String(category.id), category.name]));
  const existing = await db.collection('moodlePublicCourses').where('source', '==', 'moodle').get();
  const currentIds = new Set(publicCourses.map((course) => String(course.id)));
  const operations = [];

  publicCourses.forEach((course) => {
    const url = new URL('course/view.php', `${baseUrl}/`);
    url.searchParams.set('id', String(course.id));
    operations.push({
      type: 'set',
      reference: db.collection('moodlePublicCourses').doc(String(course.id)),
      data: {
        courseId: String(course.id),
        courseName: course.fullname || course.displayname || 'Moodle course',
        shortName: course.shortname || '',
        categoryId: String(course.categoryid || ''),
        categoryName: categoryNames.get(String(course.categoryid)) || 'Courses',
        summaryHtml: course.summary || '',
        courseUrl: url.href,
        source: 'moodle',
        isPublic: true,
        syncedAt: FieldValue.serverTimestamp()
      }
    });
  });

  existing.docs.forEach((course) => {
    if (!currentIds.has(course.id)) operations.push({ type: 'delete', reference: course.ref });
  });

  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    operations.slice(offset, offset + 400).forEach((operation) => {
      if (operation.type === 'delete') batch.delete(operation.reference);
      else batch.set(operation.reference, operation.data);
    });
    await batch.commit();
  }

  logger.info('Moodle public course catalog synchronized.', { courseCount: publicCourses.length });
  return { courseCount: publicCourses.length };
}

exports.syncMoodleCatalog = onSchedule({
  schedule: '0 * * * *',
  timeZone: 'UTC',
  secrets: [moodleBaseUrl, moodleServiceToken, moodlePublicCategoryId]
}, async () => {
  try {
    await syncMoodlePublicCatalog();
  } catch (error) {
    logger.error('Scheduled Moodle catalog sync failed.', error);
    throw error;
  }
});

exports.syncMoodleCatalogNow = onCall({
  secrets: [moodleBaseUrl, moodleServiceToken, moodlePublicCategoryId]
}, async (request) => {
  if (request.auth?.token?.email?.toLowerCase() !== teacherEmail) {
    throw new HttpsError('permission-denied', 'Only the configured teacher can refresh the Moodle catalog.');
  }
  try {
    return await syncMoodlePublicCatalog();
  } catch (error) {
    logger.error('Manual Moodle catalog sync failed.', error);
    throw new HttpsError('failed-precondition', error.message);
  }
});
