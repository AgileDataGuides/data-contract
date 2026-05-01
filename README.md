# Data Contract

Define data contracts for your data assets — the agreement between the team that produces a dataset and the teams that consume it. Captures schema, quality expectations, freshness commitments, ownership, lineage, and the business glossary terms that anchor the contract in your domain language.

An [AgileDataGuides](https://agiledataguides.com/agiledata-templates/) Pattern Template app.

## What It Does

A Data Contract is an explicit, machine-readable agreement covering everything a consumer needs to depend on a dataset:

| Section | Purpose |
|---------|---------|
| **Data Asset** | The single dataset the contract governs |
| **Schema / Columns** | Every column with its data type, classification (PII / public / confidential), nullability, and primary-key status |
| **Trust Rules** | Data-quality expectations the producer commits to enforce — completeness, uniqueness, accuracy, freshness, validity, security |
| **Data Sync** | Service-level commitments — refresh frequency, latency, uptime, retention |
| **Team** | Producers (owner), stewards, and consumers — with role-tagged contact info |
| **Personas** | The roles who depend on this contract (e.g. CRO, CFO, Finance Analyst) |
| **Glossary Terms** | Business glossary terms anchored to the contract — keeps language consistent across domains |
| **Delivery / Infrastructure** | How the data is delivered — Snowflake, Kafka, REST API, dbt, … |
| **Lineage** | PROV-O aligned upstream sources (source systems, ingestion jobs, transformation steps) |
| **Status / Domain / Information Product / Tags** | Metadata tying the contract into the wider organisation |

## Try It Online

**[Launch the Live Demo](https://agiledataguides.github.io/data-contract)** — no install required. The demo runs entirely in your browser. Your data is saved in localStorage and never leaves your device.

The demo includes three example contracts modelling the **Stripe Customers**, **Stripe Subscriptions**, and **Stripe Invoices** APIs — the SaaS revenue funnel from customer master through MRR/ARR to recognised revenue. They thread together via foreign keys so you can see how contracts cross-reference each other in a real dataset stack.

## Install and Run

Double-click `start-data-contract.command` (macOS) or run `./start-data-contract.sh` from the terminal.

The app starts at [http://localhost:5119](http://localhost:5119).

**Requires**: [Node.js](https://nodejs.org/) (v18+) and [pnpm](https://pnpm.io/) (`npm install -g pnpm`).

## Features

- **Tier 1–3 toolbar** — App switcher, contract metadata + actions, tab navigation
- **Click-to-select cards** — click a card to view, click again to inline-edit
- **Trust Rules** — categorise rules (Completeness, Uniqueness, Accuracy, Freshness, Validity, Security, Governance), pin to a column, store the rule expression as free text
- **Data Sync** — typed properties (`frequency`, `latency`, `uptime`, `retention`) with units
- **Lineage** — PROV-O-aligned items with provType (`entity` / `activity` / `agent`) and upstream relationships
- **Manage Pattern Types** — per-contract customisation of the lookup catalogues that drive the toolbar chips (Status / Change Detection / History Window). Toggle patterns off, trash them, edit values, export/import per pattern or all
- **Multiple export formats** — JSON (native), ODCS YAML (Bitol v3.0.2), OpenMetadata Standards JSON, RTF, Word, PDF
- **Import** — auto-detects native JSON, ODCS YAML, OpenMetadata, or Context Plane graph format
- **Multiple contracts** — create, switch between, and delete contracts
- **Auto-save** — changes persist to browser localStorage automatically
- **Save to disk** — writes JSON to `data/` for direct access by Claude or other tools

## Works With Claude

Export your contract as JSON / ODCS / OpenMetadata and use it with [Claude Code](https://claude.ai/claude-code) or [Claude Chat](https://claude.ai):

- *"What columns in this contract are missing trust rules?"*
- *"Generate a dbt source.yml from this contract's columns."*
- *"Are any of my contracts missing a freshness trust rule?"*
- *"Suggest additional trust rules based on the column data types."*
- *"Convert this Stripe contract to an OpenMetadata table definition."*

## Languages

The Data Contract app speaks multiple data contract dialects via its Language Framework:

- **Bitol / ODCS v3.0.2** — Open Data Contract Standard (YAML)
- **OpenMetadata Standards** — OMS table + quality + SLA definitions (JSON)
- **Context Plane** — native graph format for round-tripping with the wider Context Plane app

Languages are pure translation modules — your contract data stays in the AgileData-native model on disk; export/import re-emits it in the chosen dialect on demand.

## Data Storage

**Save** writes contract files to the `data/` folder as JSON. This only works in dev mode (`pnpm dev`) where the server can write to disk. Claude Code can then read these files directly.

**Export** downloads files to your browser's downloads folder for sharing or backup.

**Auto-save** persists the current state to browser localStorage automatically.

## Security

This app is designed to run locally on your own machine. Do not expose it to the internet or deploy it on a public server. The Save feature writes files directly to your filesystem. There is no user authentication, so anyone who can reach the server can read and overwrite your data.

If you need to share your work, use the **Export** buttons to download files and share them manually.

## Tech Stack

- [SvelteKit 5](https://svelte.dev/) with Svelte 5 runes
- [Tailwind CSS 4](https://tailwindcss.com/)
- TypeScript
- pnpm

## Licensing

- **Code**: [MIT](../LICENSE)
- **Documentation**: CC BY-SA 4.0
