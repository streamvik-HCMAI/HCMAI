import { collection, doc, getDocs, getFirestore, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { auth } from './auth.js';

const db = getFirestore();
const pageSize = 40;
const lab = document.getElementById('compositionLab');
const status = document.getElementById('compositionDatasetStatus');
const importButton = document.getElementById('importCompositionDatasets');
const exportButton = document.getElementById('exportCompositionDataset');
const fileInput = document.getElementById('compositionDatasetFiles');
const datasetSelect = document.getElementById('compositionDatasetSelect');
const datasetMeta = document.getElementById('compositionDatasetMeta');
const searchInput = document.getElementById('compositionSearch');
const statsContainer = document.getElementById('compositionFieldStats');
const table = document.getElementById('compositionRecordsTable');
const rowCount = document.getElementById('compositionRowCount');
const pageLabel = document.getElementById('compositionPageLabel');
const detail = document.getElementById('compositionRecordDetail');
const previousButton = document.getElementById('compositionPreviousPage');
const nextButton = document.getElementById('compositionNextPage');

let manifests = [];
let records = [];
let filteredRecords = [];
let currentManifest = null;
let currentPage = 0;

function setStatus(message) {
  status.textContent = message;
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatValue).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function datasetColumns(manifest) {
  if (Array.isArray(manifest.featureColumns) && manifest.featureColumns.length) {
    return ['rowIndex', 'raagLabel', ...manifest.featureColumns];
  }
  return ['sourceFileName', 'title', 'raagName', 'composer', 'taalName', 'notationSystem'];
}

function renderMeta(manifest) {
  datasetMeta.replaceChildren();
  const values = [
    ['Records', manifest.recordCount],
    ['Type', manifest.datasetKind],
    ['Source', manifest.sourceName],
    ['Revision', manifest.sourceCommit],
    ['License status', `${manifest.licenseStatus}: ${manifest.license}`],
    ['Rights basis', manifest.rightsBasis],
    ['Raag labels', Object.entries(manifest.labelCounts || {}).map(([label, count]) => `${label} ${count}`).join(' | ') || 'Not provided']
  ];
  values.forEach(([label, value]) => {
    if (!value) return;
    const group = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = formatValue(value);
    group.append(term, description);
    datasetMeta.appendChild(group);
  });
}

function renderStats(manifest) {
  statsContainer.replaceChildren();
  const columns = manifest.featureColumns || [];
  if (!columns.length || !records.length) {
    const empty = document.createElement('p');
    empty.className = 'dataset-empty';
    empty.textContent = 'No numeric feature summary for this dataset.';
    statsContainer.appendChild(empty);
    return;
  }

  const tableElement = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Swara feature', 'Mean', 'Minimum', 'Maximum'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);
  const body = document.createElement('tbody');
  columns.forEach((column) => {
    const values = records.map((record) => Number(record.features?.[column])).filter(Number.isFinite);
    if (!values.length) return;
    const row = document.createElement('tr');
    [column, (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2), Math.min(...values), Math.max(...values)].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  tableElement.append(head, body);
  statsContainer.appendChild(tableElement);
}

function applySearch() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  filteredRecords = query
    ? records.filter((record) => JSON.stringify(record).toLocaleLowerCase().includes(query))
    : [...records];
  currentPage = 0;
  renderRows();
}

function renderRows() {
  const head = table.querySelector('thead');
  const body = table.querySelector('tbody');
  head.replaceChildren();
  body.replaceChildren();
  const columns = datasetColumns(currentManifest || {});
  const headerRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column;
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);

  const start = currentPage * pageSize;
  const visible = filteredRecords.slice(start, start + pageSize);
  visible.forEach((record, localIndex) => {
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.setAttribute('aria-selected', 'false');
    columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent = formatValue(record[column] ?? record.features?.[column]);
      row.appendChild(cell);
    });
    const selectRow = () => {
      body.querySelectorAll('tr').forEach((otherRow) => otherRow.setAttribute('aria-selected', 'false'));
      row.setAttribute('aria-selected', 'true');
      detail.textContent = JSON.stringify(record, null, 2);
    };
    row.addEventListener('click', selectRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow();
      }
    });
    row.dataset.row = String(start + localIndex);
    body.appendChild(row);
  });

  const pages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  rowCount.textContent = `Showing ${visible.length} of ${filteredRecords.length} matching rows (${records.length} total).`;
  pageLabel.textContent = `Page ${currentPage + 1} of ${pages}`;
  previousButton.disabled = currentPage === 0;
  nextButton.disabled = currentPage + 1 >= pages;
}

async function loadDataset(datasetId) {
  currentManifest = manifests.find((manifest) => manifest.datasetId === datasetId);
  if (!currentManifest) return;
  setStatus(`Loading ${currentManifest.name}...`);
  const snapshot = await getDocs(collection(db, 'compositionDatasets', datasetId, 'records'));
  records = snapshot.docs.map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }));
  records.sort((left, right) => (left.rowIndex ?? left.sourceFileName ?? left.id).toString().localeCompare((right.rowIndex ?? right.sourceFileName ?? right.id).toString(), undefined, { numeric: true }));
  renderMeta(currentManifest);
  renderStats(currentManifest);
  searchInput.value = '';
  filteredRecords = [...records];
  currentPage = 0;
  renderRows();
  exportButton.disabled = false;
  setStatus(`Loaded ${records.length} records from ${currentManifest.name}.`);
}

async function loadManifests(preferredId = '') {
  const snapshot = await getDocs(collection(db, 'compositionDatasets'));
  manifests = snapshot.docs.map((manifestDoc) => ({ datasetId: manifestDoc.id, ...manifestDoc.data() }))
    .sort((left, right) => left.name.localeCompare(right.name));
  datasetSelect.replaceChildren();
  manifests.forEach((manifest) => {
    const option = document.createElement('option');
    option.value = manifest.datasetId;
    option.textContent = manifest.name;
    datasetSelect.appendChild(option);
  });
  if (!manifests.length) {
    exportButton.disabled = true;
    setStatus('No composition datasets have been imported.');
    return;
  }
  datasetSelect.value = manifests.some((manifest) => manifest.datasetId === preferredId) ? preferredId : manifests[0].datasetId;
  await loadDataset(datasetSelect.value);
}

async function importBundle(file) {
  const bundle = JSON.parse(await file.text());
  const manifest = bundle.manifest;
  const rows = bundle.records;
  if (!manifest || !/^[a-z0-9-]{2,80}$/.test(manifest.datasetId || '') || !Array.isArray(rows) || !rows.length) {
    throw new Error(`${file.name} is not a valid composition dataset bundle.`);
  }
  if (manifest.licenseStatus !== 'user-confirmed') {
    throw new Error(`${manifest.name} is missing the confirmed data-use permission status.`);
  }
  if (rows.some((row) => !row.id || !/^[a-zA-Z0-9_-]{1,120}$/.test(String(row.id)))) {
    throw new Error(`${manifest.name} contains a record without a stable ID.`);
  }

  const importedManifest = { ...manifest, importedRecordCount: rows.length, importedAt: new Date().toISOString() };
  await setDoc(doc(db, 'compositionDatasets', manifest.datasetId), importedManifest, { merge: true });
  for (let offset = 0; offset < rows.length; offset += 25) {
    const batch = writeBatch(db);
    rows.slice(offset, offset + 25).forEach((row) => {
      const { id, ...data } = row;
      batch.set(doc(db, 'compositionDatasets', manifest.datasetId, 'records', String(id)), data, { merge: true });
    });
    await batch.commit();
  }
  return importedManifest;
}

async function initialize(user) {
  if (!user) {
    lab.hidden = true;
    setStatus('Sign in with an administrator account to access composition datasets.');
    return;
  }
  try {
    const token = await user.getIdTokenResult();
    if (token.claims.admin !== true) {
      lab.hidden = true;
      setStatus('Administrator access is required.');
      return;
    }
    lab.hidden = false;
    await loadManifests();
  } catch (error) {
    lab.hidden = true;
    setStatus(error.message || 'Composition datasets could not be loaded.');
  }
}

datasetSelect.addEventListener('change', () => loadDataset(datasetSelect.value).catch((error) => setStatus(error.message)));
searchInput.addEventListener('input', applySearch);
previousButton.addEventListener('click', () => { currentPage = Math.max(0, currentPage - 1); renderRows(); });
nextButton.addEventListener('click', () => { currentPage += 1; renderRows(); });

importButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) return;
  importButton.disabled = true;
  try {
    const imported = [];
    for (const file of files) imported.push(await importBundle(file));
    await loadManifests(imported.at(-1).datasetId);
    setStatus(`Imported ${imported.map((manifest) => `${manifest.importedRecordCount} ${manifest.name}`).join('; ')}.`);
  } catch (error) {
    setStatus(error.message || 'Dataset import failed.');
  } finally {
    importButton.disabled = false;
    fileInput.value = '';
  }
});

exportButton.addEventListener('click', () => {
  if (!currentManifest) return;
  const bundle = { manifest: currentManifest, records };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${currentManifest.datasetId}.json`;
  link.click();
  URL.revokeObjectURL(objectUrl);
  setStatus(`Exported ${records.length} records from ${currentManifest.name}.`);
});

onAuthStateChanged(auth, initialize);