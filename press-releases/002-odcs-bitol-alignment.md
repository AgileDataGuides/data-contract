# Data Contract Now Speaks Bitol ODCS v3.0.2

**17 April 2026**

AgileDataGuides today released a major upgrade to the Data Contract app, aligning it with the [Bitol Open Data Contract Standard (ODCS) v3](https://bitol-io.github.io/open-data-contract-standard/) — a Linux Foundation project setting an emerging vendor-neutral standard for data contracts. Contracts authored in the app now export as valid ODCS v3.0.2 YAML and import the same format straight back. The release also introduces a reusable Language Framework that establishes a pattern for interoperability with other standards.

## The Problem

The v1 Data Contract captured contracts as a 3×3 canvas of plain name/description items. That was fine for sketching but fell short of what a real, machine-readable contract needs:

- No schema field types (everything was a string)
- No quality rule semantics (operator, threshold, target column)
- No SLA structure (property, value, unit)
- No team roles
- No contract metadata (status, domain, data product, tags)
- And no path to interchange with established standards

Without typed fields and a recognised serialisation format, a contract was a document rather than a programmable artefact.

## The Solution

Data Contract v2.0 enriches the data model to match ODCS v3 structure and ships a Language Framework that translates the native model to/from external standards.

### Enriched data model

- **Columns** carry `logicalType`, `required`, `unique`, `primaryKey`, `classification`
- **Quality Rules** have `ruleType` (completeness/uniqueness/accuracy/freshness/custom), target `column`, `operator`, `threshold`
- **SLAs** have `property` (frequency/latency/uptime/retention), `value`, `unit`
- **Team Members** have a `role` (owner/steward/engineer/analyst/consumer) and replace the singular Publisher
- **Contract metadata** — status, domain, data product, tags — sits in a Tier 2b strip below the toolbar, all fields editable inline

### Bidirectional ODCS YAML

A new **Export ODCS** button produces valid ODCS v3.0.2 YAML. The **Import** button auto-detects YAML files (by extension or `apiVersion:` prefix) and parses them back to the native format. Round-trip tested — export → import → equivalent contract.

### Language Framework

The bigger idea sitting behind the ODCS work: a general-purpose Language Framework in `packages/shared/src/languages/`. The Context Plane has its own native vocabulary (`contract_model`, `dict_column`, `has_data_asset`, …). External standards — ODCS, OWL, RDF, SKOS, Snowflake Semantic — are "languages" that translate to/from that vocabulary. Each language is a single file implementing an `export()` / `import()` contract. Adding a new standard means adding one file, not scattering format-specific aliases across the schema.

### Agreement tab

A new **Agreement** tab renders the contract as a legal-style document — Producer commits, Consumer obligations, signature blocks — useful for circulating to non-technical stakeholders for sign-off without showing them the canvas.

## How It Works

The Language Framework registry maps language IDs to translator modules. Apps call `getLanguage('bitol').export(graph)` to emit YAML and `getLanguage('bitol').import(yamlString)` to parse it. Each module owns its own pure conversion code; the registry resolves at runtime so apps don't need to import every language they might need.

## Migration

Existing v1 contracts upgrade automatically on load. The migration runs in-place, persists back to disk, and fills sensible defaults for enriched fields (`logicalType: 'string'`, `operator: '>='`, etc.). No manual action required.

## Key Benefits

- **Interoperability** — export to ODCS YAML and share with any tool that reads the Bitol standard
- **Typed fields** — column types, quality thresholds, SLA units are first-class
- **Standards-aligned** — the metadata fields match what ODCS Fundamentals expects
- **Backward compatible** — v1 JSON files auto-migrate, v2.0 round-trips cleanly
- **Foundation for more standards** — the Language Framework is the path to OWL, RDF, Snowflake Semantic, and more
- **Sign-off-ready** — the Agreement tab renders the contract as a legal document for stakeholder approval

Data Contract v2.0 is available now in the Context Plane monorepo at `apps/data-contract/`.
