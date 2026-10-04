import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithPopup
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';

const TEACHER_EMAIL = 'swapnilthakre@gmail.com';
const ENROLLMENT_TOPIC = 'HCMAI: Enrollment Open';
const PUBLIC_MATERIAL_TOPIC = 'HCMAI: Public';
const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails'
];
const db = getFirestore();
const syncPanel = document.getElementById('classroomSyncPanel');
const connectButton = document.getElementById('connectClassroomButton');
const visibilityConfirmation = document.getElementById('confirmClassroomVisibility');
const autoSyncToggle = document.getElementById('enableClassroomAutoSync');
const syncButton = document.getElementById('syncClassroomButton');
const syncStatus = document.getElementById('classroomSyncStatus');
const enrollmentRequestList = document.getElementById('enrollmentRequestList');
const lessonCards = document.getElementById('lessonCards');
const courseFilters = document.getElementById('lessonTopicFilters');

if (
  syncPanel && connectButton && visibilityConfirmation && autoSyncToggle && syncButton &&
  syncStatus && enrollmentRequestList && lessonCards && courseFilters
) {
  let classroomAccessToken = '';
  let classroomCourses = [];
  let visibleCourses = [];
  let memberCourseIds = new Set();
  let activeCourseFilter = '';

  const isTeacher = (user = auth.currentUser) => user?.email?.toLowerCase() === TEACHER_EMAIL;
  const setStatus = (message) => { syncStatus.textContent = message; };

  const classroomProvider = () => {
    const provider = new GoogleAuthProvider();
    CLASSROOM_SCOPES.forEach((scope) => provider.addScope(scope));
    return provider;
  };

  const classroomRequest = async (path, accessToken) => {
    const response = await fetch(`https://classroom.googleapis.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Classroom access was denied. Enable the API and approve the requested read-only scopes.');
      }
      throw new Error(body.error?.message || `Google Classroom returned error ${response.status}.`);
    }
    return body;
  };

  const listAllPages = async (path, field, accessToken) => {
    const results = [];
    let pageToken = '';
    do {
      const separator = path.includes('?') ? '&' : '?';
      const pagePath = `${path}${separator}pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const response = await classroomRequest(pagePath, accessToken);
      results.push(...(response[field] || []));
      pageToken = response.nextPageToken || '';
    } while (pageToken);
    return results;
  };

  const mapMaterials = (materials = []) => materials.flatMap((material) => {
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

  const buildCourseMaterials = async (course, topics, accessToken) => {
    const courseId = encodeURIComponent(course.id);
    const [materials, coursework] = await Promise.all([
      listAllPages(
        `courses/${courseId}/courseWorkMaterials?courseWorkMaterialStates=PUBLISHED`,
        'courseWorkMaterial',
        accessToken
      ),
      listAllPages(
        `courses/${courseId}/courseWork?courseWorkStates=PUBLISHED`,
        'courseWork',
        accessToken
      )
    ]);
    const combined = [
      ...materials.map((item) => ({ ...item, classroomItemType: 'material' })),
      ...coursework.map((item) => ({ ...item, classroomItemType: item.workType || 'coursework' }))
    ];
    const publicTopic = topics.find((topic) => topic.name === PUBLIC_MATERIAL_TOPIC);

    return combined.map((item) => {
      const topicId = item.topicId || '';
      const topic = topics.find((candidate) => candidate.topicId === topicId);
      return {
        courseId: course.id,
        courseName: course.name || 'Google Classroom',
        materialId: item.id,
        classroomItemType: item.classroomItemType,
        topicId,
        topicName: topic?.name || '',
        accessLevel: publicTopic && topicId === publicTopic.topicId ? 'public' : 'enrolled',
        title: item.title || 'Untitled lesson',
        description: item.description || '',
        materials: mapMaterials(item.materials),
        updateTime: item.updateTime || '',
        source: 'google-classroom'
      };
    });
  };

  const commitOperations = async (operations) => {
    for (let offset = 0; offset < operations.length; offset += 400) {
      const batch = writeBatch(db);
      operations.slice(offset, offset + 400).forEach((operation) => {
        if (operation.type === 'delete') batch.delete(operation.reference);
        else batch.set(operation.reference, operation.data);
      });
      await batch.commit();
    }
  };

  const syncCourses = async () => {
    const existingCatalog = await getDocs(collection(db, 'courseCatalog'));
    const existingMaterials = await getDocs(query(
      collection(db, 'courseMaterials'),
      where('source', '==', 'google-classroom')
    ));
    const catalogIds = new Set();
    const materialIds = new Set();
    const operations = [];
    let listedCourseCount = 0;
    let materialCount = 0;

    for (const course of classroomCourses) {
      const topics = await listAllPages(`courses/${encodeURIComponent(course.id)}/topics`, 'topic', classroomAccessToken);
      const enrollmentOpen = topics.some((topic) => topic.name === ENROLLMENT_TOPIC);
      const materials = await buildCourseMaterials(course, topics, classroomAccessToken);
      const publicMaterials = materials.filter((item) => item.accessLevel === 'public');
      const listedOnWebsite = enrollmentOpen || publicMaterials.length > 0;
      const courseRef = doc(db, 'courseCatalog', course.id);

      catalogIds.add(course.id);
      operations.push({
        type: 'set',
        reference: courseRef,
        data: {
          courseName: course.name || 'Google Classroom course',
          description: course.description || '',
          section: course.section || '',
          courseLink: course.alternateLink || '',
          enrollmentOpen,
          listedOnWebsite,
          hasPublicMaterials: publicMaterials.length > 0,
          updatedAt: new Date().toISOString(),
          source: 'google-classroom'
        }
      });
      if (listedOnWebsite) {
        listedCourseCount += 1;
      }

      materials.forEach((material) => {
        const materialId = `${encodeURIComponent(course.id)}_${encodeURIComponent(material.materialId)}`;
        materialIds.add(materialId);
        operations.push({
          type: 'set',
          reference: doc(db, 'courseMaterials', materialId),
          data: { ...material, syncedAt: new Date().toISOString() }
        });
      });
      materialCount += materials.length;
    }

    existingCatalog.docs.forEach((item) => {
      if (item.data().source === 'google-classroom' && !catalogIds.has(item.id)) {
        operations.push({ type: 'delete', reference: item.ref });
      }
    });
    existingMaterials.docs.forEach((item) => {
      if (!materialIds.has(item.id)) operations.push({ type: 'delete', reference: item.ref });
    });

    await commitOperations(operations);
    await setDoc(doc(db, 'classroomSyncConfig', 'enrollmentCatalog'), {
      teacherEmail: auth.currentUser.email.toLowerCase(),
      enabled: autoSyncToggle.checked,
      updatedAt: new Date().toISOString()
    });
    return { listedCourseCount, materialCount };
  };

  const createResourceFrame = (resource) => {
    let source = '';
    if (resource.youtubeVideoId) {
      source = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(resource.youtubeVideoId)}`;
    } else if (resource.driveFileId) {
      source = `https://drive.google.com/file/d/${encodeURIComponent(resource.driveFileId)}/preview`;
    } else if (resource.resourceType === 'form' && resource.url) {
      source = resource.url;
    }
    if (!source) return null;

    const frame = document.createElement('iframe');
    frame.className = 'lesson-media-frame';
    frame.src = source;
    frame.title = resource.title;
    frame.loading = 'lazy';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    return frame;
  };

  const renderMaterials = async (course, isMember) => {
    lessonCards.replaceChildren();
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'secondary-btn small';
    backButton.textContent = 'Back to courses';
    backButton.addEventListener('click', loadCatalog);
    lessonCards.append(backButton);

    const heading = document.createElement('h2');
    heading.textContent = course.courseName;
    lessonCards.append(heading);

    const [publicSnapshot, enrolledSnapshot] = await Promise.all([
      getDocs(query(
        collection(db, 'courseMaterials'),
        where('courseId', '==', course.id),
        where('accessLevel', '==', 'public')
      )),
      isMember
        ? getDocs(query(
          collection(db, 'courseMaterials'),
          where('courseId', '==', course.id),
          where('accessLevel', '==', 'enrolled')
        ))
        : Promise.resolve(null)
    ]);
    const materials = [
      ...publicSnapshot.docs.map((item) => item.data()),
      ...(enrolledSnapshot?.docs || []).map((item) => item.data())
    ];

    if (!materials.length) {
      const empty = document.createElement('p');
      empty.className = 'lesson-status';
      empty.textContent = 'No website lessons are available for this course yet.';
      lessonCards.append(empty);
    }

    materials.forEach((material) => {
      const card = document.createElement('article');
      card.className = 'lesson-card section-surface';
      const label = document.createElement('span');
      label.className = 'chip accent';
      label.textContent = material.topicName || 'Classroom material';
      const title = document.createElement('h3');
      title.textContent = material.title;
      const description = document.createElement('p');
      description.textContent = material.description;
      card.append(label, title);
      if (description.textContent) card.append(description);

      (material.materials || []).forEach((resource) => {
        const frame = createResourceFrame(resource);
        if (frame) card.append(frame);
        if (resource.url) {
          const link = document.createElement('a');
          link.className = 'secondary-btn small';
          link.href = resource.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = frame ? `Open ${resource.title || 'resource'} in Google` : (resource.title || 'Open resource');
          card.append(link);
        }
      });
      lessonCards.append(card);
    });

    if (!isMember && course.enrollmentOpen) {
      const requestButton = document.createElement('button');
      requestButton.type = 'button';
      requestButton.className = 'primary-btn small';
      requestButton.textContent = 'Request enrollment';
      const requestStatus = document.createElement('p');
      requestStatus.className = 'lesson-request-status';
      requestButton.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) {
          requestStatus.textContent = 'Sign in with Google to request enrollment.';
          document.querySelector('.auth-button')?.click();
          return;
        }
        if (!user.emailVerified) {
          requestStatus.textContent = 'Verify your account email before requesting enrollment.';
          return;
        }
        requestButton.disabled = true;
        try {
          const requestId = `${user.uid}_${course.id}`;
          const requestRef = doc(db, 'enrollmentRequests', requestId);
          const existing = await getDoc(requestRef);
          if (existing.exists()) {
            requestStatus.textContent = `Request status: ${existing.data().status}.`;
          } else {
            await setDoc(requestRef, {
              userId: user.uid,
              userEmail: user.email,
              courseId: course.id,
              courseName: course.courseName,
              status: 'pending',
              requestedAt: serverTimestamp()
            });
            requestStatus.textContent = 'Request sent. Your teacher will add you to the Google Classroom course.';
          }
        } catch (error) {
          requestStatus.textContent = error.message || 'Could not submit the enrollment request.';
          requestButton.disabled = false;
        }
      });
      lessonCards.append(requestButton, requestStatus);
    }
  };

  const loadCatalog = async () => {
    lessonCards.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'lesson-status';
    loading.textContent = 'Loading available courses...';
    lessonCards.append(loading);

    try {
      const snapshot = await getDocs(query(collection(db, 'courseCatalog'), where('listedOnWebsite', '==', true)));
      visibleCourses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      memberCourseIds = new Set();
      if (auth.currentUser) {
        const memberships = await getDocs(query(
          collection(db, 'classroomMemberships'),
          where('userId', '==', auth.currentUser.uid)
        ));
        for (const membership of memberships.docs) {
          const courseId = membership.data().courseId;
          memberCourseIds.add(courseId);
          if (!visibleCourses.some((course) => course.id === courseId)) {
            const course = await getDoc(doc(db, 'courseCatalog', courseId));
            if (course.exists()) visibleCourses.push({ id: course.id, ...course.data() });
          }
        }
      }
      visibleCourses.sort((left, right) => left.courseName.localeCompare(right.courseName));
      renderCourseFilters();
      lessonCards.replaceChildren();

      const courses = visibleCourses.filter((course) => !activeCourseFilter || course.id === activeCourseFilter);
      if (!courses.length) {
        const empty = document.createElement('p');
        empty.className = 'lesson-status';
        empty.textContent = 'No courses are currently available on the website.';
        lessonCards.append(empty);
        return;
      }

      for (const course of courses) {
        const isCourseMember = isTeacher() || memberCourseIds.has(course.id);
        const card = document.createElement('article');
        card.className = 'lesson-card section-surface';
        const meta = document.createElement('div');
        meta.className = 'lesson-top';
        const label = document.createElement('span');
        label.className = 'chip accent';
        label.textContent = course.enrollmentOpen ? 'Enrollment open' : 'Public lessons';
        const provider = document.createElement('span');
        provider.textContent = 'Google Classroom';
        meta.append(label, provider);
        const title = document.createElement('h3');
        title.textContent = course.courseName;
        const description = document.createElement('p');
        description.textContent = course.description || 'Hindustani classical music course.';
        const actions = document.createElement('div');
        actions.className = 'lesson-material-links';
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'secondary-btn small';
        openButton.textContent = 'View lessons';
        openButton.addEventListener('click', () => renderMaterials(course, isCourseMember));
        actions.append(openButton);
        card.append(meta, title, description, actions);
        lessonCards.append(card);
      }
    } catch (error) {
      lessonCards.replaceChildren();
      const message = document.createElement('p');
      message.className = 'lesson-status';
      message.textContent = 'Courses could not be loaded. Please try again later.';
      lessonCards.append(message);
      console.error('Unable to load the Classroom course catalog.', error);
    }
  };

  const renderCourseFilters = () => {
    courseFilters.replaceChildren();
    const filters = [['', 'All courses'], ...visibleCourses.map((course) => [course.id, course.courseName])];
    filters.forEach(([courseId, name]) => {
      const item = document.createElement('li');
      item.classList.toggle('active', courseId === activeCourseFilter);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lesson-topic-filter';
      button.textContent = name;
      button.addEventListener('click', () => {
        activeCourseFilter = courseId;
        renderCourseFilters();
        loadCatalog();
      });
      item.append(button);
      courseFilters.append(item);
    });
  };

  const loadEnrollmentRequests = async () => {
    enrollmentRequestList.replaceChildren();
    try {
      const snapshot = await getDocs(query(
        collection(db, 'enrollmentRequests'),
        where('status', '==', 'pending')
      ));
      snapshot.docs.forEach((request) => {
        const data = request.data();
        const item = document.createElement('li');
        item.textContent = `${data.userEmail} — ${data.courseName}`;
        enrollmentRequestList.append(item);
      });
      if (snapshot.empty) {
        const empty = document.createElement('li');
        empty.textContent = 'No pending requests.';
        enrollmentRequestList.append(empty);
      }
    } catch (error) {
      console.error('Unable to load enrollment requests.', error);
    }
  };

  const connectClassroom = async () => {
    const user = auth.currentUser;
    if (!user || !isTeacher(user)) throw new Error('Sign in with the configured teacher account first.');
    const provider = classroomProvider();
    const hasGoogleProvider = user.providerData.some((item) => item.providerId === 'google.com');
    const result = hasGoogleProvider
      ? await reauthenticateWithPopup(user, provider)
      : await linkWithPopup(user, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) throw new Error('Google did not return a Classroom access token. Reconnect and approve the read-only request.');
    classroomAccessToken = credential.accessToken;
    classroomCourses = await listAllPages('courses?teacherId=me&courseStates=ACTIVE', 'courses', classroomAccessToken);
    visibilityConfirmation.disabled = false;
    autoSyncToggle.disabled = false;
    syncButton.disabled = !visibilityConfirmation.checked;
    setStatus(`Connected. ${classroomCourses.length} active courses found. Sync will use the Classroom topic policy above.`);
  };

  connectButton.addEventListener('click', async () => {
    connectButton.disabled = true;
    setStatus('Connecting to Google Classroom...');
    try {
      await connectClassroom();
    } catch (error) {
      const messages = {
        'auth/popup-closed-by-user': 'Google Classroom access was not approved. Reconnect and approve the read-only request.',
        'auth/popup-blocked': 'Allow popups for this site, then connect again.',
        'auth/unauthorized-domain': 'This site domain is not authorized for Firebase sign-in.'
      };
      setStatus(messages[error.code] || error.message || 'Could not connect to Google Classroom.');
    } finally {
      connectButton.disabled = false;
    }
  });

  visibilityConfirmation.addEventListener('change', () => {
    syncButton.disabled = !classroomAccessToken || !visibilityConfirmation.checked;
  });

  syncButton.addEventListener('click', async () => {
    if (!classroomAccessToken || !visibilityConfirmation.checked) return;
    syncButton.disabled = true;
    setStatus('Syncing catalog, materials, and roster data...');
    try {
      const catalogIds = [];
      const materialIds = [];
      let publicMaterialCount = 0;
      let courseCount = 0;

      for (const course of classroomCourses) {
        const topics = await listAllPages(`courses/${encodeURIComponent(course.id)}/topics`, 'topic', classroomAccessToken);
        const materials = await buildCourseMaterials(course, topics, classroomAccessToken);
        const enrollmentOpen = topics.some((topic) => topic.name === ENROLLMENT_TOPIC);
        const hasPublicMaterials = materials.some((material) => material.accessLevel === 'public');
        const listedOnWebsite = enrollmentOpen || hasPublicMaterials;
        if (listedOnWebsite) {
          courseCount += 1;
          catalogIds.push(course.id);
          await setDoc(doc(db, 'courseCatalog', course.id), {
            courseName: course.name || 'Google Classroom course',
            description: course.description || '',
            section: course.section || '',
            courseLink: course.alternateLink || '',
            enrollmentOpen,
            hasPublicMaterials,
            listedOnWebsite: true,
            source: 'google-classroom',
            syncedAt: new Date().toISOString()
          });
        }
        for (const material of materials) {
          const materialId = `${encodeURIComponent(course.id)}_${encodeURIComponent(material.materialId)}`;
          materialIds.push(materialId);
          await setDoc(doc(db, 'courseMaterials', materialId), {
            ...material,
            syncedAt: new Date().toISOString()
          });
          if (material.accessLevel === 'public') publicMaterialCount += 1;
        }
      }

      await setDoc(doc(db, 'classroomSyncConfig', 'enrollmentCatalog'), {
        teacherEmail: auth.currentUser.email.toLowerCase(),
        enabled: autoSyncToggle.checked,
        updatedAt: new Date().toISOString()
      });
      visibilityConfirmation.checked = false;
      syncButton.disabled = true;
      await loadCatalog();
      if (isTeacher()) await loadEnrollmentRequests();
      setStatus(`Synced ${courseCount} listed courses; ${publicMaterialCount} public materials. ${autoSyncToggle.checked ? 'Hourly sync preference saved.' : 'Automatic sync is off.'}`);
    } catch (error) {
      setStatus(error.message || 'Could not sync Classroom courses.');
      syncButton.disabled = false;
    }
  });

  onAuthStateChanged(auth, async (user) => {
    const teacher = isTeacher(user);
    syncPanel.hidden = !teacher;
    if (teacher) await loadEnrollmentRequests();
    await loadCatalog();
  });
}
