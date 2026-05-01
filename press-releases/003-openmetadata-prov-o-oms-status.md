# Data Contract Adds OpenMetadata Export, PROV-O Lineage, and 7-Stage Lifecycle Status

**20 April 2026**

AgileDataGuides today released a triple-feature update to the Data Contract app — a second export language (OpenMetadata Standards), a re-architected lineage section aligned with the W3C PROV Ontology, and the OpenMetadata Standards seven-stage lifecycle for the contract status field.

## The Problem

The v2.0 release brought Bitol ODCS support, but Bitol isn't the only standard data teams use. **OpenMetadata** is widely deployed in enterprise data catalogues — and it has its own JSON-based contract structure. Without an OpenMetadata language module, Data Contract users couldn't share their contracts with OpenMetadata-driven catalogues without hand-translating.

The v2.0 lineage section captured upstream sources as plain items, but that hid important structure. A real lineage graph distinguishes **what** was created (entities), **how** it was created (activities), and **who** was responsible (agents) — that's the shape the W3C PROV Ontology has standardised on for over a decade.

The status field was a free-text string. Different teams used different vocabularies — "live", "production", "released" — making it hard to know whether two contracts in the same status really were at the same lifecycle stage.

## The Solution

Three changes ship together.

### OpenMetadata Standards language module

A new `getLanguage('openmetadata')` translator emits and parses OpenMetadata table + quality + SLA definitions in JSON. It plugs into the same Language Framework introduced in v2.0 — no app changes needed beyond a new **Export OMS** button. Quality rules, columns, owners, and SLAs all map cleanly between the AgileData-native model and OpenMetadata's structures.

### PROV-O aligned lineage

Lineage items now carry a `provType` of one of three values:

- **entity** — a data thing (dataset, file, report)
- **activity** — a process / transformation / ingestion run
- **agent** — a person, team, or service responsible for an activity

`upstreamIds` references *other* lineage item IDs. The relationship label between two items is derived from the provType pairing — entity → entity = `was_derived_from`, activity → entity = `used`, activity → agent = `was_associated_with`, etc. This matches the relationship vocabulary in PROV-O exactly, so a Data Contract lineage section can be exported to any PROV-aware tool without losing information.

### OpenMetadata 7-stage lifecycle status

Status now uses the OpenMetadata Standards 7-stage lifecycle: **ideation → design → development → testing → production → deprecated → retired**. Click the status badge to cycle through stages. Legacy values (`draft`, `active`) auto-migrate on load (`draft` → `Design`, `active` → `Production`). The colour scheme matches the lifecycle stage so the contract's maturity is obvious at a glance.

## Key Benefits

- **Two-language interoperability** — export to ODCS or OpenMetadata, pick whichever your downstream catalogue speaks
- **Lineage that round-trips** — PROV-O is the standard language for provenance; lineage data now exports to any PROV tool without lossy translation
- **Lifecycle clarity** — every contract's status comes from a single, recognised vocabulary that consumers and auditors agree on
- **Auto-migrating** — existing contracts pick up the new shape on load with no manual intervention

The release is available now in the Context Plane monorepo at `apps/data-contract/`.
