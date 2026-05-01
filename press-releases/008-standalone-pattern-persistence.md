# Manage Pattern Types Now Survives a Page Reload in the Standalone App

**30 April 2026**

AgileDataGuides today released a fix for the standalone Data Contract app — every change made in the Manage Pattern Types tab (toggle, trash, add, edit name, edit values, edit pattern descriptions) now persists across a page reload. Previously, those changes appeared to apply but were silently discarded the moment the page was refreshed.

## The Problem

The Manage Pattern Types UI writes through the app's DataAdapter abstraction, using two graph-style node labels — `contract_config` for the per-contract pattern types list, and `contract_pattern` for per-pattern value/description overrides. In the embedded Context Plane mode (DuckDB-backed adapter), those graph nodes persist correctly. But in the standalone mode, the adapter routed `createNode` for those labels to `callbacks.onAddItem(label, name)` — and the contract store had no handler for `contract_config` or `contract_pattern` labels.

The result: every Add / Toggle / Trash / Edit / Add-Value / Delete-Value silently no-op'd. The UI looked like it was responding (toggles clicked, chips dimmed), but the underlying store never updated, so a page reload reverted everything to defaults. This was particularly confusing because the same UI worked perfectly when embedded in the Context Plane.

## The Solution

The standalone adapter now writes through to two new fields on the ContractModel:

- **`patternTypes: ContractPatternType[]`** — the customised pattern types list (`null` = use shared defaults)
- **`patternOverrides: Record<patternId, ContractPatternOverride>`** — per-pattern value + description overrides

Both fields are optional, both default sensibly, and both auto-migrate on load for older contract files.

### Round-trip via converter

The `contractToContextPlane` converter emits `contract_config` and `contract_pattern` graph nodes from these model fields, with **stable IDs** (`dc-config-<modelId>` and `dc-pattern-<modelId>-<patternId>`) so the create→update→get lookup chain inside `ContractPatternsTab.svelte` finds existing nodes. The reverse converter (`contextPlaneToContract`) extracts them back. This means the same code path that drives the embedded CP version drives the standalone version too — only the persistence sink differs.

### Adapter routing

Three new optional callbacks on the standalone adapter:

- `onSetPatternTypes(types)` — writes through to `model.patternTypes`
- `onSetPatternOverride(patternId, override)` — writes through to `model.patternOverrides[patternId]`
- `onDeletePatternOverride(patternId)` — removes a key

`createNode` for `contract_config` / `contract_pattern` labels routes to those callbacks instead of the generic `onAddItem` no-op.

## How It Works

User clicks a toggle in Manage Pattern Types. The component calls `adapter.updateNode(configId, { properties: { patternTypes: [...] } })`. The standalone adapter detects the `contract_config` label, calls `onSetPatternTypes(updates)`, which calls `setPatternTypes()` on the store, which writes to `store.model.patternTypes` and marks the model dirty. The auto-save timer fires 300ms later, persisting the model to `data/<contract>.json`. On page reload, the contract loads with `patternTypes` populated; the converter emits the `contract_config` node; the Manage Patterns UI reads it and renders the toggles in their saved state.

## Key Benefits

- **Persistence parity** — Manage Pattern Types now works identically in standalone and embedded modes
- **No data shape surprises** — the new fields are additive and optional; existing v2.1 contracts auto-migrate without manual intervention
- **Round-trippable** — pattern customisations export and import cleanly via JSON or any of the supported language formats
- **Stable IDs** — the converter emits deterministic node IDs so the UI's get-by-id flows work identically in both modes

Live verified end-to-end: toggle "Data Storage Format" off → reload → still off; add custom value "PersistenceTestValue" → reload → still in the list; round-trip through Export Patterns / Import Patterns.

The release is available now in the Context Plane monorepo at `apps/data-contract/`.
