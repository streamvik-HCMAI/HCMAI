const { getAuth } = require('firebase-admin/auth');
const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();

const db = getFirestore();
const firebaseAuth = getAuth();
const oauthClientId = defineSecret('CLASSROOM_OAUTH_CLIENT_ID');
const oauthClientSecret = defineSecret('CLASSROOM_OAUTH_CLIENT_SECRET');
const oauthRefreshToken = defineSecret('CLASSROOM_OAUTH_REFRESH_TOKEN');
const teacherEmail = 'swapnilthakre@gmail.com';
const enrollmentTopicName = 'HCMAI: Enrollment Open';
const publicTopicName = 'HCMAI: Public';

async function getClassroomAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauthClientId.value(),
      client_secret: oauthClientSecret.value(),
      refresh_token: oauthRefreshToken.value(),
      grant_type: 'refresh_token'
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(`Classroom OAuth refresh failed: ${result.error_description || result.error || response.status}`);
  }
  return result.access_token;
}

async function listClassroomPages(path, field, accessToken) {
  const results = [];
  let pageToken = '';
  do {
    const url = new URL(`https://classroom.googleapis.com/v1/${path}`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || `Classroom API error ${response.status}`);
    results.push(...(result[field] || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return results;
}

function normalizeMaterials(materials = []) {
  return materials.flatMap((material) => {
    const driveFile = material.driveFile?.driveFile;
    const youtubeVideo = material.youtubeVideo?.youtubeVideo;
    const link = material.link;
    const form = material.form;
    const item = driveFile || youtubeVideo || link || form;
    if (!item) return [];
    const url = item.alternateLink || item.url || item.formUrl || '';
    if (url && !/^https:\/\//i.test(url)) return [];
    return [{
      title: item.title || 'Open resource',
      url,
      driveFileId: driveFile?.id || '',
      youtubeVideoId: youtubeVideo?.id || '',
      resourceType: driveFile ? 'drive' : youtubeVideo ? 'youtube' : form ? 'form' : 'link'
    }];
  });
}

function mapCourseMaterials(course, topics, materials) {
  const publicTopic = topics.find((topic) => topic.name === publicTopicName);
  return materials.map((item) => {
    const topicId = item.topicId || '';
    const topic = topics.find((candidate) => candidate.topicId === topicId);
    return {
      courseId: course.id,
      courseName: course.name || 'Google Classroom course',
      materialId: item.id,
      classroomItemType: item.classroomItemType,
      topicId,
      topicName: topic?.name || '',
      accessLevel: publicTopic && topicId === publicTopic.topicId ? 'public' : 'enrolled',
      title: item.title || 'Untitled lesson',
      description: item.description || '',
      materials: normalizeMaterials(item.materials),
      updateTime: item.updateTime || '',
      syncedAt: new Date().toISOString(),
      source: 'google-classroom'
    };
  });
}

async function commitOperations(operations) {
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    operations.slice(offset, offset + 400).forEach((operation) => {
      if (operation.type === 'delete') batch.delete(operation.reference);
      else batch.set(operation.reference, operation.data);
    });
    await batch.commit();
  }
}

async function syncCourseRoster(course, accessToken) {
  const students = await listClassroomPages(
    `courses/${encodeURIComponent(course.id)}/students`,
    'students',
    accessToken
  );
  const enrolledUsers = new Map();

  for (const student of students) {
    const email = student.profile?.emailAddress?.toLowerCase();
    if (!email) continue;
    try {
      const user = await firebaseAuth.getUserByEmail(email);
      enrolledUsers.set(user.uid, { userId: user.uid, userEmail: email });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
  }

  const existingMemberships = await db.collection('classroomMemberships')
    .where('courseId', '==', course.id)
    .get();
  const operations = [];

  enrolledUsers.forEach((user) => {
    const membershipId = `${user.userId}_${course.id}`;
    operations.push({
      type: 'set',
      reference: db.collection('classroomMemberships').doc(membershipId),
      data: {
        userId: user.userId,
        userEmail: user.userEmail,
        courseId: course.id,
        syncedAt: new Date().toISOString()
      }
    });
  });
  existingMemberships.docs.forEach((membership) => {
    if (!enrolledUsers.has(membership.data().userId)) {
      operations.push({ type: 'delete', reference: membership.ref });
    }
  });
  await commitOperations(operations);

  const requests = await db.collection('enrollmentRequests')
    .where('courseId', '==', course.id)
    .where('status', '==', 'pending')
    .get();
  const requestBatch = db.batch();
  let requestUpdates = 0;
  requests.docs.forEach((request) => {
    const email = request.data().userEmail?.toLowerCase();
    const isOnRoster = students.some((student) => student.profile?.emailAddress?.toLowerCase() === email);
    if (isOnRoster && request.data().status !== 'enrolled') {
      requestBatch.update(request.ref, {
        status: 'enrolled',
        enrolledAt: FieldValue.serverTimestamp()
      });
      requestUpdates += 1;
    } else if (!isOnRoster && request.data().status === 'enrolled') {
      requestBatch.update(request.ref, { status: 'pending' });
      requestUpdates += 1;
    }
  });
  if (requestUpdates) await requestBatch.commit();
}

async function syncClassroomCatalog(accessToken) {
  const courses = await listClassroomPages(
    'courses?teacherId=me&courseStates=ACTIVE',
    'courses',
    accessToken
  );
  const catalogOperations = [];
  const materialOperations = [];
  const activeCourseIds = new Set(courses.map((course) => course.id));
  let listedCourseCount = 0;
  let materialCount = 0;

  for (const course of courses) {
    const courseId = encodeURIComponent(course.id);
    const [topics, materials, coursework] = await Promise.all([
      listClassroomPages(`courses/${courseId}/topics`, 'topic', accessToken),
      listClassroomPages(
        `courses/${courseId}/courseWorkMaterials?courseWorkMaterialStates=PUBLISHED`,
        'courseWorkMaterial',
        accessToken
      ),
      listClassroomPages(
        `courses/${courseId}/courseWork?courseWorkStates=PUBLISHED`,
        'courseWork',
        accessToken
      )
    ]);
    const enrollmentOpen = topics.some((topic) => topic.name === enrollmentTopicName);
    const combined = [
      ...materials.map((item) => ({ ...item, classroomItemType: 'material' })),
      ...coursework.map((item) => ({ ...item, classroomItemType: item.workType || 'coursework' }))
    ];
    const courseMaterials = mapCourseMaterials(course, topics, combined);
    const publicMaterialCount = courseMaterials.filter((item) => item.accessLevel === 'public').length;
    const listedOnWebsite = enrollmentOpen || publicMaterialCount > 0;
    if (listedOnWebsite) listedCourseCount += 1;

    catalogOperations.push({
      type: listedOnWebsite ? 'set' : 'delete',
      reference: db.collection('courseCatalog').doc(course.id),
      data: {
        courseName: course.name || 'Google Classroom course',
        description: course.description || '',
        section: course.section || '',
        courseLink: course.alternateLink || '',
        enrollmentOpen,
        hasPublicMaterials: publicMaterialCount > 0,
        listedOnWebsite,
        syncedAt: new Date().toISOString(),
        source: 'google-classroom'
      }
    });

    courseMaterials.forEach((material) => {
      const materialId = `${encodeURIComponent(course.id)}_${encodeURIComponent(material.materialId)}`;
      materialOperations.push({
        type: 'set',
        reference: db.collection('courseMaterials').doc(materialId),
        data: material
      });
    });
    materialCount += courseMaterials.length;
    await syncCourseRoster(course, accessToken);
  }

  const [existingCourses, existingMaterials] = await Promise.all([
    db.collection('courseCatalog').where('source', '==', 'google-classroom').get(),
    db.collection('courseMaterials').where('source', '==', 'google-classroom').get()
  ]);
  const currentMaterialIds = new Set(materialOperations.map((operation) => operation.reference.id));
  existingCourses.docs.forEach((course) => {
    if (!activeCourseIds.has(course.id)) catalogOperations.push({ type: 'delete', reference: course.ref });
  });
  existingMaterials.docs.forEach((material) => {
    if (!currentMaterialIds.has(material.id)) materialOperations.push({ type: 'delete', reference: material.ref });
  });

  await commitOperations(catalogOperations);
  await commitOperations(materialOperations);
  return { listedCourseCount, materialCount };
}

exports.syncClassroomCatalog = onSchedule({
  schedule: '0 * * * *',
  timeZone: 'UTC',
  secrets: [oauthClientId, oauthClientSecret, oauthRefreshToken]
}, async () => {
  const configRef = db.doc('classroomSyncConfig/enrollmentCatalog');
  const configSnapshot = await configRef.get();
  const config = configSnapshot.data();
  if (!configSnapshot.exists || config?.enabled !== true) {
    logger.info('Classroom catalog sync is disabled or not configured.');
    return;
  }
  if (config.teacherEmail?.toLowerCase() !== teacherEmail) {
    logger.error('Classroom sync config has an unexpected teacher email.');
    return;
  }

  try {
    const accessToken = await getClassroomAccessToken();
    const result = await syncClassroomCatalog(accessToken);
    await configRef.set({
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastSyncError: '',
      ...result
    }, { merge: true });
    logger.info('Classroom catalog and roster sync completed.', result);
  } catch (error) {
    logger.error('Scheduled Classroom sync failed.', error);
    await configRef.set({
      lastSyncError: error.message,
      lastSyncAttemptAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
});
