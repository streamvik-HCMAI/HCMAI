# HCMAI Raag data schema

Raags are stored in the Firestore `raags` collection. A document may use these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Canonical searchable name |
| `nameHindi` | string | Optional Devanagari name |
| `aliases` | string array | Alternate spellings/transliterations |
| `thaat` | string | Parent thaat |
| `jati` | string | Aroha/avaroha note-count classification |
| `ascendingNoteCount`, `descendingNoteCount` | integer 1-12 or null | Numeric aroha/avaroha counts for analysis |
| `tradition` | string | Gharana, lineage, or interpretive tradition when source identifies one |
| `timeOfDay` | string | Performance time as a normalized category or phrase |
| `prahar` | integer 1-8 or null | Hindustani time-cycle value |
| `aroha`, `avaroha`, `pakad` | string | Original notation text for display and provenance |
| `arohaNotes`, `avarohaNotes`, `pakadNotes` | string arrays | Tokenized swara sequences for computational analysis |
| `vadi`, `samvadi` | string | Principal and secondary notes |
| `swaras`, `komalSwaras`, `teevraSwaras`, `nyasSwaras`, `varjitSwaras` | string arrays | Analytical swara fields |
| `rasa`, `description` | string | Editorial/classification fields; retain only original or licensed text |
| `sourceName`, `sourceUrl`, `license`, `verifiedAt` | string | Provenance and rights/verification details |
| `catalogType`, `sourceRecordId`, `sourceConfidence`, `sourceData` | string, string, number/null, object | Source classification, stable source ID, source confidence, and retained source fields |
| `schemaVersion` | integer | Data-schema version, currently 1 |
| `isPublished` | boolean | Whether the public directory may display the record |

`isPublished` must remain `false` until a knowledgeable reviewer verifies a record. Imported source candidates are not automatically canonical or authoritative.

Raag Explorer shows published records to visitors and includes drafts only for administrators. Administrators can filter by published/source-candidate status. Thaat Explorer groups the accessible Raag records by their stored `thaat` values and links back to the filtered Raag search. Imported source labels are preserved as provided; source-specific Thaat systems are not silently converted into a single standard classification.

Selecting a Raag opens `raag-detail.html?id={documentId}`. Administrators edit curated fields in typed controls; the document ID, source record ID, source data, and classification metadata stay outside the editable form unless explicitly surfaced as read-only. **Save as draft** keeps the record unpublished. **Publish verified Raag** requires name, Thaat, Jati, Aroha, Avaroha, source name, license/permission basis, and review date; Firestore rules still require the admin claim.

## JSON bulk import

The Raag Explorer admin controls accept either a top-level array or `{ "raags": [...] }`. Every record must contain `name`, `sourceName`, and `license`. Imports are saved as drafts unless `isPublished` is explicitly `true`. Fields that contain multiple values accept arrays or comma-separated strings.

```json
{
  "schemaVersion": 1,
  "raags": [
    {
      "name": "Example Raag",
      "nameHindi": "",
      "aliases": [],
      "thaat": "",
      "jati": "",
      "tradition": "",
      "timeOfDay": "",
      "prahar": null,
      "aroha": "",
      "arohaNotes": [],
      "ascendingNoteCount": null,
      "avaroha": "",
      "avarohaNotes": [],
      "descendingNoteCount": null,
      "pakad": "",
      "pakadNotes": [],
      "vadi": "",
      "samvadi": "",
      "swaras": [],
      "komalSwaras": [],
      "teevraSwaras": [],
      "nyasSwaras": [],
      "varjitSwaras": [],
      "rasa": "",
      "description": "",
      "sourceName": "",
      "sourceUrl": "",
      "license": "",
      "verifiedAt": "",
      "isPublished": false
    }
  ]
}
```

Only import a complete third-party catalog when its license or written permission allows database reuse. Record source and license per entry; do not copy a site's editorial prose unless that text is licensed for reuse.

## Raw source records

The admin-only Firestore collection `raagSourceRecords` retains source data independently from the Raag directory. Its documents include `sourceRecordId`, `sourceName`, `sourceUrl`, `license`, `catalogType`, `displayName`, and `sourceData`. Nested source arrays are encoded as objects with `__hcmaiArrayValues` because Firestore does not support arrays nested directly inside arrays.

Regenerate local import bundles with `node tools/build-raag-source-import.mjs`. The script writes JSON files under `.firebase/`; the Raag Explorer admin page has separate controls for importing raw source records and Raag drafts.

## Composition datasets

Composition-level material is stored separately from Raag descriptions in the admin-only Firestore hierarchy `compositionDatasets/{datasetId}` and `compositionDatasets/{datasetId}/records/{recordId}`. Each dataset has its own manifest, stable source revision, permission basis, and record IDs. These rows are not automatically converted to `raags` documents.

The Data Lab at `hcmai-dev.web.app/data-lab.html` lets an administrator select a dataset, inspect its manifest and label counts, search and page through records, view numeric feature summaries, inspect a complete record, and export the selected dataset as JSON. Uploads require a `user-confirmed` permission status and write only to the matching dataset path.

Administrators can edit a selected composition or raw-source record in place from its detail panel. The UI displays the Firestore document ID and `sourceRecordId` as locked identifiers; the JSON editor omits both and restores the existing source ID on save. Saving replaces fields on the same Firestore document path, so references and stable IDs remain unchanged. Invalid JSON, attempts to edit IDs, and nested arrays (which Firestore rejects) are blocked with an error. Save requires a freshly checked admin claim and is also enforced by Firestore rules.

Regenerate bundles with `tools/build-composition-datasets.ps1`. The script pins the two Git revisions and produces three independent files under `.firebase/`:

| Dataset ID | Rows | Record shape |
| --- | ---: | --- |
| `sangeet-xml` | 116 | Composition and Raag/Taal metadata, notation rows, source filename, Git blob, and original XML |
| `sangeet-frequency-csv` | 116 | `rowIndex`, `raagLabel`, and 12 case-sensitive swara-frequency fields: `s`, `R`, `r`, `G`, `g`, `m`, `M`, `p`, `D`, `d`, `N`, `n` |
| `raagbase-frequency-csv` | 116 | Same feature schema, but a distinct release with different values; do not align to Sangeet by row index |

## Initial analysis questions

- How are the three Raag labels distributed, and how variable is each swara-frequency feature within each label?
- Which compositions are outliers or have feature profiles that overlap another label?
- Can simple baselines such as majority class, logistic regression, or random forest separate these three labels? Use a stratified split and report per-class metrics; with only 116 compositions, treat this as exploratory.
- How do Sangeet and RaagBase feature distributions differ? Compare distributions, not row-by-row composition values, because the releases do not share composition identifiers.
- In the XML set, which Taal, composer, notation, or composition metadata can be analyzed alongside the Raag label?

## Imported dev snapshot

As of 2026-10-04, Firebase development contains 6,385 admin-only raw provenance records, 395 unpublished Raag drafts, and 3 separate composition datasets with 348 records total. No imported Raag record is published. The composition manifests record the user's confirmation of permission to use the files; the upstream GitHub repositories do not publish an explicit dataset license.

| Source | Imported records | License/provenance | Notes |
| --- | ---: | --- | --- |
| Naadaalay Hindustaanee Raag Database | 5,677 source rows; 68 named drafts | CC0-1.0; [repository](https://github.com/ashishdha/raag) | Unnamed rows are retained as unattested scale candidates, not Raags. Source confidence is preserved. |
| CompMusic Dunya Hindustani fixture | 508 source rows; 327 named drafts | CC0-1.0 under Dunya's default license for non-audio content; [terms](https://dunya.compmusic.upf.edu/about/terms) | Stores names, transliterations, UUIDs, and fixture IDs. |
| Wikipedia Hindustani-raga category | 100 category-member references | CC BY-SA 4.0 | Stores titles/page IDs and URLs only, not article prose. The category includes related pages, so entries require review. |
| Linked Wikidata items | 100 structured records | CC0-1.0 | Imported as linked source data, not independently verified Raag entries. |

The CompMusic feature archive declares CC BY 4.0 but its Zenodo download endpoint returned HTTP 403; it was not imported. CompMusic audio is access-restricted and was not imported. No Taranang content was copied.
