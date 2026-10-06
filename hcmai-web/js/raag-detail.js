import { addDoc, collection, doc, getDoc, getDocs, getFirestore, orderBy, query, updateDoc } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getBlob, getStorage, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';

const db = getFirestore();
const storage = getStorage();
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
const editButton = document.getElementById('editRaagDetails');
const saveButton = document.getElementById('saveRaagDraft');
const publishButton = document.getElementById('publishRaag');
const cancelButton = document.getElementById('cancelRaagEdit');

let record = null;
let isAdmin = false;
let isEditing = false;

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
  if (!recordId || !/^[a-zA-Z0-9_-]{1,120}$/.test(recordId)) {
    pageStatus.textContent = 'Invalid Raag record ID.';
    return;
  }
  try {
    isAdmin = Boolean(user && (await user.getIdTokenResult()).claims.admin === true);
    const snapshot = await getDoc(doc(db, 'raags', recordId));
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