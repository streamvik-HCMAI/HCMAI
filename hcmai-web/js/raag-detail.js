import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { deleteObject, getBlob, getDownloadURL, getStorage, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';

const db = getFirestore();
const storage = getStorage();
storage.maxOperationRetryTime = 20000;
storage.maxUploadRetryTime = 60000;

async function fetchStoredAudio(storageInstance, path) {
  try {
    return await getBlob(ref(storageInstance, path));
  } catch (sdkError) {
    console.warn('Storage SDK download failed; retrying with a direct request.', sdkError);
    const url = await getDownloadURL(ref(storageInstance, path));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio download failed (${response.status}).`);
    return response.blob();
  }
}
const recordId = new URLSearchParams(window.location.search).get('id') || '';
const pageStatus = document.getElementById('raagDetailStatus');
const content = document.getElementById('raagDetailContent');
const nameHeading = document.getElementById('raagDetailName');
const recordStatus = document.getElementById('raagRecordStatus');
const summary = document.getElementById('raagDetailSummary');
const feedback = document.getElementById('raagDetailFeedback');
const details = document.getElementById('raagPublicDetails');
const provenance = document.getElementById('raagProvenanceFacts');
const form = document.getElementById('raagAdminForm');
const topicsStatus = document.getElementById('raagTopicsStatus');
const topicsList = document.getElementById('raagTopicsList');
const addTopicButton = document.getElementById('addRaagTopic');
const topicForm = document.getElementById('raagTopicForm');
const cancelTopicButton = document.getElementById('cancelRaagTopic');
const practiceLoopsStatus = document.getElementById('raagPracticeLoopsStatus');
const practiceLoopsList = document.getElementById('raagPracticeLoopsList');
const addPracticeLoopButton = document.getElementById('addRaagPracticeLoop');
const addSavedLoopButton = document.getElementById('addRaagSavedLoop');
const savedLoopForm = document.getElementById('raagSavedLoopForm');
const cancelSavedLoopButton = document.getElementById('cancelRaagSavedLoop');
const practiceLoopForm = document.getElementById('raagPracticeLoopForm');
const cancelPracticeLoopButton = document.getElementById('cancelRaagPracticeLoop');
const editButton = document.getElementById('editRaagDetails');
const saveButton = document.getElementById('saveRaagDraft');
const publishButton = document.getElementById('publishRaag');
const cancelButton = document.getElementById('cancelRaagEdit');

let record = null;
let isAdmin = false;
let isEditing = false;
let currentUser = null;
let editingLoop = null;
const loopMetadataKeys = ['songName', 'raagName', 'notes', 'artist', 'taal', 'laya', 'section'];

function raagLoopAudioPath(loopId, accessLevel, isPublished) {
  const bucket = !isPublished ? 'private' : (accessLevel === 'public' ? 'public' : 'signedin');
  return `raagLoops/${bucket}/${recordId}/${loopId}.wav`;
}

async function deleteStoredAudio(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') throw error;
  }
}

const fieldGroups = [
  {
    title: 'Identity and classification',
    fields: [
      ['name', 'Raag name', 'text', true],
      ['nameHindi', 'Name in Devanagari', 'text'],
      ['aliases', 'Aliases, comma-separated', 'list'],
      ['thaat', 'Thaat', 'text'],
      ['jati', 'Jati (as stated by source)', 'text'],
      ['tradition', 'Tradition or lineage', 'text'],
      ['catalogType', 'Record classification', 'readonly'],
      ['sourceConfidence', 'Source confidence', 'readonly']
    ]
  },
  {
    title: 'Performance context',
    fields: [
      ['timeOfDay', 'Samay / time of day', 'text'],
      ['prahar', 'Prahar (1–8)', 'number'],
      ['rasa', 'Rasa', 'text']
    ]
  },
  {
    title: 'Melodic structure',
    fields: [
      ['aroha', 'Aroha', 'textarea'],
      ['avaroha', 'Avaroha', 'textarea'],
      ['pakad', 'Pakad', 'textarea'],
      ['ascendingNoteCount', 'Aroha note count', 'number'],
      ['descendingNoteCount', 'Avaroha note count', 'number'],
      ['vadi', 'Vadi', 'text'],
      ['samvadi', 'Samvadi', 'text'],
      ['swaras', 'Swaras, comma-separated', 'list'],
      ['komalSwaras', 'Komal swaras, comma-separated', 'list'],
      ['teevraSwaras', 'Teevra swaras, comma-separated', 'list'],
      ['nyasSwaras', 'Nyas swaras, comma-separated', 'list'],
      ['varjitSwaras', 'Varjit swaras, comma-separated', 'list']
    ]
  },
  {
    title: 'Editorial and provenance',
    fields: [
      ['description', 'Description', 'textarea'],
      ['sourceName', 'Source name', 'text', true],
      ['sourceUrl', 'Source URL', 'url'],
      ['license', 'License / permission basis', 'text', true],
      ['verifiedAt', 'Reviewed on', 'date', true]
    ]
  }
];

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function addFact(group, label, value) {
  if (value === undefined || value === null || value === '') return;
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = displayValue(value);
  wrapper.append(term, description);
  group.appendChild(wrapper);
}

function renderReadOnlyRecord() {
  details.replaceChildren();
  const factGrid = document.createElement('dl');
  factGrid.className = 'raag-detail-facts';
  [
    ['Thaat', record.thaat], ['Jati', record.jati], ['Tradition', record.tradition],
    ['Samay', record.timeOfDay], ['Prahar', record.prahar], ['Rasa', record.rasa],
    ['Aroha note count', record.ascendingNoteCount], ['Avaroha note count', record.descendingNoteCount],
    ['Vadi', record.vadi], ['Samvadi', record.samvadi], ['Aliases', record.aliases],
    ['Name in Devanagari', record.nameHindi], ['Swaras', record.swaras],
    ['Komal swaras', record.komalSwaras], ['Teevra swaras', record.teevraSwaras],
    ['Nyas swaras', record.nyasSwaras], ['Varjit swaras', record.varjitSwaras]
  ].forEach(([label, value]) => addFact(factGrid, label, value));
  if (factGrid.childElementCount) details.appendChild(factGrid);

  [['Aroha', record.aroha], ['Avaroha', record.avaroha], ['Pakad', record.pakad]].forEach(([label, value]) => {
    if (!value) return;
    const section = document.createElement('section');
    section.className = 'raag-detail-notation';
    const heading = document.createElement('h2');
    const text = document.createElement('p');
    heading.textContent = label;
    text.textContent = value;
    section.append(heading, text);
    details.appendChild(section);
  });

  if (record.description) {
    const description = document.createElement('p');
    description.className = 'raag-detail-description';
    description.textContent = record.description;
    details.appendChild(description);
  }

  provenance.replaceChildren();
  const sourceFacts = [
    ['Source name', record.sourceName], ['Source URL', record.sourceUrl],
    ['License', record.license], ['Source record ID', record.sourceRecordId],
    ['Source type', record.catalogType], ['Source confidence', record.sourceConfidence],
    ['Reviewed on', record.verifiedAt]
  ];
  sourceFacts.forEach(([label, value]) => addFact(provenance, label, value));
}

function renderEditForm() {
  form.replaceChildren();
  fieldGroups.forEach((groupDefinition) => {
    const group = document.createElement('fieldset');
    group.className = 'raag-edit-group';
    const legend = document.createElement('legend');
    legend.textContent = groupDefinition.title;
    group.appendChild(legend);
    groupDefinition.fields.forEach(([name, labelText, type, required]) => {
      const label = document.createElement('label');
      label.className = 'raag-edit-field';
      const caption = document.createElement('span');
      caption.textContent = labelText;
      const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
      input.name = name;
      if (type === 'readonly') {
        input.type = 'text';
        input.readOnly = true;
      } else if (type === 'list') {
        input.type = 'text';
      } else if (type !== 'textarea') {
        input.type = type;
      }
      if (name === 'prahar') {
        input.min = '1';
        input.max = '8';
        input.step = '1';
      }
      if (name === 'ascendingNoteCount' || name === 'descendingNoteCount') {
        input.min = '1';
        input.max = '12';
        input.step = '1';
      }
      if (required) input.required = true;
      input.value = type === 'readonly' && (record[name] === null || record[name] === undefined)
        ? 'Not recorded'
        : displayValue(record[name]);
      label.append(caption, input);
      group.appendChild(label);
    });
    form.appendChild(group);
  });
}

function setEditing(editing) {
  isEditing = editing;
  details.hidden = editing;
  form.hidden = !editing;
  editButton.hidden = editing;
  saveButton.hidden = !editing;
  publishButton.hidden = !editing;
  cancelButton.hidden = !editing;
  feedback.textContent = editing ? 'Changes are saved to this existing record. Its document ID and source ID are locked.' : '';
}

function parseOptionalNumber(value, label, min, max) {
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return number;
}

function collectFormData() {
  const formData = new FormData(form);
  const commaList = (name) => String(formData.get(name) || '').split(',').map((item) => item.trim()).filter(Boolean);
  const notes = (name) => String(formData.get(name) || '').trim().split(/[\s,]+/).filter(Boolean);
  const sourceUrl = String(formData.get('sourceUrl') || '').trim();
  if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) throw new Error('Source URL must use HTTPS.');
  return {
    name: String(formData.get('name') || '').trim(),
    nameHindi: String(formData.get('nameHindi') || '').trim(),
    aliases: commaList('aliases'),
    thaat: String(formData.get('thaat') || '').trim(),
    jati: String(formData.get('jati') || '').trim(),
    tradition: String(formData.get('tradition') || '').trim(),
    timeOfDay: String(formData.get('timeOfDay') || '').trim(),
    prahar: parseOptionalNumber(String(formData.get('prahar') || ''), 'Prahar', 1, 8),
    ascendingNoteCount: parseOptionalNumber(String(formData.get('ascendingNoteCount') || ''), 'Aroha note count', 1, 12),
    descendingNoteCount: parseOptionalNumber(String(formData.get('descendingNoteCount') || ''), 'Avaroha note count', 1, 12),
    aroha: String(formData.get('aroha') || '').trim(),
    arohaNotes: notes('aroha'),
    avaroha: String(formData.get('avaroha') || '').trim(),
    avarohaNotes: notes('avaroha'),
    pakad: String(formData.get('pakad') || '').trim(),
    pakadNotes: notes('pakad'),
    vadi: String(formData.get('vadi') || '').trim(),
    samvadi: String(formData.get('samvadi') || '').trim(),
    swaras: commaList('swaras'),
    komalSwaras: commaList('komalSwaras'),
    teevraSwaras: commaList('teevraSwaras'),
    nyasSwaras: commaList('nyasSwaras'),
    varjitSwaras: commaList('varjitSwaras'),
    rasa: String(formData.get('rasa') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    sourceName: String(formData.get('sourceName') || '').trim(),
    sourceUrl,
    license: String(formData.get('license') || '').trim(),
    verifiedAt: String(formData.get('verifiedAt') || '').trim()
  };
}

function validateForPublish(updated) {
  const missing = ['name', 'thaat', 'jati', 'aroha', 'avaroha', 'sourceName', 'license', 'verifiedAt']
    .filter((field) => !String(updated[field] || '').trim());
  if (missing.length) throw new Error(`Complete these fields before publishing: ${missing.join(', ')}.`);
}

async function saveRecord(publish) {
  if (!isAdmin || !record) throw new Error('Administrator permission is required.');
  const token = await auth.currentUser?.getIdTokenResult(true);
  if (token?.claims.admin !== true) throw new Error('Administrator permission could not be verified.');
  const updated = collectFormData();
  if (!updated.name) throw new Error('Raag name is required.');
  if (publish) validateForPublish(updated);
  updated.isPublished = publish;
  updated.schemaVersion = record.schemaVersion || 1;
  updated.updatedAt = new Date().toISOString();
  await updateDoc(doc(db, 'raags', recordId), updated);
  record = { ...record, ...updated };
  renderPage();
  setEditing(false);
  feedback.textContent = publish
    ? 'Raag published. It is now available to visitors.'
    : 'Draft saved. It remains unavailable to visitors.';
}

function renderPage() {
  nameHeading.textContent = record.name || 'Unnamed Raag record';
  recordStatus.textContent = record.isPublished ? 'Published Raag' : 'Unpublished source candidate';
  summary.textContent = [record.thaat, record.jati ? `Jati ${formatJati(record.jati)}` : '', record.timeOfDay ? formatSamay(record.timeOfDay) : ''].filter(Boolean).join(' · ');
  renderReadOnlyRecord();
  if (isAdmin) renderEditForm();
  content.hidden = false;
  pageStatus.hidden = true;
  loadTopics();
  loadPracticeLoops(currentUser);
}

async function loadTopics() {
  if (!recordId) return;
  topicsList.replaceChildren();
  try {
    const snapshot = await getDocs(query(collection(db, 'raags', recordId, 'topics'), orderBy('orderIndex')));
    if (snapshot.empty) {
      topicsStatus.textContent = 'No recordings added.';
      return;
    }
    topicsStatus.textContent = `${snapshot.size} recording topics`;
    snapshot.docs.forEach((topicDoc) => {
      const topic = topicDoc.data();
      const row = document.createElement('article');
      row.className = 'topic-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = topic.title || 'Recording';
      const text = document.createElement('p');
      text.textContent = topic.text || '';
      copy.append(title, text);
      row.appendChild(copy);
      if (topic.audioPath) {
        const play = document.createElement('button');
        play.className = 'secondary-btn small';
        play.type = 'button';
        play.textContent = 'Play';
        play.addEventListener('click', () => playTopicAudio(play, topic.audioPath));
        row.appendChild(play);
      }
      topicsList.appendChild(row);
    });
  } catch (error) {
    topicsStatus.textContent = auth.currentUser ? 'Recordings could not be loaded.' : 'Sign in to access protected recordings.';
  }
}

function parseLoopTime(value) {
  const parts = String(value || '').trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  const seconds = values[values.length - 1];
  const minutes = values[values.length - 2];
  if (seconds >= 60 || (values.length === 3 && minutes >= 60)) return null;
  return values.length === 3 ? values[0] * 3600 + minutes * 60 + seconds : minutes * 60 + seconds;
}

function formatLoopTime(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const remainder = wholeSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${Math.floor(wholeSeconds / 60)}:${String(remainder).padStart(2, '0')}`;
}

function parseYouTubeVideoId(value) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;
    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0];
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      videoId = url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    }
    return videoId && /^[\w-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

function openPracticeLoopForm(loop = null) {
  practiceLoopForm.reset();
  savedLoopForm.hidden = true;
  editingLoop = loop;
  const isAudioLoop = loop?.sourceType === 'audio';
  practiceLoopForm.querySelectorAll('[data-youtube-field]').forEach((field) => { field.hidden = isAudioLoop; });
  practiceLoopForm.elements.videoUrl.required = !isAudioLoop;
  practiceLoopForm.elements.startTime.required = !isAudioLoop;
  practiceLoopForm.elements.endTime.required = !isAudioLoop;
  practiceLoopForm.elements.loopId.value = loop?.id || '';
  practiceLoopForm.elements.title.value = loop?.title || '';
  practiceLoopForm.elements.videoUrl.value = loop?.videoId
    ? `https://www.youtube.com/watch?v=${loop.videoId}`
    : '';
  practiceLoopForm.elements.startTime.value = loop ? formatLoopTime(loop.startSeconds) : '';
  practiceLoopForm.elements.endTime.value = loop ? formatLoopTime(loop.endSeconds) : '';
  practiceLoopForm.elements.accessLevel.value = loop?.accessLevel || 'public';
  practiceLoopForm.elements.isPublished.checked = loop?.isPublished === true;
  practiceLoopForm.hidden = false;
  practiceLoopForm.elements.title.focus();
}

function renderPracticeLoops(loops) {
  practiceLoopsList.replaceChildren();
  if (!loops.length) {
    practiceLoopsStatus.textContent = isAdmin
      ? 'No practice phrases for this Raag yet.'
      : 'No published practice phrases are available for this Raag.';
    return;
  }

  practiceLoopsStatus.textContent = `${loops.length} practice ${loops.length === 1 ? 'phrase' : 'phrases'}`;
  loops.forEach((loop) => {
    const row = document.createElement('article');
    row.className = 'practice-loop-row';
    const copy = document.createElement('div');
    copy.className = 'practice-loop-copy';
    const title = document.createElement('strong');
    title.textContent = loop.title;
    const description = document.createElement('span');
    description.textContent = loop.sourceType === 'audio'
      ? `Audio · ${formatLoopTime(loop.endSeconds - loop.startSeconds)}`
      : `YouTube · ${formatLoopTime(loop.startSeconds)}–${formatLoopTime(loop.endSeconds)}`;
    copy.append(title, description);
    const metaText = [
      loop.songName,
      loop.raagName && `Raag ${loop.raagName}`,
      loop.artist,
      loop.taal && `${loop.taal}${loop.laya ? ` (${loop.laya})` : ''}`,
      !loop.taal && loop.laya,
      loop.section
    ].filter(Boolean).join(' · ');
    if (metaText) {
      const meta = document.createElement('span');
      meta.textContent = metaText;
      copy.append(meta);
    }
    if (Array.isArray(loop.tags) && loop.tags.length) {
      const tags = document.createElement('span');
      tags.textContent = loop.tags.map((tag) => `#${tag}`).join(' ');
      copy.append(tags);
    }

    const actions = document.createElement('div');
    actions.className = 'practice-loop-actions';
    if (isAdmin) {
      const statusBadge = document.createElement('span');
      statusBadge.className = loop.isPublished ? '' : 'practice-loop-status-draft';
      statusBadge.textContent = loop.isPublished
        ? (loop.accessLevel === 'signed-in' ? 'Published · Sign-in required' : 'Published · Public')
        : 'Draft · Admin only';
      actions.appendChild(statusBadge);
    }

    const practiceButton = document.createElement('button');
    practiceButton.className = 'primary-btn small';
    practiceButton.type = 'button';
    practiceButton.textContent = 'Practice phrase';
    practiceButton.addEventListener('click', () => toggleInlinePlayer(row, practiceButton, loop));
    actions.appendChild(practiceButton);

    if (isAdmin) {
      const editButton = document.createElement('button');
      editButton.className = 'secondary-btn small';
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => openPracticeLoopForm(loop));
      const deleteButton = document.createElement('button');
      deleteButton.className = 'secondary-btn small';
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => deletePracticeLoop(loop));
      actions.append(editButton, deleteButton);
    }

    row.append(copy, actions);
    practiceLoopsList.appendChild(row);
  });
}

let activeYouTubePlayer = null;
let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return youtubeApiPromise;
}

function closeInlinePlayers(exceptRow) {
  document.querySelectorAll('.practice-loop-player').forEach((panel) => {
    const row = panel.closest('.practice-loop-row');
    if (row === exceptRow) return;
    panel.cleanup?.();
    panel.remove();
    const button = row?.querySelector('.practice-loop-actions .primary-btn');
    if (button) button.textContent = 'Practice phrase';
  });
}

async function toggleInlinePlayer(row, button, loop) {
  const existing = row.querySelector('.practice-loop-player');
  if (existing) {
    existing.cleanup?.();
    existing.remove();
    button.textContent = 'Practice phrase';
    return;
  }
  closeInlinePlayers(row);
  const panel = document.createElement('div');
  panel.className = 'practice-loop-player';
  row.appendChild(panel);
  button.textContent = 'Close player';

  if (loop.sourceType === 'audio') {
    panel.textContent = 'Loading audio...';
    try {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.loop = true;
      audio.preload = 'auto';
      audio.src = await getDownloadURL(ref(storage, loop.audioPath));
      panel.replaceChildren(audio);
      panel.cleanup = () => audio.pause();
      audio.play().catch(() => {});
    } catch (error) {
      console.error('Unable to load phrase audio.', error);
      panel.textContent = 'Audio could not be loaded.';
    }
    return;
  }

  const target = document.createElement('div');
  panel.replaceChildren(target);
  await loadYouTubeApi();
  if (!panel.isConnected) return;
  const start = Math.max(0, Number(loop.startSeconds) || 0);
  const end = Number(loop.endSeconds) || start + 1;
  let timer = null;
  const player = new window.YT.Player(target, {
    videoId: loop.videoId,
    playerVars: { start: Math.floor(start), playsinline: 1, rel: 0, autoplay: 1 },
    events: {
      onReady: () => {
        timer = setInterval(() => {
          if (typeof player.getCurrentTime === 'function' && player.getCurrentTime() >= end) player.seekTo(start, true);
        }, 250);
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.ENDED) player.seekTo(start, true);
      }
    }
  });
  activeYouTubePlayer = player;
  panel.cleanup = () => { clearInterval(timer); player.destroy?.(); if (activeYouTubePlayer === player) activeYouTubePlayer = null; };
}

function buildPracticeLoopUrl(loop) {
  const url = new URL('practice.html', window.location.href);
  if (loop.sourceType === 'audio') {
    url.searchParams.set('raagLoop', `${recordId}/${loop.id}`);
    return `${url.pathname}${url.search}`;
  }
  url.searchParams.set('video', loop.videoId);
  url.searchParams.set('start', String(loop.startSeconds));
  url.searchParams.set('end', String(loop.endSeconds));
  url.searchParams.set('title', loop.title);
  return `${url.pathname}${url.search}`;
}

async function loadPracticeLoops(user = auth.currentUser) {
  if (!recordId || !record || !practiceLoopsList) return;
  practiceLoopsStatus.textContent = 'Loading practice phrases...';
  try {
    const loopCollection = collection(db, 'raags', recordId, 'practiceLoops');
    let loops = [];
    if (isAdmin) {
      const snapshot = await getDocs(loopCollection);
      loops = snapshot.docs.map((loopDoc) => ({ id: loopDoc.id, ...loopDoc.data() }));
    } else {
      const accessLevels = user ? ['public', 'signed-in'] : ['public'];
      const snapshots = await Promise.all(accessLevels.map((accessLevel) => getDocs(query(
        loopCollection,
        where('isPublished', '==', true),
        where('accessLevel', '==', accessLevel)
      ))));
      loops = snapshots.flatMap((snapshot) => snapshot.docs.map((loopDoc) => ({ id: loopDoc.id, ...loopDoc.data() })));
    }
    loops.sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')));
    renderPracticeLoops(loops);
  } catch (error) {
    practiceLoopsStatus.textContent = 'Practice phrases could not be loaded.';
    console.error('Unable to load Raag practice phrases.', error);
  }
}

async function deletePracticeLoop(loop) {
  const user = auth.currentUser;
  if (!isAdmin || !user || (await user.getIdTokenResult(true)).claims.admin !== true) {
    practiceLoopsStatus.textContent = 'Administrator permission is required to delete practice phrases.';
    return;
  }
  if (!window.confirm(`Delete the practice phrase "${loop.title}"?`)) return;
  try {
    await deleteDoc(doc(db, 'raags', recordId, 'practiceLoops', loop.id));
    await deleteStoredAudio(loop.audioPath).catch((error) => console.error('Unable to delete phrase audio.', error));
    practiceLoopsStatus.textContent = 'Practice phrase deleted.';
    await loadPracticeLoops(user);
  } catch (error) {
    practiceLoopsStatus.textContent = error.message || 'Practice phrase could not be deleted.';
  }
}

addPracticeLoopButton.addEventListener('click', () => openPracticeLoopForm());
cancelPracticeLoopButton.addEventListener('click', () => {
  practiceLoopForm.reset();
  practiceLoopForm.hidden = true;
  editingLoop = null;
});

async function requireAdminUser(message) {
  const user = auth.currentUser;
  if (!isAdmin || !user || (await user.getIdTokenResult(true)).claims.admin !== true) {
    practiceLoopsStatus.textContent = message;
    return null;
  }
  return user;
}

practiceLoopForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = await requireAdminUser('Administrator permission is required to manage practice phrases.');
  if (!user) return;

  const formData = new FormData(practiceLoopForm);
  const title = String(formData.get('title') || '').trim();
  const accessLevel = String(formData.get('accessLevel') || '');
  const loopId = String(formData.get('loopId') || '');
  const isPublished = formData.get('isPublished') === 'on';
  const isAudioLoop = Boolean(loopId) && editingLoop?.sourceType === 'audio';
  if (!title || title.length > 80) {
    practiceLoopsStatus.textContent = 'Enter a phrase name up to 80 characters.';
    return;
  }
  if (!['public', 'signed-in'].includes(accessLevel)) {
    practiceLoopsStatus.textContent = 'Choose a valid access level.';
    return;
  }

  const loopData = { title, accessLevel, isPublished, updatedAt: serverTimestamp() };
  if (!isAudioLoop) {
    const videoId = parseYouTubeVideoId(String(formData.get('videoUrl') || ''));
    const startSeconds = parseLoopTime(String(formData.get('startTime') || ''));
    const endSeconds = parseLoopTime(String(formData.get('endTime') || ''));
    if (!videoId) {
      practiceLoopsStatus.textContent = 'Enter a valid YouTube video link.';
      return;
    }
    if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
      practiceLoopsStatus.textContent = 'Enter valid timestamps, with the end after the start.';
      return;
    }
    Object.assign(loopData, { sourceType: 'youtube', videoId, startSeconds, endSeconds });
  }

  const submitButton = practiceLoopForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  let previousAudioPath = '';
  try {
    if (loopId) {
      if (isAudioLoop) {
        const nextPath = raagLoopAudioPath(loopId, accessLevel, isPublished);
        if (nextPath !== editingLoop.audioPath) {
          const audioBlob = await fetchStoredAudio(storage, editingLoop.audioPath);
          await uploadBytes(ref(storage, nextPath), audioBlob, { contentType: 'audio/wav' });
          previousAudioPath = editingLoop.audioPath;
          loopData.audioPath = nextPath;
        }
      }
      await updateDoc(doc(db, 'raags', recordId, 'practiceLoops', loopId), loopData);
      await deleteStoredAudio(previousAudioPath).catch((error) => console.error('Unable to remove old phrase audio.', error));
    } else {
      await addDoc(collection(db, 'raags', recordId, 'practiceLoops'), {
        ...loopData,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
    }
    practiceLoopForm.reset();
    practiceLoopForm.hidden = true;
    editingLoop = null;
    practiceLoopsStatus.textContent = loopId ? 'Practice phrase updated.' : 'Practice phrase added.';
    await loadPracticeLoops(user);
  } catch (error) {
    practiceLoopsStatus.textContent = error.message || 'Practice phrase could not be saved.';
  } finally {
    submitButton.disabled = false;
  }
});

let adminSavedLoops = [];

addSavedLoopButton.addEventListener('click', async () => {
  const user = await requireAdminUser('Administrator permission is required to manage practice phrases.');
  if (!user) return;
  practiceLoopForm.hidden = true;
  editingLoop = null;
  practiceLoopsStatus.textContent = 'Loading your saved loops...';
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'practiceLoops'));
    const raagName = String(record?.name || '').trim().toLowerCase();
    adminSavedLoops = snapshot.docs.map((loopDoc) => ({ ...loopDoc.data(), id: loopDoc.id }))
      .sort((left, right) => {
        const leftMatch = raagName && String(left.raagName || '').trim().toLowerCase() === raagName ? 0 : 1;
        const rightMatch = raagName && String(right.raagName || '').trim().toLowerCase() === raagName ? 0 : 1;
        return leftMatch - rightMatch || (right.updatedAt || 0) - (left.updatedAt || 0);
      });
    if (!adminSavedLoops.length) {
      practiceLoopsStatus.textContent = 'You have no saved loops yet. Save loops on the Practice tab first.';
      return;
    }
    const select = savedLoopForm.elements.savedLoopId;
    select.replaceChildren(...adminSavedLoops.map((loop) => {
      const option = document.createElement('option');
      option.value = loop.id;
      option.textContent = [loop.name, loop.raagName && `Raag ${loop.raagName}`, loop.sourceType === 'audio' ? 'audio' : 'YouTube']
        .filter(Boolean).join(' · ');
      return option;
    }));
    savedLoopForm.reset();
    savedLoopForm.hidden = false;
    practiceLoopsStatus.textContent = 'Choose a saved loop to add to this Raag.';
  } catch (error) {
    console.error('Unable to load saved loops.', error);
    practiceLoopsStatus.textContent = 'Your saved loops could not be loaded.';
  }
});

cancelSavedLoopButton.addEventListener('click', () => {
  savedLoopForm.reset();
  savedLoopForm.hidden = true;
});

savedLoopForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = await requireAdminUser('Administrator permission is required to manage practice phrases.');
  if (!user) return;

  const formData = new FormData(savedLoopForm);
  const source = adminSavedLoops.find((loop) => loop.id === String(formData.get('savedLoopId') || ''));
  const title = String(formData.get('title') || '').trim() || String(source?.name || '').trim();
  const accessLevel = String(formData.get('accessLevel') || '');
  const isPublished = formData.get('isPublished') === 'on';
  if (!source) {
    practiceLoopsStatus.textContent = 'Choose a saved loop.';
    return;
  }
  if (!title || title.length > 80) {
    practiceLoopsStatus.textContent = 'Enter a phrase name up to 80 characters.';
    return;
  }
  if (!['public', 'signed-in'].includes(accessLevel)) {
    practiceLoopsStatus.textContent = 'Choose a valid access level.';
    return;
  }

  const submitButton = savedLoopForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const newLoopRef = doc(collection(db, 'raags', recordId, 'practiceLoops'));
  const loopData = {
    title,
    sourceType: source.sourceType === 'audio' ? 'audio' : 'youtube',
    startSeconds: source.startSeconds,
    endSeconds: source.endSeconds,
    accessLevel,
    isPublished,
    sourceLoopId: source.id,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  loopMetadataKeys.forEach((key) => {
    if (typeof source[key] === 'string' && source[key]) loopData[key] = source[key];
  });
  if (Array.isArray(source.tags) && source.tags.length) loopData.tags = source.tags.slice(0, 10);

  let uploadedPath = '';
  try {
    if (loopData.sourceType === 'audio') {
      practiceLoopsStatus.textContent = 'Copying audio...';
      const audioBlob = await fetchStoredAudio(storage, source.audioPath);
      uploadedPath = raagLoopAudioPath(newLoopRef.id, accessLevel, isPublished);
      await uploadBytes(ref(storage, uploadedPath), audioBlob, { contentType: 'audio/wav' });
      loopData.audioPath = uploadedPath;
    } else {
      loopData.videoId = source.videoId;
    }
    await setDoc(newLoopRef, loopData);
    savedLoopForm.reset();
    savedLoopForm.hidden = true;
    practiceLoopsStatus.textContent = 'Practice phrase added.';
    await loadPracticeLoops(user);
  } catch (error) {
    if (uploadedPath) await deleteStoredAudio(uploadedPath).catch(() => {});
    console.error('Unable to add practice phrase.', error);
    practiceLoopsStatus.textContent = `Practice phrase could not be added: ${error.code || error.message || 'unknown error'}`;
  } finally {
    submitButton.disabled = false;
  }
});

async function playTopicAudio(button, audioPath) {
  button.disabled = true;
  button.textContent = 'Loading...';
  try {
    const blob = await getBlob(ref(storage, audioPath));
    const audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
    button.textContent = 'Playing';
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audio.src);
      button.textContent = 'Play';
      button.disabled = false;
    });
  } catch {
    button.textContent = 'Unavailable';
    button.disabled = false;
  }
}

function formatJati(value) {
  const labels = { 3: '3-note', 4: '4-note', 5: 'Audav', 6: 'Shadav', 7: 'Sampurna' };
  return String(value).split('/').map((count) => labels[count] || `${count}-note`).join(' / ');
}

function formatSamay(value) {
  const normalized = String(value || '').toLowerCase();
  const prahar = normalized.match(/^prahar[- ]?(\d+)$/);
  if (prahar) return `Prahar ${prahar[1]}`;
  return value;
}

async function initialize(user) {
  currentUser = user;
  isAdmin = false;
  if (isEditing) {
    renderReadOnlyRecord();
    setEditing(false);
  }

  if (!recordId || !/^[a-zA-Z0-9_-]{1,120}$/.test(recordId)) {
    pageStatus.textContent = 'Invalid Raag record ID.';
    return;
  }
  try {
    const hasAdminClaim = Boolean(user && (await user.getIdTokenResult()).claims.admin === true);
    if (auth.currentUser?.uid !== user?.uid) return;
    isAdmin = hasAdminClaim;
    const snapshot = await getDoc(doc(db, 'raags', recordId));
    if (auth.currentUser?.uid !== user?.uid) return;
    if (!snapshot.exists()) {
      pageStatus.textContent = 'This Raag is unavailable or has not been published.';
      return;
    }
    record = { id: snapshot.id, ...snapshot.data() };
    renderPage();
  } catch (error) {
    pageStatus.textContent = error.message || 'This Raag is unavailable or could not be loaded.';
  }
}

editButton.addEventListener('click', () => {
  renderEditForm();
  setEditing(true);
  form.querySelector('input:not([readonly])')?.focus();
});
cancelButton.addEventListener('click', () => {
  renderEditForm();
  renderReadOnlyRecord();
  setEditing(false);
});
saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  try {
    await saveRecord(false);
  } catch (error) {
    feedback.textContent = error.message || 'Raag changes could not be saved.';
  } finally {
    saveButton.disabled = false;
  }
});
publishButton.addEventListener('click', async () => {
  publishButton.disabled = true;
  try {
    await saveRecord(true);
  } catch (error) {
    feedback.textContent = error.message || 'Raag could not be published.';
  } finally {
    publishButton.disabled = false;
  }
});

form.addEventListener('submit', (event) => event.preventDefault());
addTopicButton.addEventListener('click', () => { topicForm.hidden = false; });
cancelTopicButton.addEventListener('click', () => { topicForm.reset(); topicForm.hidden = true; });
topicForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!user || (await user.getIdTokenResult(true)).claims.admin !== true) {
    topicsStatus.textContent = 'Administrator permission is required to upload recordings.';
    return;
  }
  const formData = new FormData(topicForm);
  const file = formData.get('audio');
  if (!(file instanceof File) || file.type !== 'audio/mpeg') {
    topicsStatus.textContent = 'Choose an MP3 recording.';
    return;
  }
  const submitButton = topicForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const topicRef = await addDoc(collection(db, 'raags', recordId, 'topics'), {
      title: String(formData.get('title') || ''),
      text: String(formData.get('text') || ''),
      requiresLogin: formData.get('requiresLogin') === 'on',
      orderIndex: Number(formData.get('orderIndex'))
    });
    const audioPath = `audio/${topicRef.id}.mp3`;
    await uploadBytes(ref(storage, audioPath), file, { contentType: 'audio/mpeg' });
    await updateDoc(topicRef, { audioPath });
    topicForm.reset();
    topicForm.hidden = true;
    topicsStatus.textContent = 'Recording added.';
    await loadTopics();
  } catch (error) {
    topicsStatus.textContent = error.message || 'Recording upload failed.';
  } finally {
    submitButton.disabled = false;
  }
});
onAuthStateChanged(auth, initialize);