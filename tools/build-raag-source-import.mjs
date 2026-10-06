import fs from 'node:fs';
import path from 'node:path';

const supabaseUrl = 'https://cxjfqwnmabyabhjhadjy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4amZxd25tYWJ5YWJoamhhZGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5Njc2NDUsImV4cCI6MjA3MTU0MzY0NX0.qbI-CU_wgAioBihGx54RXpr4cBryhzIjc4C8iT5YAX0';
const sourceName = 'Naadaalay DB (ashishdha/raag)';
const sourceUrl = 'https://github.com/ashishdha/raag';
const dunyaSourceName = 'CompMusic Dunya Hindustani Raga Catalogue';
const dunyaSourceUrl = 'https://github.com/MTG/dunya/blob/main/hindustani/fixtures/hindustani_raag.json';
const dunyaRawUrl = 'https://raw.githubusercontent.com/MTG/dunya/main/hindustani/fixtures/hindustani_raag.json';
const userAgent = 'HCMAI-RaagCatalog/1.0 (open-data import)';
const pageSize = 1000;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': userAgent, ...options.headers }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchSupabaseRows(table, params = {}) {
  const query = new URLSearchParams({ select: '*', order: 'id.asc', ...params });
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
    const page = await fetchJson(url, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Range: `${start}-${start + pageSize - 1}`,
        'Range-Unit': 'items'
      }
    });
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function sourceRecord(id, catalogType, displayName, source, data) {
  return {
    id,
    sourceRecordId: String(source.recordId),
    sourceName: source.name,
    sourceUrl: source.url,
    license: source.license,
    catalogType,
    displayName: displayName || '',
    sourceData: data
  };
}

function makeNotation(value, pitchclasses, octaves, symbols) {
  if (value >= 100) return symbols.get(value) || String(value);
  const pitch = pitchclasses.get(((value % 12) + 12) % 12) || String(value);
  const octave = Math.floor(value / 12);
  const marker = octaves.get(octave) || '';
  return octave < 0 ? `${marker}${pitch}` : `${pitch}${marker}`;
}

function splitAliases(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function noteRoleLists(swaras) {
  const tokens = swaras.map((value) => String(value));
  return {
    komalSwaras: tokens.filter((value) => /^[rgdn]$/.test(value)),
    teevraSwaras: tokens.filter((value) => value === 'M')
  };
}

async function fetchWikipediaMembers() {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: 'Category:Hindustani_ragas',
    cmlimit: '500',
    format: 'json'
  });
  const result = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
  return result.query.categorymembers.filter((page) => page.ns === 0);
}

async function fetchWikidataIds(pages) {
  const ids = new Map();
  for (let offset = 0; offset < pages.length; offset += 50) {
    const titles = pages.slice(offset, offset + 50).map((page) => page.title);
    const params = new URLSearchParams({
      action: 'query',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      titles: titles.join('|'),
      format: 'json'
    });
    const result = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
    for (const page of Object.values(result.query.pages)) {
      if (page.pageprops?.wikibase_item) ids.set(page.pageprops.wikibase_item, page.title);
    }
  }
  return ids;
}

async function fetchWikidataEntities(idToPage) {
  const entities = [];
  const ids = [...idToPage.keys()];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: ids.slice(offset, offset + 50).join('|'),
      props: 'labels|aliases|descriptions|claims',
      languages: 'en|hi',
      format: 'json'
    });
    const result = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`);
    entities.push(...Object.values(result.entities));
  }
  return entities.map((entity) => ({ ...entity, linkedWikipediaTitle: idToPage.get(entity.id) || '' }));
}

async function main() {
  const [raagRows, pitchRows, octaveRows, symbolRows, thaatRows, samayRows] = await Promise.all([
    fetchSupabaseRows('raags'),
    fetchSupabaseRows('pitchclasses'),
    fetchSupabaseRows('octaves'),
    fetchSupabaseRows('symbols'),
    fetchSupabaseRows('thaats'),
    fetchSupabaseRows('samays')
  ]);
  const pitchclasses = new Map(pitchRows.map((row) => [row.id, row.sargam]));
  const octaves = new Map(octaveRows.map((row) => [row.id, row.hindustaanee_symbol]));
  const symbols = new Map(symbolRows.map((row) => [row.id, row.hindustaanee_symbol]));
  const thaats = new Map(thaatRows.map((row) => [row.id, row.name]));
  const samays = new Map(samayRows.map((row) => [row.id, row.name]));
  const namedRaags = raagRows.filter((row) => String(row.name || '').trim());

  const naadaalay = { name: sourceName, url: sourceUrl, license: 'CC0-1.0' };
  const sourceRecords = raagRows.map((row) => {
    const data = { ...row };
    delete data.search_vector;
    return sourceRecord(
      `naadaalay-${row.id}`,
      row.name ? 'named-raag-candidate' : 'unattested-scale-candidate',
      row.name,
      { ...naadaalay, recordId: row.id },
      data
    );
  });

  const members = await fetchWikipediaMembers();
  const wikiSource = { name: 'Wikipedia: Category:Hindustani ragas', url: 'https://en.wikipedia.org/wiki/Category:Hindustani_ragas', license: 'CC BY-SA 4.0' };
  sourceRecords.push(...members.map((page) => sourceRecord(
    `wikipedia-${page.pageid}`,
    'wikipedia-category-member',
    page.title,
    { ...wikiSource, recordId: page.pageid },
    { pageId: page.pageid, title: page.title, pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}` }
  )));

  const idToPage = await fetchWikidataIds(members);
  const entities = await fetchWikidataEntities(idToPage);
  sourceRecords.push(...entities.map((entity) => sourceRecord(
    `wikidata-${entity.id}`,
    'wikidata-linked-item',
    entity.labels?.en?.value || entity.labels?.hi?.value || entity.id,
    { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${entity.id}`, license: 'CC0-1.0', recordId: entity.id },
    entity
  )));

  const dunyaRows = await fetchJson(dunyaRawUrl);
  const dunyaSourceRecords = dunyaRows.map((row) => {
    const fields = row.fields || {};
    return sourceRecord(
      `dunya-${fields.uuid || row.pk}`,
      'dunya-hindustani-raag',
      fields.common_name || fields.name,
      {
        name: dunyaSourceName,
        url: dunyaSourceUrl,
        license: 'CC0-1.0',
        recordId: fields.uuid || row.pk
      },
      {
        model: row.model,
        primaryKey: row.pk,
        uuid: fields.uuid || '',
        name: fields.name || '',
        commonName: fields.common_name || '',
        rightsBasis: 'Dunya terms: non-audio content is CC0 unless a different item license is stated.'
      }
    );
  });
  sourceRecords.push(...dunyaSourceRecords);

  const drafts = namedRaags.map((row) => {
    const notation = (sequence) => (sequence || []).map((value) => makeNotation(value, pitchclasses, octaves, symbols));
    const arohaNotes = notation(row.aaroh);
    const avarohaNotes = notation(row.avaroh);
    const pakadNotes = notation(row.chalan);
    const swaras = notation(row.svarset || []);
    const roles = noteRoleLists(swaras);
    const jati = `${row.aaroh_jaati}/${row.avaroh_jaati}`;
    const sourceData = { ...row };
    delete sourceData.search_vector;
    return {
      id: `naadaalay-${row.id}`,
      name: row.name,
      aliases: splitAliases(row.alternate_names),
      thaat: thaats.get(row.thaat) || String(row.thaat || ''),
      jati,
      timeOfDay: samays.get(row.samay) || '',
      aroha: arohaNotes.join(' '),
      arohaNotes,
      ascendingNoteCount: Number.isInteger(row.aaroh_jaati) ? row.aaroh_jaati : null,
      avaroha: avarohaNotes.join(' '),
      avarohaNotes,
      descendingNoteCount: Number.isInteger(row.avaroh_jaati) ? row.avaroh_jaati : null,
      pakad: pakadNotes.join(' '),
      pakadNotes,
      swaras,
      ...roles,
      description: String(row.notes || ''),
      sourceName,
      sourceUrl,
      license: 'CC0-1.0',
      sourceConfidence: Number.isFinite(row.confidence) ? row.confidence : null,
      catalogType: 'named-raag-candidate',
      sourceRecordId: String(row.id),
      sourceData,
      isPublished: false
    };
  });
  const dunyaDrafts = dunyaRows
    .filter((row) => String(row.fields?.common_name || row.fields?.name || '').trim())
    .map((row) => {
      const fields = row.fields;
      const name = String(fields.common_name || fields.name).trim();
      const aliases = fields.name && fields.name !== name ? [fields.name] : [];
      return {
        id: `dunya-${fields.uuid || row.pk}`,
        name,
        aliases,
        sourceName: dunyaSourceName,
        sourceUrl: dunyaSourceUrl,
        license: 'CC0-1.0',
        catalogType: 'dunya-hindustani-raag',
        sourceRecordId: String(fields.uuid || row.pk),
        sourceData: {
          model: row.model,
          primaryKey: row.pk,
          uuid: fields.uuid || '',
          sourceName: fields.name || '',
          commonName: fields.common_name || '',
          rightsBasis: 'Dunya terms: non-audio content is CC0 unless a different item license is stated.'
        },
        isPublished: false
      };
    });

  const outputDirectory = path.resolve('.firebase');
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'raag-source-records.json'), JSON.stringify({ schemaVersion: 1, sourceRecords }));
  fs.writeFileSync(path.join(outputDirectory, 'raag-draft-records.json'), JSON.stringify({ schemaVersion: 1, raags: drafts }));
  fs.writeFileSync(path.join(outputDirectory, 'dunya-source-records.json'), JSON.stringify({ schemaVersion: 1, sourceRecords: dunyaSourceRecords }));
  fs.writeFileSync(path.join(outputDirectory, 'dunya-draft-records.json'), JSON.stringify({ schemaVersion: 1, raags: dunyaDrafts }));
  fs.writeFileSync(path.join(outputDirectory, 'raag-import-summary.json'), JSON.stringify({
    naadaalayRows: raagRows.length,
    namedNaadaalayRows: namedRaags.length,
    dunyaCatalogueRows: dunyaRows.length,
    dunyaRaagDrafts: dunyaDrafts.length,
    wikipediaCategoryMembers: members.length,
    wikidataItems: entities.length,
    sourceRecords: sourceRecords.length,
    raagDrafts: drafts.length + dunyaDrafts.length,
    excluded: [
      { source: 'CompMusic Raga Recognition features', license: 'CC BY 4.0', reason: 'Zenodo archive download/range endpoint returned HTTP 403.' },
      { source: 'CompMusic Raga Recognition audio', license: 'Restricted', reason: 'Audio files are restricted and require an access request; not imported.' }
    ]
  }, null, 2));

  console.log(`Prepared ${sourceRecords.length} provenance records and ${drafts.length} unpublished Raag drafts.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});