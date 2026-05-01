# Data Contract v2.0 — ODCS Alignment + Language Framework

**16 April 2026**

AgileDataGuides today released Data Contract v2.0, aligning the app with the Bitol Open Data Contract Standard (ODCS) v3. Data contracts authored in the app now export as valid ODCS v3.0.2 YAML — and import the same format straight back. The release also introduces a reusable **Language Framework** in the shared package, establishing a pattern for interoperability with other standards (OWL, RDF, Snowflake Semantic, SKOS, dbt) in future releases.

## The Problem

The v1 Data Contract app let users capture a contract as a 3×3 canvas of plain name/description items. That's fine for sketching, but it fell short of what a real data contract needs:
- No schema field types (everything's a string)
- No quality rule semantics (operator, threshold, target column)
- No SLA structure (property, value, unit)
- No team roles
- No contract metadata (status, domain, data product, tags)
- And no path to interchange with established standards

## The Solution

**Data Contract v2.0** enriches the data model to match ODCS v3 structure while preserving the canvas experience:

### 1. Enriched data model
- **Columns** now carry `logicalType`, `required`, `unique`, `primaryKey`, `classification`
- **Quality Rules** have `ruleType` (completeness/uniqueness/accuracy/freshness/custom), target `column`, `operator`, `threshold`
- **SLAs** have `property` (frequency/latency/uptime/retention), `value`, `unit`
- **Team Members** have `role` (owner/steward/engineer/analyst/consumer) and replace the singular Publisher
- **Contract metadata**: status, domain, data product, tags — editable inline

### 2. Restructured 3×3 grid (ODCS-aligned)

| Col 1 | Col 2 | Col 3 |
|-------|-------|-------|
| Data Asset | Schema / Columns | Quality Rules |
| Team | References | SLAs |
| Personas | Delivery / Infrastructure | Lineage |

### 3. Metadata bar
A new Tier 2b card between the toolbar and tabs shows the contract's status (cycling chip: Draft → Active → Deprecated → Retired), domain, data product, and tags. All fields editable inline.

### 4. Bidirectional ODCS YAML
- **Export ODCS** button produces valid ODCS v3.0.2 YAML
- **Import** auto-detects YAML files (by extension or `apiVersion:` prefix) and parses them back to native format
- Round-trip tested — export → import → equivalent contract

### 5. Language Framework — the bigger idea

Behind the ODCS integration sits a general-purpose **Language Framework** in `packages/shared/src/languages/`. The Context Plane has its own native vocabulary (`contract_model`, `dict_column`, `has_data_asset`, …). External standards — ODCS, OWL, RDF, SKOS, Snowflake Semantic — are "languages" that translate to/from that vocabulary.

Each language is a single file implementing an `export()` / `import()` contract. The registry lets apps pick a language by ID and call `getLanguage('bitol').export(graph)`. Adding a new standard = adding one file, not scattering format-specific aliases across the schema.

Documented in `design/LANGUAGES.md`. Current registry: **Bitol** (ODCS v3). Coming later: **OWL**, **RDF**, **Snowflake Semantic**, **SKOS**, **dbt**.

## Migration

Existing v1 contracts upgrade automatically on load. The migration runs in-place, persists back to disk, and fills sensible defaults for enriched fields (logicalType: 'string', operator: '>=', etc.). No manual action required.

## Key Benefits

- **Interoperability** — export to ODCS YAML and share with any tool that reads the Bitol standard
- **Typed fields** — column types, quality thresholds, SLA units are first-class
- **ODCS Fundamentals** — status/domain/dataProduct/tags surface the governance metadata ODCS expects
- **Backward compatible** — v1 JSON files auto-migrate, v2.0 round-trips cleanly
- **Foundation for more standards** — the Language Framework opens the door for OWL, RDF, Snowflake Semantic and others

## Credits

ODCS specification by [Bitol](https://bitol-io.github.io/open-data-contract-standard/) (Linux Foundation project).

Data Contract v2.0 is available now in the Context Plane monorepo at `apps/data-contract/`.
