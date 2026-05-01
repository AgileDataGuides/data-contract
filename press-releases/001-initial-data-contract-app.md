# Data Contract App Now Available

**9 April 2026**

AgileDataGuides today released the Data Contract, a free, open-source app that helps data teams capture the agreement between the team that produces a dataset and the teams that consume it. The contract covers schema, quality expectations, freshness commitments, ownership, and the business glossary terms that anchor the dataset in the team's domain language.

## The Problem

Most "data contract" conversations end up as a slide deck, a Confluence page, or an Excel sheet that nobody reads after the first sprint. The producer team promises a schema and a refresh cadence, the consumer team builds against it, and six months later the producer changes a column type without telling anyone. There's no single living artefact that names what the producer commits to, what the consumer depends on, and how to tell when the contract has been broken.

## The Solution

The Data Contract app gives every dataset a single canvas that captures everything a consumer needs to depend on it:

- **Data Asset** — the dataset the contract governs
- **Schema / Columns** — every column with type, nullability, and classification
- **Quality Rules** — the data-quality expectations the producer commits to enforce
- **SLAs** — service-level commitments for freshness and uptime
- **Publisher / Personas** — who's accountable for the contract, who depends on it
- **Glossary Terms** — the business glossary terms anchored to the contract
- **Delivery Types** — how the data is delivered (Snowflake, Kafka, dbt, …)
- **Lineage** — upstream sources and transformation steps

Each item is a card on a 3×3 canvas. Click to add, click to edit, click to delete. The whole contract serialises to a single JSON file that lives alongside your code or in a docs repo — version-controlled, diff-able, reviewable.

## How It Works

Users open the app at `localhost:5119`, click **+ New Contract**, fill in the canvas areas, and the contract auto-saves to `data/<contract-name>.json`. Multiple contracts can be created and switched between via the contract dropdown. Existing contracts can be exported as JSON for sharing or imported back from a JSON file.

The app ships with a starter example contract so visitors land on a populated canvas the first time they open it.

## Key Benefits

- **One canonical answer** — the contract lives in one place, not scattered across decks
- **Visual structure** — the 3×3 grid makes section coverage immediately obvious
- **Producer + consumer view** — captures both sides of the contract in one artefact
- **JSON-native** — versionable, diff-able, fits into any docs or code repo
- **Multiple contracts** — model different datasets in separate contracts, switch between them with one click
- **Runs locally** — no cloud accounts, no sign-ups, your data stays on your machine

The Data Contract is available now in the Context Plane monorepo at `apps/data-contract/`.
