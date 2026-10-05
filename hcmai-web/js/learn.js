import { collection, addDoc, doc, getDocs, getFirestore, orderBy, query, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getBlob, getStorage, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { auth } from './auth.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { fetchAccessibleRaags } from './raag-data.js';

const db = getFirestore();
const storage = getStorage();
const grid = document.getElementById('raagGrid');
const searchInput = document.getElementById('raagSearch');
const importRaagsButton = document.getElementById('importRaagsButton');
const exportRaagsButton = document.getElementById('exportRaagsButton');
const importRaagsFile = document.getElementById('importRaagsFile');
const importRaagSourcesButton = document.getElementById('importRaagSourcesButton');
const exportRaagSourcesButton = document.getElementById('exportRaagSourcesButton');
const importRaagSourcesFile = document.getElementById('importRaagSourcesFile');
const filterForm = document.getElementById('raagFilterForm');
const jatiFilter = document.getElementById('raagJatiFilter');
const thaatFilter = document.getElementById('raagThaatFilter');
const timeFilter = document.getElementById('raagTimeFilter');
const recordStatusFilter = document.getElementById('raagStatusFilter');
const status = document.getElementById('raagStatus');
let allRaags = [];
let isAdminViewer = false;

function formatCatalogType(catalogType = '') {
  const labels = {
    'named-raag-candidate': 'Named Raag candidate',
    'dunya-hindustani-raag': 'Dunya catalog entry'
  };
  return labels[catalogType] || catalogType.replaceAll('-', ' ');
}

function formatJatiValue(value) {
  const countLabels = { 3: '3-note', 4: '4-note', 5: 'Audav', 6: 'Shadav', 7: 'Sampurna' };
  const counts = String(value || '').split('/');
  if (counts.length !== 2) return String(value || '');
  return counts.map((count) => countLabels[count] || `${count}-note`).join(' / ');
}

function formatSamayValue(value) {
  const labels = {
    'sarva-kaaleen': 'All times (Sarva-kaaleen)',
    vasant: 'Spring (Vasant)',
    greeshma: 'Summer (Greeshma)',
    varshaa: 'Rainy season (Varshaa)',
    sharad: 'Autumn (Sharad)',
    hemant: 'Early winter (Hemant)',
    shishir: 'Winter (Shishir)',
    other: 'Other source label',
    special: 'Special source label'
  };
  const normalized = String(value || '').trim().toLowerCase();
  const prahar = normalized.match(/^prahar[- ]?(\d+)$/);
  if (prahar) return `Prahar ${prahar[1]} (source label)`;
  return labels[normalized] || String(value || '');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderRaags(raags) {
  if (!grid) return;
  grid.replaceChildren();
  if (!raags.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = allRaags.length ? 'No raags match these filters.' : 'No raags have been published to the library yet.';
    grid.append(empty);
    return;
  }

  raags.forEach((raag) => {
    const article = document.createElement('article');
    article.className = 'music-card raag-card';
    const button = document.createElement('button');
    button.className = 'card-open';
    button.type = 'button';

    const badge = document.createElement('span');
    badge.className = 'card-badge accent';
    badge.textContent = raag.name;
    const recordStatus = document.createElement('span');
    recordStatus.className = raag.isPublished ? 'raag-record-status published' : 'raag-record-status candidate';
    recordStatus.textContent = raag.isPublished ? 'Published' : `${raag.sourceName || 'Source'} candidate`;
    const heading = document.createElement('h3');
    heading.textContent = raag.thaat ? `${raag.thaat} thaat` : 'Raag details';
    const jati = document.createElement('p');
    jati.textContent = `Jati: ${raag.jati || 'Not recorded'}`;
    const meta = document.createElement('div');
    meta.className = 'meta-row';
    const time = document.createElement('span');
    time.textContent = raag.timeOfDay || 'Time not recorded';
    const prahar = document.createElement('span');
    prahar.textContent = raag.prahar ? `Prahar ${raag.prahar}` : 'Prahar not recorded';
    const source = document.createElement('span');
    source.textContent = formatCatalogType(raag.catalogType || 'Traditional Raag record');
    meta.append(time, prahar, source);
    button.append(badge, recordStatus, heading, jati, meta);
    button.addEventListener('click', () => openRaagDetail(raag));
    article.append(button);
    grid.append(article);
  });
}

function filterRaags() {
  const search = searchInput?.value.trim().toLowerCase() || '';
  const selectedJati = jatiFilter?.value.toLowerCase() || '';
  const selectedThaat = thaatFilter?.value.toLowerCase() || '';
  const selectedTime = timeFilter?.value.toLowerCase() || '';
  const selectedStatus = recordStatusFilter?.value || 'all';
  const filtered = allRaags.filter((raag) => {
    const searchable = [
      raag.name, raag.nameHindi, ...(raag.aliases || []), raag.description, raag.thaat, raag.jati,
      raag.sourceName, raag.catalogType,
      raag.timeOfDay, raag.prahar, raag.aroha, raag.avaroha, raag.pakad,
      raag.vadi, raag.samvadi, raag.rasa, ...(raag.swaras || []),
      ...(raag.komalSwaras || []), ...(raag.teevraSwaras || [])
    ].join(' ').toLowerCase();
    return searchable.includes(search)
      && (!selectedJati || String(raag.jati || '').toLowerCase() === selectedJati)
      && (!selectedThaat || String(raag.thaat || '').toLowerCase() === selectedThaat)
      && (!selectedTime || (selectedTime === '__missing__'
        ? !String(raag.timeOfDay || '').trim()
        : String(raag.timeOfDay || '').trim().toLowerCase() === selectedTime))
      && (selectedStatus === 'all'
        || (selectedStatus === 'published' && raag.isPublished === true)
        || (selectedStatus === 'draft' && raag.isPublished !== true));
  });

  renderRaags(filtered);
  if (status) status.textContent = `${filtered.length} of ${allRaags.length} ${isAdminViewer ? 'Raag records' : 'published raags'}`;
}

async function loadRaags(user = auth.currentUser) {
  if (!grid) return;
  status.textContent = 'Loading the live raag library...';
  try {
    const result = await fetchAccessibleRaags(user);
    allRaags = result.raags;
    isAdminViewer = result.isAdmin;
    const draftOption = recordStatusFilter?.querySelector('option[value="draft"]');
    if (draftOption) draftOption.hidden = !isAdminViewer;
    if (!isAdminViewer && recordStatusFilter) recordStatusFilter.value = 'published';
    const jatis = [...new Set(allRaags.map((raag) => String(raag.jati || '').trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    jatiFilter?.replaceChildren(new Option('Any', ''), ...jatis.map((jati) => new Option(`${jati} · ${formatJatiValue(jati)}`, jati.toLowerCase())));
    const thaats = [...new Set(allRaags.map((raag) => raag.thaat).filter(Boolean))].sort();
    thaatFilter?.replaceChildren(new Option('Any', ''), ...thaats.map((thaat) => new Option(thaat, thaat)));
    const samays = [...new Set(allRaags.map((raag) => String(raag.timeOfDay || '').trim()).filter(Boolean))].sort();
    timeFilter?.replaceChildren(
      new Option('Any recorded time', ''),
      ...samays.map((samay) => new Option(formatSamayValue(samay), samay.toLowerCase())),
      new Option('Not recorded', '__missing__')
    );
    const requestedThaat = new URLSearchParams(window.location.search).get('thaat');
    if (requestedThaat && thaatFilter && thaats.some((thaat) => thaat.toLocaleLowerCase() === requestedThaat.toLocaleLowerCase())) {
      thaatFilter.value = thaats.find((thaat) => thaat.toLocaleLowerCase() === requestedThaat.toLocaleLowerCase());
    }
    filterRaags();
  } catch (error) {
    allRaags = [];
    renderRaags([]);
    status.textContent = 'The raag library could not be loaded.';
    console.error('Unable to load raags.', error);
  }
}

function openRaagDetail(raag) {
  if (!raag) return;
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  const sheet = document.createElement('div');
  sheet.className = 'auth-sheet raag-detail-sheet';
  const header = document.createElement('div');
  header.className = 'auth-header';
  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Raag study';
  const title = document.createElement('h3');
  title.textContent = raag.name;
  titleBlock.append(eyebrow, title);
  const closeButton = document.createElement('button');
  closeButton.className = 'close-auth';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close Raag details');
  closeButton.textContent = '✕';
  header.append(titleBlock, closeButton);
  sheet.append(header);

  if (raag.description) {
    const description = document.createElement('p');
    description.className = 'raag-description';
    description.textContent = raag.description;
    sheet.append(description);
  }

  const factGrid = document.createElement('dl');
  factGrid.className = 'raag-detail-facts';
  const facts = [
    ['Record status', raag.isPublished ? 'Published' : 'Unpublished source candidate'],
    ['Source type', raag.catalogType], ['Thaat', raag.thaat], ['Jati', raag.jati], ['Time', raag.timeOfDay],
    ['Prahar', raag.prahar], ['Tradition', raag.tradition],
    ['Aroha note count', raag.ascendingNoteCount], ['Avaroha note count', raag.descendingNoteCount],
    ['Vadi', raag.vadi], ['Samvadi', raag.samvadi],
    ['Rasa', raag.rasa],
    ['Aliases', Array.isArray(raag.aliases) ? raag.aliases.join(', ') : raag.aliases],
    ['Name in Devanagari', raag.nameHindi],
    ['Swaras', Array.isArray(raag.swaras) ? raag.swaras.join(', ') : raag.swaras],
    ['Komal swaras', Array.isArray(raag.komalSwaras) ? raag.komalSwaras.join(', ') : raag.komalSwaras],
    ['Teevra swaras', Array.isArray(raag.teevraSwaras) ? raag.teevraSwaras.join(', ') : raag.teevraSwaras],
    ['Nyas swaras', Array.isArray(raag.nyasSwaras) ? raag.nyasSwaras.join(', ') : raag.nyasSwaras],
    ['Varjit swaras', Array.isArray(raag.varjitSwaras) ? raag.varjitSwaras.join(', ') : raag.varjitSwaras]
  ];
  facts.forEach(([label, value]) => {
    if (value === undefined || value === null || value === '') return;
    const group = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = String(value);
    group.append(term, detail);
    factGrid.append(group);
  });
  if (factGrid.childElementCount) sheet.append(factGrid);

  const notation = document.createElement('div');
  notation.className = 'raag-notation';
  [['Aroha', raag.aroha], ['Avaroha', raag.avaroha], ['Pakad', raag.pakad]].forEach(([label, value]) => {
    if (!value) return;
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = label;
    const notationText = document.createElement('p');
    notationText.textContent = value;
    section.append(heading, notationText);
    notation.append(section);
  });
  if (notation.childElementCount) sheet.append(notation);

  if (raag.sourceName || raag.sourceUrl || raag.license || raag.verifiedAt) {
    const attribution = document.createElement('p');
    attribution.className = 'raag-attribution';
    attribution.textContent = [raag.sourceName, raag.license, raag.verifiedAt ? `Verified ${raag.verifiedAt}` : '']
      .filter(Boolean).join(' · ');
    if (raag.sourceUrl && /^https:\/\//i.test(raag.sourceUrl)) {
      const sourceLink = document.createElement('a');
      sourceLink.href = raag.sourceUrl;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = 'Source';
      attribution.append(' ', sourceLink);
    }
    sheet.append(attribution);
  }

  const topics = document.createElement('div');
  topics.className = 'topic-list';
  const topicsHeading = document.createElement('p');
  topicsHeading.className = 'eyebrow';
  topicsHeading.textContent = 'Recordings and topics';
  const topicsStatus = document.createElement('p');
  topicsStatus.className = 'topic-status';
  topicsStatus.textContent = 'Sign in to load protected recordings.';
  topics.append(topicsHeading, topicsStatus);
  sheet.append(topics);
  modal.append(sheet);
  document.body.appendChild(modal);
  closeButton.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
  loadTopics(raag, topics);
}

async function loadTopics(raag, target) {
  if (!raag.id || !target) return;
  if (!auth.currentUser) {
    target.querySelector('.topic-status').textContent = 'Log in to access recordings and protected topics.';
    return;
  }
  try {
    const topicQuery = query(collection(db, 'raags', raag.id, 'topics'), orderBy('orderIndex'));
    const snapshot = await getDocs(topicQuery);
    const isAdmin = (await auth.currentUser.getIdTokenResult()).claims.admin === true;
    target.innerHTML = `${isAdmin ? '<button class="secondary-btn small add-topic-button" type="button">+ Add recording</button>' : ''}${snapshot.empty ? '<p class="topic-status">No recordings uploaded yet.</p>' : snapshot.docs.map((document) => {
      const topic = { id: document.id, ...document.data() };
      return `<article class="topic-row"><div><strong>${escapeHtml(topic.title)}</strong><p>${escapeHtml(topic.text || '')}</p></div>${topic.audioPath ? `<button class="secondary-btn small topic-play" type="button" data-audio-path="${escapeHtml(topic.audioPath)}">Play</button>` : ''}</article>`;
    }).join('')}`;
    target.querySelectorAll('.topic-play').forEach((button) => button.addEventListener('click', () => playProtectedAudio(button)));
    target.querySelector('.add-topic-button')?.addEventListener('click', () => openAddTopic(raag, target));
  } catch (error) {
    target.querySelector('.topic-status').textContent = 'Topics could not be loaded.';
    console.error('Unable to load topics.', error);
  }
}

function openAddTopic(raag, target) {
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.innerHTML = `<div class="auth-sheet"><div class="auth-header"><h3>Add Recording</h3><button class="close-auth" type="button">✕</button></div><form class="auth-form" id="add-topic-form"><label><span>Topic</span><select name="title"><option>Intro</option><option>Alankars</option><option>Palta</option><option>Sargam Geet</option><option>Bandish</option><option>Tarana</option></select></label><label><span>Text</span><textarea name="text" rows="4"></textarea></label><label><span>Audio MP3</span><input name="audio" type="file" accept="audio/mpeg" required></label><label><span>Order</span><input name="orderIndex" type="number" min="1" max="10" value="1" required></label><label class="check-row"><input name="requiresLogin" type="checkbox" checked> <span>Require login to play</span></label><button class="primary-btn" type="submit">Upload recording</button></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close-auth').addEventListener('click', () => modal.remove());
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('audio');
    if (!(file instanceof File) || file.type !== 'audio/mpeg') return;
    const topicRef = await addDoc(collection(db, 'raags', raag.id, 'topics'), { title: form.get('title'), text: form.get('text'), requiresLogin: form.get('requiresLogin') === 'on', orderIndex: Number(form.get('orderIndex')) });
    const audioPath = `audio/${topicRef.id}.mp3`;
    await uploadBytes(ref(storage, audioPath), file, { contentType: 'audio/mpeg' });
    await updateDoc(doc(db, 'raags', raag.id, 'topics', topicRef.id), { audioPath });
    modal.remove();
    loadTopics(raag, target);
  });
}

async function playProtectedAudio(button) {
  button.disabled = true;
  button.textContent = 'Loading...';
  try {
    const blob = await getBlob(ref(storage, button.dataset.audioPath));
    const audio = new Audio(URL.createObjectURL(blob));
    audio.play();
    button.textContent = 'Playing';
    audio.addEventListener('ended', () => { URL.revokeObjectURL(audio.src); button.textContent = 'Play'; button.disabled = false; });
  } catch (error) {
    button.textContent = 'Unavailable';
    console.error('Unable to play protected audio.', error);
  }
}

function openAddRaag() {
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.innerHTML = `<div class="auth-sheet raag-entry-sheet"><div class="auth-header"><h3>New Raag record</h3><button class="close-auth" type="button" aria-label="Close">✕</button></div><form class="auth-form" id="add-raag-form">
    <label><span>Name</span><input name="name" required></label>
    <label><span>Name in Devanagari</span><input name="nameHindi"></label>
    <label><span>Aliases (comma-separated)</span><input name="aliases"></label>
    <label><span>Thaat</span><input name="thaat"></label>
    <label><span>Jati</span><input name="jati" placeholder="e.g. Audav-Sampurna"></label>
    <label><span>Tradition / lineage</span><input name="tradition"></label>
    <label><span>Time of day</span><input name="timeOfDay" placeholder="e.g. Early morning"></label>
    <label><span>Prahar (1-8)</span><input name="prahar" type="number" min="1" max="8"></label>
    <label><span>Aroha note count</span><input name="ascendingNoteCount" type="number" min="1" max="12"></label>
    <label><span>Avaroha note count</span><input name="descendingNoteCount" type="number" min="1" max="12"></label>
    <label><span>Aroha</span><textarea name="aroha" rows="2"></textarea></label>
    <label><span>Avaroha</span><textarea name="avaroha" rows="2"></textarea></label>
    <label><span>Pakad</span><textarea name="pakad" rows="2"></textarea></label>
    <label><span>Vadi</span><input name="vadi"></label>
    <label><span>Samvadi</span><input name="samvadi"></label>
    <label><span>Swara set (comma-separated)</span><input name="swaras" placeholder="S, R, G, M, P, D, N"></label>
    <label><span>Komal swaras (comma-separated)</span><input name="komalSwaras"></label>
    <label><span>Teevra swaras (comma-separated)</span><input name="teevraSwaras"></label>
    <label><span>Nyas swaras (comma-separated)</span><input name="nyasSwaras"></label>
    <label><span>Varjit swaras (comma-separated)</span><input name="varjitSwaras"></label>
    <label><span>Rasa or mood</span><input name="rasa"></label>
    <label><span>Notes</span><textarea name="description" rows="3"></textarea></label>
    <label><span>Source name</span><input name="sourceName" placeholder="HCMAI original, licensed source, etc."></label>
    <label><span>Source URL</span><input name="sourceUrl" type="url"></label>
    <label><span>License / permission</span><input name="license" placeholder="Public domain, CC BY, permission reference, etc."></label>
    <label><span>Verified date</span><input name="verifiedAt" type="date"></label>
    <label class="check-row"><input name="isPublished" type="checkbox"> <span>Publish to directory</span></label>
    <button class="primary-btn" type="submit">Save Raag record</button>
  </form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close-auth').addEventListener('click', () => modal.remove());
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const listField = (name) => String(form.get(name) || '').split(',').map((value) => value.trim()).filter(Boolean);
    const sequenceField = (name) => String(form.get(name) || '').trim().split(/[\s,]+/).filter(Boolean);
    const countField = (name) => String(form.get(name) || '').trim() ? Number(form.get(name)) : null;
    const praharText = String(form.get('prahar') || '').trim();
    const data = {
      name: String(form.get('name') || '').trim(),
      nameHindi: String(form.get('nameHindi') || '').trim(),
      aliases: listField('aliases'),
      thaat: String(form.get('thaat') || '').trim(),
      jati: String(form.get('jati') || '').trim(),
      tradition: String(form.get('tradition') || '').trim(),
      timeOfDay: String(form.get('timeOfDay') || '').trim(),
      prahar: praharText ? Number(praharText) : null,
      aroha: String(form.get('aroha') || '').trim(),
      arohaNotes: sequenceField('aroha'),
      ascendingNoteCount: countField('ascendingNoteCount'),
      avaroha: String(form.get('avaroha') || '').trim(),
      avarohaNotes: sequenceField('avaroha'),
      descendingNoteCount: countField('descendingNoteCount'),
      pakad: String(form.get('pakad') || '').trim(),
      pakadNotes: sequenceField('pakad'),
      vadi: String(form.get('vadi') || '').trim(),
      samvadi: String(form.get('samvadi') || '').trim(),
      swaras: listField('swaras'),
      komalSwaras: listField('komalSwaras'),
      teevraSwaras: listField('teevraSwaras'),
      nyasSwaras: listField('nyasSwaras'),
      varjitSwaras: listField('varjitSwaras'),
      rasa: String(form.get('rasa') || '').trim(),
      description: String(form.get('description') || '').trim(),
      sourceName: String(form.get('sourceName') || '').trim(),
      sourceUrl: String(form.get('sourceUrl') || '').trim(),
      license: String(form.get('license') || '').trim(),
      verifiedAt: String(form.get('verifiedAt') || '').trim(),
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      isPublished: form.get('isPublished') === 'on'
    };
    try {
      await addDoc(collection(db, 'raags'), data);
      modal.remove();
      await loadRaags();
    } catch (error) {
      alert('Firebase rejected this change. Check admin claims and deployed rules.');
      console.error('Unable to save Raag.', error);
    }
  });
}

function normalizeFirestoreValue(value, nestedArray = false) {
  if (Array.isArray(value)) {
    const values = value.map((item) => normalizeFirestoreValue(item, true));
    return nestedArray ? { __hcmaiArrayValues: values } : values;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeFirestoreValue(item)]));
  }
  return value;
}

function parseRaagImportRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Every imported Raag must be a JSON object.');
  }
  const listField = (value) => Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const sequenceField = (value) => Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : String(value || '').trim().split(/[\s,]+/).filter(Boolean);
  const name = String(record.name || '').trim();
  const sourceName = String(record.sourceName || '').trim();
  const license = String(record.license || '').trim();
  if (!name) throw new Error('Each Raag record needs a name.');
  if (!sourceName || !license) throw new Error(`${name} needs sourceName and license fields for provenance.`);

  const sourceUrl = String(record.sourceUrl || '').trim();
  if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) {
    throw new Error(`${name} has a non-HTTPS sourceUrl.`);
  }

  const prahar = record.prahar === '' || record.prahar === undefined || record.prahar === null
    ? null
    : Number(record.prahar);
  if (prahar !== null && (!Number.isInteger(prahar) || prahar < 1 || prahar > 8)) {
    throw new Error(`${name} has an invalid prahar; use an integer from 1 to 8.`);
  }
  const parseNoteCount = (value, fieldName) => {
    if (value === '' || value === undefined || value === null) return null;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 12) {
      throw new Error(`${name} has an invalid ${fieldName}; use an integer from 1 to 12.`);
    }
    return count;
  };

  return {
    id: String(record.id || '').trim(),
    name,
    nameHindi: String(record.nameHindi || '').trim(),
    aliases: listField(record.aliases),
    thaat: String(record.thaat || '').trim(),
    jati: String(record.jati || '').trim(),
    tradition: String(record.tradition || '').trim(),
    timeOfDay: String(record.timeOfDay || '').trim(),
    prahar,
    aroha: String(record.aroha || '').trim(),
    arohaNotes: sequenceField(record.arohaNotes || record.aroha),
    ascendingNoteCount: parseNoteCount(record.ascendingNoteCount, 'ascendingNoteCount'),
    avaroha: String(record.avaroha || '').trim(),
    avarohaNotes: sequenceField(record.avarohaNotes || record.avaroha),
    descendingNoteCount: parseNoteCount(record.descendingNoteCount, 'descendingNoteCount'),
    pakad: String(record.pakad || '').trim(),
    pakadNotes: sequenceField(record.pakadNotes || record.pakad),
    vadi: String(record.vadi || '').trim(),
    samvadi: String(record.samvadi || '').trim(),
    swaras: listField(record.swaras),
    komalSwaras: listField(record.komalSwaras),
    teevraSwaras: listField(record.teevraSwaras),
    nyasSwaras: listField(record.nyasSwaras),
    varjitSwaras: listField(record.varjitSwaras),
    rasa: String(record.rasa || '').trim(),
    description: String(record.description || '').trim(),
    sourceName,
    sourceUrl,
    license,
    catalogType: String(record.catalogType || 'traditional-raag-candidate').trim(),
    sourceRecordId: String(record.sourceRecordId || '').trim(),
    sourceConfidence: record.sourceConfidence === undefined ? null : Number(record.sourceConfidence),
    sourceData: record.sourceData && typeof record.sourceData === 'object' ? normalizeFirestoreValue(record.sourceData) : {},
    verifiedAt: String(record.verifiedAt || '').trim(),
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    isPublished: record.isPublished === true
  };
}

function getRaagDocumentId(raag) {
  const suppliedId = String(raag.id || '').trim();
  if (suppliedId && /^[a-zA-Z0-9_-]{1,120}$/.test(suppliedId)) return suppliedId;
  const slug = `${raag.name}-${raag.thaat || 'raag'}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  if (!slug) throw new Error(`Could not create a document id for ${raag.name}.`);
  return slug;
}

async function importRaagJson(file) {
  const parsed = JSON.parse(await file.text());
  const records = Array.isArray(parsed) ? parsed : parsed.raags;
  if (!Array.isArray(records) || !records.length) {
    throw new Error('The JSON file must contain a non-empty array or a {"raags": [...]} object.');
  }

  const normalized = records.map(parseRaagImportRecord);
  for (let offset = 0; offset < normalized.length; offset += 400) {
    const batch = writeBatch(db);
    normalized.slice(offset, offset + 400).forEach((raag) => {
      batch.set(doc(db, 'raags', getRaagDocumentId(raag)), raag, { merge: true });
    });
    await batch.commit();
  }
  const expectedSourceDocumentIds = new Map(normalized
    .filter((raag) => raag.sourceName && raag.sourceRecordId)
    .map((raag) => [JSON.stringify([raag.sourceName, raag.sourceRecordId]), getRaagDocumentId(raag)]));
  let cleanedLegacy = 0;
  if (expectedSourceDocumentIds.size) {
    const existing = await getDocs(collection(db, 'raags'));
    const legacyDocuments = existing.docs.filter((document) => {
      const record = document.data();
      const expectedId = expectedSourceDocumentIds.get(JSON.stringify([record.sourceName, record.sourceRecordId]));
      return expectedId && document.id !== expectedId && record.isPublished !== true;
    });
    for (let offset = 0; offset < legacyDocuments.length; offset += 400) {
      const batch = writeBatch(db);
      legacyDocuments.slice(offset, offset + 400).forEach((document) => batch.delete(document.ref));
      await batch.commit();
      cleanedLegacy += legacyDocuments.slice(offset, offset + 400).length;
    }
  }
  return {
    imported: normalized.length,
    published: normalized.filter((raag) => raag.isPublished).length,
    cleanedLegacy
  };
}

importRaagsButton?.addEventListener('click', () => importRaagsFile?.click());
importRaagsFile?.addEventListener('change', async () => {
  const file = importRaagsFile.files?.[0];
  if (!file) return;
  try {
    const result = await importRaagJson(file);
    await loadRaags();
    status.textContent = `Imported ${result.imported} Raag records; ${result.published} were marked for publication; cleaned ${result.cleanedLegacy} legacy source IDs.`;
  } catch (error) {
    status.textContent = error.message || 'The Raag JSON file could not be imported.';
  } finally {
    importRaagsFile.value = '';
  }
});

function parseRaagSourceRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Every source record must be a JSON object.');
  }
  const id = String(record.id || '').trim();
  const sourceName = String(record.sourceName || '').trim();
  const license = String(record.license || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new Error('Every source record needs a stable alphanumeric id.');
  if (!sourceName || !license) throw new Error(`${id} needs sourceName and license fields.`);
  const sourceUrl = String(record.sourceUrl || '').trim();
  if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) throw new Error(`${id} has a non-HTTPS sourceUrl.`);
  return {
    sourceRecordId: String(record.sourceRecordId || id),
    sourceName,
    sourceUrl,
    license,
    catalogType: String(record.catalogType || 'source-record'),
    displayName: String(record.displayName || '').trim(),
    importedAt: new Date().toISOString(),
    sourceData: record.sourceData && typeof record.sourceData === 'object' ? normalizeFirestoreValue(record.sourceData) : {}
  };
}

async function importRaagSourceJson(file) {
  const parsed = JSON.parse(await file.text());
  const records = Array.isArray(parsed) ? parsed : parsed.sourceRecords;
  if (!Array.isArray(records) || !records.length) {
    throw new Error('The source JSON must contain a non-empty array or a {"sourceRecords": [...]} object.');
  }
  const normalized = records.map((record) => ({ id: String(record.id), data: parseRaagSourceRecord(record) }));
  for (let offset = 0; offset < normalized.length; offset += 400) {
    const batch = writeBatch(db);
    normalized.slice(offset, offset + 400).forEach(({ id, data }) => {
      batch.set(doc(db, 'raagSourceRecords', id), data, { merge: true });
    });
    await batch.commit();
  }
  return normalized.length;
}

importRaagSourcesButton?.addEventListener('click', () => importRaagSourcesFile?.click());
importRaagSourcesFile?.addEventListener('change', async () => {
  const file = importRaagSourcesFile.files?.[0];
  if (!file) return;
  try {
    const imported = await importRaagSourceJson(file);
    status.textContent = `Imported ${imported} source records as admin-only provenance data.`;
  } catch (error) {
    status.textContent = error.message || 'The source data could not be imported.';
  } finally {
    importRaagSourcesFile.value = '';
  }
});

exportRaagsButton?.addEventListener('click', async () => {
  exportRaagsButton.disabled = true;
  try {
    const snapshot = await getDocs(collection(db, 'raags'));
    const records = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, raags: records }, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'hcmai-raags.json';
    link.click();
    URL.revokeObjectURL(objectUrl);
    status.textContent = `Exported ${records.length} Raag records.`;
  } catch (error) {
    status.textContent = error.message || 'The Raag library could not be exported.';
  } finally {
    exportRaagsButton.disabled = false;
  }
});

exportRaagSourcesButton?.addEventListener('click', async () => {
  exportRaagSourcesButton.disabled = true;
  try {
    const snapshot = await getDocs(collection(db, 'raagSourceRecords'));
    const sourceRecords = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, sourceRecords }, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'hcmai-raag-source-records.json';
    link.click();
    URL.revokeObjectURL(objectUrl);
    status.textContent = `Exported ${sourceRecords.length} source records.`;
  } catch (error) {
    status.textContent = error.message || 'The source data could not be exported.';
  } finally {
    exportRaagSourcesButton.disabled = false;
  }
});

searchInput?.addEventListener('input', filterRaags);
jatiFilter?.addEventListener('change', filterRaags);
thaatFilter?.addEventListener('change', filterRaags);
timeFilter?.addEventListener('change', filterRaags);
recordStatusFilter?.addEventListener('change', filterRaags);
filterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  filterRaags();
});
document.querySelector('[data-admin-only]')?.addEventListener('click', openAddRaag);
onAuthStateChanged(auth, (user) => loadRaags(user));