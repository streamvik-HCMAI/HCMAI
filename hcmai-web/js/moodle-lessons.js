import { collection, getDocs, getFirestore, query, where } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';

const TEACHER_EMAIL = 'swapnilthakre@gmail.com';
const db = getFirestore();
const functions = getFunctions();
const syncPanel = document.getElementById('moodleAdminTools');
const syncButton = document.getElementById('syncMoodleCatalogButton');
const syncStatus = document.getElementById('moodleSyncStatus');
const lessonCards = document.getElementById('lessonCards');
const courseFilters = document.getElementById('lessonTopicFilters');

if (lessonCards && courseFilters) {
  let courses = [];
  let selectedCategory = '';

  const syncMoodleCatalog = httpsCallable(functions, 'syncMoodleCatalogNow');

  const summaryToText = (markup) => {
    const parsed = new DOMParser().parseFromString(String(markup || ''), 'text/html');
    parsed.querySelectorAll('script,style,iframe,object,embed,form').forEach((element) => element.remove());
    return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const safeCourseUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const renderFilters = () => {
    const categories = new Map();
    courses.forEach((course) => categories.set(course.categoryId || '', course.categoryName || 'Courses'));

    courseFilters.replaceChildren();
    [['', 'All courses'], ...categories.entries()].forEach(([categoryId, name]) => {
      const item = document.createElement('li');
      item.classList.toggle('active', categoryId === selectedCategory);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lesson-topic-filter';
      button.textContent = name;
      button.addEventListener('click', () => {
        selectedCategory = categoryId;
        renderFilters();
        renderCourses();
      });
      item.append(button);
      courseFilters.append(item);
    });
  };

  const renderCourses = () => {
    lessonCards.replaceChildren();
    const visibleCourses = courses.filter((course) => !selectedCategory || course.categoryId === selectedCategory);
    if (!visibleCourses.length) {
      const empty = document.createElement('p');
      empty.className = 'lesson-status';
      empty.textContent = 'No public Moodle courses are available yet.';
      lessonCards.append(empty);
      return;
    }

    visibleCourses.forEach((course) => {
      const card = document.createElement('article');
      card.className = 'lesson-card section-surface';
      const top = document.createElement('div');
      top.className = 'lesson-top';
      const category = document.createElement('span');
      category.className = 'chip accent';
      category.textContent = course.categoryName || 'Moodle course';
      const platform = document.createElement('span');
      platform.textContent = 'Moodle';
      top.append(category, platform);

      const title = document.createElement('h3');
      title.textContent = course.courseName || 'Untitled course';
      const summary = document.createElement('p');
      summary.textContent = summaryToText(course.summaryHtml);
      const openLink = document.createElement('a');
      openLink.className = 'primary-btn small';
      openLink.href = safeCourseUrl(course.courseUrl) || '#';
      openLink.textContent = 'Open course';
      openLink.setAttribute('aria-label', `Open ${title.textContent} in Moodle`);
      if (!course.courseUrl || !safeCourseUrl(course.courseUrl)) {
        openLink.setAttribute('aria-disabled', 'true');
        openLink.addEventListener('click', (event) => event.preventDefault());
      }

      card.append(top, title);
      if (summary.textContent) card.append(summary);
      card.append(openLink);
      lessonCards.append(card);
    });
  };

  const loadCourses = async () => {
    lessonCards.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'lesson-status';
    loading.textContent = 'Loading Moodle courses...';
    lessonCards.append(loading);

    try {
      const snapshot = await getDocs(query(
        collection(db, 'moodlePublicCourses'),
        where('isPublic', '==', true)
      ));
      courses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      courses.sort((left, right) => left.courseName.localeCompare(right.courseName));
      renderFilters();
      renderCourses();
    } catch (error) {
      lessonCards.replaceChildren();
      const message = document.createElement('p');
      message.className = 'lesson-status';
      message.textContent = error.code === 'permission-denied'
        ? 'The Moodle catalog is not connected in this environment yet.'
        : 'Moodle courses are temporarily unavailable.';
      lessonCards.append(message);
      console.error('Unable to load Moodle courses.', error);
    }
  };

  syncButton?.addEventListener('click', async () => {
    syncButton.disabled = true;
    syncStatus.textContent = 'Refreshing the Moodle course catalog...';
    try {
      const response = await syncMoodleCatalog();
      syncStatus.textContent = `Catalog refreshed. ${response.data.courseCount} public courses available.`;
      await loadCourses();
    } catch (error) {
      syncStatus.textContent = error.code === 'functions/not-found'
        ? 'Moodle sync is not deployed yet. Configure the Moodle service and deploy Functions first.'
        : (error.message || 'Moodle sync is not configured yet.');
    } finally {
      syncButton.disabled = false;
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (syncPanel) syncPanel.hidden = user?.email?.toLowerCase() !== TEACHER_EMAIL;
  });

  loadCourses();
}
