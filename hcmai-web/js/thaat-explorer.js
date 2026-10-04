import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';
import { fetchAccessibleRaags } from './raag-data.js';

const grid = document.getElementById('thaatGrid');
const searchInput = document.getElementById('thaatSearch');
const statusFilter = document.getElementById('thaatStatusFilter');
const status = document.getElementById('thaatStatus');
let allRaags = [];
let isAdminViewer = false;

function renderThaats() {
  if (!grid) return;
  const search = searchInput.value.trim().toLocaleLowerCase();
  const recordStatus = statusFilter.value;
  const grouped = new Map();

  allRaags.forEach((raag) => {
    const thaat = String(raag.thaat || '').trim();
    if (!thaat) return;
    if (recordStatus === 'published' && raag.isPublished !== true) return;
    if (recordStatus === 'draft' && raag.isPublished === true) return;
    const key = thaat.toLocaleLowerCase();
    if (!grouped.has(key)) grouped.set(key, { name: thaat, raags: [] });
    grouped.get(key).raags.push(raag);
  });

  const thaats = [...grouped.values()]
    .filter((group) => !search || `${group.name} ${group.raags.map((raag) => `${raag.name} ${raag.sourceName || ''}`).join(' ')}`.toLocaleLowerCase().includes(search))
    .sort((left, right) => left.name.localeCompare(right.name));

  grid.replaceChildren();
  if (!thaats.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = allRaags.length ? 'No Thaats with Raag records match this search.' : 'No published Raag records with Thaat data are available.';
    grid.appendChild(empty);
  }

  thaats.forEach((group) => {
    const published = group.raags.filter((raag) => raag.isPublished === true).length;
    const candidates = group.raags.length - published;
    const names = group.raags.slice(0, 8).map((raag) => raag.name).filter(Boolean);
    const more = Math.max(0, group.raags.length - names.length);
    const card = document.createElement('a');
    card.className = 'thaat-card';
    card.href = `raag-explorer.html?thaat=${encodeURIComponent(group.name)}`;

    const header = document.createElement('div');
    header.className = 'thaat-header';
    const badge = document.createElement('span');
    badge.className = 'thaat-badge';
    badge.textContent = `${group.raags.length} Raag records`;
    const source = document.createElement('span');
    source.className = 'thaat-source-note';
    source.textContent = `${published} published · ${candidates} candidates`;
    header.append(badge, source);

    const title = document.createElement('h2');
    title.textContent = group.name;
    const raagList = document.createElement('p');
    raagList.textContent = `Raags: ${names.join(', ')}${more ? `, and ${more} more` : ''}`;
    const note = document.createElement('p');
    note.className = 'thaat-source-note';
    note.textContent = isAdminViewer && candidates ? 'Includes unpublished source candidates; click to review records.' : 'Source-linked Raag records; click to explore.';
    card.append(header, title, raagList, note);
    grid.appendChild(card);
  });

  status.textContent = `${thaats.length} Thaats across ${allRaags.length} accessible Raag records${isAdminViewer ? ' (published and source candidates)' : ' (published only)'}.`;
}

async function loadThaats(user) {
  status.textContent = 'Loading Thaats from the Raag library...';
  try {
    const result = await fetchAccessibleRaags(user);
    allRaags = result.raags;
    isAdminViewer = result.isAdmin;
    const draftOption = statusFilter.querySelector('option[value="draft"]');
    if (draftOption) draftOption.hidden = !isAdminViewer;
    if (!isAdminViewer) statusFilter.value = 'published';
    renderThaats();
  } catch (error) {
    allRaags = [];
    grid.replaceChildren();
    status.textContent = error.message || 'The Thaat library could not be loaded.';
  }
}

searchInput.addEventListener('input', renderThaats);
statusFilter.addEventListener('change', renderThaats);
onAuthStateChanged(auth, loadThaats);