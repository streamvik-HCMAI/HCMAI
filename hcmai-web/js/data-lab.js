import { collection, doc, documentId, getCountFromServer, getDocs, getFirestore, limit, orderBy, query, setDoc, startAfter, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
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
const compositionRecordIdentity = document.getElementById('compositionRecordIdentity');
const editCompositionButton = document.getElementById('editCompositionRecord');
const saveCompositionButton = document.getElementById('saveCompositionRecord');
const cancelCompositionButton = document.getElementById('cancelCompositionRecordEdit');
const compositionEditor = document.getElementById('compositionRecordEditor');
const previousButton = document.getElementById('compositionPreviousPage');
const nextButton = document.getElementById('compositionNextPage');
const compositionLab = document.getElementById('compositionLab');
const sourceRecordsLab = document.getElementById('sourceRecordsLab');
const compositionTab = document.getElementById('compositionTab');
const sourceRecordsTab = document.getElementById('sourceRecordsTab');
const sourceFilter = document.getElementById('sourceRecordFilter');
const sourceScope = document.getElementById('sourceRecordScope');
const sourceTable = document.getElementById('sourceRecordsTable');
const sourceRecordCount = document.getElementById('sourceRecordCount');
const sourcePreviousButton = document.getElementById('sourcePreviousPage');
const sourceNextButton = document.getElementById('sourceNextPage');
const sourcePageLabel = document.getElementById('sourcePageLabel');
const sourceDetail = document.getElementById('sourceRecordDetail');
const sourceRecordIdentity = document.getElementById('sourceRecordIdentity');
const editSourceButton = document.getElementById('editSourceRecord');
const saveSourceButton = document.getElementById('saveSourceRecord');
const cancelSourceButton = document.getElementById('cancelSourceRecordEdit');
const sourceEditor = document.getElementById('sourceRecordEditor');

let manifests = [];
let records = [];
let filteredRecords = [];
let currentManifest = null;
let currentPage = 0;
let selectedCompositionRecordId = '';
let selectedCompositionSourceRecordId = '';
let selectedCompositionOriginal = null;
let selectedSourceDocument = null;
let selectedSourceOriginal = null;
const sourcePageSize = 50;
let sourcePage = 0;
let sourcePageCursors = [null];
let sourcePageDocuments = [];
let sourceTotal = 0;

const sourcePrefixes = {
  all: '',
  naadaalay: 'naadaalay-',
  dunya: 'dunya-',
  wikipedia: 'wikipedia-',
  wikidata: 'wikidata-'
};

function setStatus(message) {
  status.textContent = message;
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatValue).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function cloneRecord(value) {
  return JSON.parse(JSON.stringify(value));
}

function setAtPath(target, path, value) {
  const parent = path.slice(0, -1).reduce((current, key) => current[key], target);
  parent[path[path.length - 1]] = value;
}

function renderPrimitiveControl(container, labelText, value, path, { disabled = false } = {}) {
  const label = document.createElement('label');
  label.className = 'dataset-edit-field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  let input;
  const type = typeof value;
  if (type === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
  } else if (type === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.value = String(value);
  } else if (type === 'string') {
    input = value.length > 100 ? document.createElement('textarea') : document.createElement('input');
    if (input instanceof HTMLInputElement) input.type = 'text';
    input.value = value;
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = value === null ? 'null (no source value)' : String(value);
    disabled = true;
  }
  input.dataset.editPath = JSON.stringify(path);
  input.dataset.valueType = type;
  input.disabled = disabled;
  label.append(caption, input);
  container.appendChild(label);
}

function renderStructuredFields(container, value, path = [], depth = 0) {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      const group = document.createElement('fieldset');
      group.className = 'dataset-edit-group';
      const legend = document.createElement('legend');
      legend.textContent = path[path.length - 1];
      group.appendChild(legend);
      value.forEach((item, index) => renderPrimitiveControl(group, `Item ${index + 1}`, item, [...path, index], { disabled: item === null }));
      container.appendChild(group);
      return;
    }
    renderStructuredJson(container, path, value);
    return;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (path[path.length - 1] === 'features' && Array.isArray(currentManifest?.featureColumns)) {
      const featureOrder = new Map(currentManifest.featureColumns.map((key, index) => [key, index]));
      entries.sort(([left], [right]) => (featureOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (featureOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
    }
    if (depth >= 2 || entries.length > 24) {
      renderStructuredJson(container, path, value);
      return;
    }
    const group = document.createElement('fieldset');
    group.className = 'dataset-edit-group';
    const legend = document.createElement('legend');
    legend.textContent = path.length ? path[path.length - 1] : 'Fields';
    group.appendChild(legend);
    entries.forEach(([key, child]) => {
      if (key === 'id' || key === 'sourceRecordId') return;
      renderStructuredFields(group, child, [...path, key], depth + 1);
    });
    container.appendChild(group);
    return;
  }

  renderPrimitiveControl(container, path[path.length - 1] || 'Value', value, path, { disabled: value === null });
}

function renderStructuredJson(container, path, value) {
  const label = document.createElement('label');
  label.className = 'dataset-edit-field dataset-edit-complex';
  const caption = document.createElement('span');
  caption.textContent = `${path[path.length - 1]} (structured; field layout is locked)`;
  const input = document.createElement('textarea');
  input.value = JSON.stringify(value, null, 2);
  input.spellcheck = false;
  input.dataset.editPath = JSON.stringify(path);
  input.dataset.valueType = 'json';
  label.append(caption, input);
  container.appendChild(label);
}

function renderRecordForm(container, record) {
  container.replaceChildren();
  Object.entries(record).forEach(([key, value]) => {
    if (key === 'id' || key === 'sourceRecordId') return;
    renderStructuredFields(container, value, [key]);
  });
}

function hasSameShape(original, edited, path = 'record') {
  if (Array.isArray(original)) {
    return Array.isArray(edited)
      && original.length === edited.length
      && original.every((value, index) => hasSameShape(value, edited[index], `${path}[${index}]`));
  }
  if (original && typeof original === 'object') {
    if (!edited || typeof edited !== 'object' || Array.isArray(edited)) return false;
    const originalKeys = Object.keys(original).sort();
    const editedKeys = Object.keys(edited).sort();
    return originalKeys.length === editedKeys.length
      && originalKeys.every((key, index) => key === editedKeys[index] && hasSameShape(original[key], edited[key], `${path}.${key}`));
  }
  return original === null ? edited === null : typeof original === typeof edited;
}

function readStructuredForm(container, original) {
  const immutableSourceRecordId = original.sourceRecordId || '';
  const editableOriginal = cloneRecord(original);
  delete editableOriginal.id;
  delete editableOriginal.sourceRecordId;
  const updated = cloneRecord(editableOriginal);
  container.querySelectorAll('[data-edit-path]').forEach((input) => {
    if (input.disabled) return;
    const path = JSON.parse(input.dataset.editPath);
    const type = input.dataset.valueType;
    let value;
    if (type === 'boolean') value = input.checked;
    else if (type === 'number') {
      value = Number(input.value);
      if (!Number.isFinite(value)) throw new Error(`${path.join('.')} must be a valid number.`);
    } else if (type === 'json') {
      try {
        value = JSON.parse(input.value);
      } catch {
        throw new Error(`${path.join('.')} must contain valid JSON.`);
      }
    } else value = input.value;
    setAtPath(updated, path, value);
  });
  if (!hasSameShape(editableOriginal, updated)) {
    throw new Error('The record structure changed. Field names, types, and list lengths are locked to protect the dataset schema.');
  }
  if (immutableSourceRecordId) updated.sourceRecordId = immutableSourceRecordId;
  return updated;
}

function setEditorMode(editor, detailPanel, editButton, saveButton, cancelButton, editing) {
  editor.hidden = !editing;
  detailPanel.hidden = editing;
  editButton.hidden = editing;
  saveButton.hidden = !editing;
  cancelButton.hidden = !editing;
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
      selectedCompositionRecordId = record.id;
      selectedCompositionSourceRecordId = record.sourceRecordId || '';
      selectedCompositionOriginal = cloneRecord(record);
      compositionRecordIdentity.textContent = `Document ID: ${record.id}${selectedCompositionSourceRecordId ? ` · Source ID: ${selectedCompositionSourceRecordId}` : ''}`;
      editCompositionButton.disabled = false;
      renderRecordForm(compositionEditor, record);
      setEditorMode(compositionEditor, detail, editCompositionButton, saveCompositionButton, cancelCompositionButton, false);
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
  selectedCompositionRecordId = '';
  selectedCompositionSourceRecordId = '';
  selectedCompositionOriginal = null;
  compositionRecordIdentity.textContent = 'No record selected.';
  editCompositionButton.disabled = true;
  setEditorMode(compositionEditor, detail, editCompositionButton, saveCompositionButton, cancelCompositionButton, false);
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

function renderSourceRows() {
  const head = sourceTable.querySelector('thead');
  const body = sourceTable.querySelector('tbody');
  head.replaceChildren();
  body.replaceChildren();
  const columns = ['sourceName', 'catalogType', 'displayName', 'license', 'sourceRecordId'];
  const headerRow = document.createElement('tr');
  columns.forEach((column) => {
    const cell = document.createElement('th');
    cell.textContent = column;
    headerRow.appendChild(cell);
  });
  head.appendChild(headerRow);

  sourcePageDocuments.forEach((recordDocument) => {
    const record = recordDocument.data();
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.setAttribute('aria-selected', 'false');
    columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent = formatValue(record[column]);
      row.appendChild(cell);
    });
    const selectRow = () => {
      body.querySelectorAll('tr').forEach((otherRow) => otherRow.setAttribute('aria-selected', 'false'));
      row.setAttribute('aria-selected', 'true');
      selectedSourceDocument = recordDocument;
      selectedSourceOriginal = cloneRecord(record);
      const sourceRecord = { id: recordDocument.id, ...record };
      sourceRecordIdentity.textContent = `Document ID: ${recordDocument.id} · Source ID: ${record.sourceRecordId || 'not recorded'}`;
      editSourceButton.disabled = false;
      renderRecordForm(sourceEditor, sourceRecord);
      setEditorMode(sourceEditor, sourceDetail, editSourceButton, saveSourceButton, cancelSourceButton, false);
      sourceDetail.textContent = JSON.stringify(sourceRecord, null, 2);
    };
    row.addEventListener('click', selectRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow();
      }
    });
    body.appendChild(row);
  });

  const firstRecord = sourcePage * sourcePageSize + (sourcePageDocuments.length ? 1 : 0);
  const lastRecord = sourcePage * sourcePageSize + sourcePageDocuments.length;
  sourceRecordCount.textContent = `Showing ${firstRecord}-${lastRecord} of ${sourceTotal} source records.`;
  sourcePageLabel.textContent = `Page ${sourcePage + 1} of ${Math.max(1, Math.ceil(sourceTotal / sourcePageSize))}`;
  sourcePreviousButton.disabled = sourcePage === 0;
  sourceNextButton.disabled = lastRecord >= sourceTotal || sourcePageDocuments.length < sourcePageSize;
}

async function loadSourcePage({ reset = false } = {}) {
  if (reset) {
    sourcePage = 0;
    sourcePageCursors = [null];
  }
  selectedSourceDocument = null;
  selectedSourceOriginal = null;
  sourceRecordIdentity.textContent = 'No record selected.';
  editSourceButton.disabled = true;
  setEditorMode(sourceEditor, sourceDetail, editSourceButton, saveSourceButton, cancelSourceButton, false);
  setStatus('Loading raw source records...');
  const prefix = sourcePrefixes[sourceFilter.value] || '';
  const filters = prefix
    ? [where(documentId(), '>=', prefix), where(documentId(), '<', `${prefix}\uf8ff`)]
    : [];
  const sourceCollection = collection(db, 'raagSourceRecords');
  const countSnapshot = await getCountFromServer(query(sourceCollection, ...filters));
  sourceTotal = countSnapshot.data().count;
  const pageConstraints = [...filters, orderBy(documentId()), limit(sourcePageSize)];
  if (sourcePageCursors[sourcePage]) pageConstraints.push(startAfter(sourcePageCursors[sourcePage]));
  const pageSnapshot = await getDocs(query(sourceCollection, ...pageConstraints));
  sourcePageDocuments = pageSnapshot.docs;
  if (sourcePageDocuments.length === sourcePageSize) {
    sourcePageCursors[sourcePage + 1] = sourcePageDocuments[sourcePageDocuments.length - 1];
  }
  sourceDetail.textContent = 'Select a row to inspect its source fields.';
  const sourceNames = sourceFilter.options[sourceFilter.selectedIndex].textContent;
  sourceScope.textContent = sourceFilter.value === 'all' ? `${sourceTotal.toLocaleString()} total records` : `${sourceTotal.toLocaleString()} ${sourceNames} records`;
  renderSourceRows();
  setStatus(`Loaded ${sourcePageDocuments.length} source records from ${sourceNames}.`);
}

function showDataTab(tab) {
  const showSources = tab === 'sources';
  compositionLab.hidden = showSources;
  sourceRecordsLab.hidden = !showSources;
  compositionTab.classList.toggle('is-active', !showSources);
  sourceRecordsTab.classList.toggle('is-active', showSources);
  compositionTab.setAttribute('aria-selected', String(!showSources));
  sourceRecordsTab.setAttribute('aria-selected', String(showSources));
  if (showSources) loadSourcePage({ reset: true }).catch((error) => setStatus(error.message || 'Source records could not be loaded.'));
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

async function requireAdminForEdit() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as an administrator to edit records.');
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) throw new Error('Administrator permission is required to edit records.');
}

datasetSelect.addEventListener('change', () => loadDataset(datasetSelect.value).catch((error) => setStatus(error.message)));
compositionTab.addEventListener('click', () => showDataTab('compositions'));
sourceRecordsTab.addEventListener('click', () => showDataTab('sources'));
sourceFilter.addEventListener('change', () => loadSourcePage({ reset: true }).catch((error) => setStatus(error.message || 'Source filter failed.')));
sourcePreviousButton.addEventListener('click', () => {
  sourcePage = Math.max(0, sourcePage - 1);
  loadSourcePage().catch((error) => setStatus(error.message || 'Previous source page could not be loaded.'));
});
sourceNextButton.addEventListener('click', () => {
  if (!sourcePageCursors[sourcePage + 1]) return;
  sourcePage += 1;
  loadSourcePage().catch((error) => setStatus(error.message || 'Next source page could not be loaded.'));
});
searchInput.addEventListener('input', applySearch);
previousButton.addEventListener('click', () => { currentPage = Math.max(0, currentPage - 1); renderRows(); });
nextButton.addEventListener('click', () => { currentPage += 1; renderRows(); });

editCompositionButton.addEventListener('click', () => {
  if (!selectedCompositionRecordId) return;
  setEditorMode(compositionEditor, detail, editCompositionButton, saveCompositionButton, cancelCompositionButton, true);
  compositionEditor.querySelector('input:not(:disabled), textarea:not(:disabled)')?.focus();
});
cancelCompositionButton.addEventListener('click', () => {
  if (selectedCompositionOriginal) {
    renderRecordForm(compositionEditor, selectedCompositionOriginal);
    detail.textContent = JSON.stringify(selectedCompositionOriginal, null, 2);
  }
  setEditorMode(compositionEditor, detail, editCompositionButton, saveCompositionButton, cancelCompositionButton, false);
});
saveCompositionButton.addEventListener('click', async () => {
  if (!selectedCompositionRecordId || !currentManifest) return;
  saveCompositionButton.disabled = true;
  try {
    await requireAdminForEdit();
    const recordId = selectedCompositionRecordId;
    const datasetId = currentManifest.datasetId;
    const update = readStructuredForm(compositionEditor, selectedCompositionOriginal);
    await setDoc(doc(db, 'compositionDatasets', datasetId, 'records', recordId), update);
    await loadDataset(datasetId);
    setStatus(`Saved record ${recordId}; its document ID was preserved.`);
  } catch (error) {
    setStatus(error.message || 'Composition record could not be saved.');
  } finally {
    saveCompositionButton.disabled = false;
  }
});

editSourceButton.addEventListener('click', () => {
  if (!selectedSourceDocument) return;
  setEditorMode(sourceEditor, sourceDetail, editSourceButton, saveSourceButton, cancelSourceButton, true);
  sourceEditor.querySelector('input:not(:disabled), textarea:not(:disabled)')?.focus();
});
cancelSourceButton.addEventListener('click', () => {
  if (selectedSourceDocument && selectedSourceOriginal) {
    const record = { id: selectedSourceDocument.id, ...selectedSourceOriginal };
    renderRecordForm(sourceEditor, record);
    sourceDetail.textContent = JSON.stringify(record, null, 2);
  }
  setEditorMode(sourceEditor, sourceDetail, editSourceButton, saveSourceButton, cancelSourceButton, false);
});
saveSourceButton.addEventListener('click', async () => {
  if (!selectedSourceDocument) return;
  saveSourceButton.disabled = true;
  try {
    await requireAdminForEdit();
    const update = readStructuredForm(sourceEditor, selectedSourceOriginal);
    await setDoc(selectedSourceDocument.ref, update);
    const recordId = selectedSourceDocument.id;
    await loadSourcePage();
    setStatus(`Saved source record ${recordId}; its document ID was preserved.`);
  } catch (error) {
    setStatus(error.message || 'Source record could not be saved.');
  } finally {
    saveSourceButton.disabled = false;
  }
});

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