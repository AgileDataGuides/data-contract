# Pattern-Driven Toolbar Chips and Manage Patterns Tab

**24 April 2026**

AgileDataGuides today released a major UX refactor of the Data Contract canvas. Three pieces of contract metadata that were previously free-text (Status, Change Detection, History Window) are now driven by reusable pattern catalogues — the same pattern types that power the Layered Data Architecture Checklist — with a new Manage Patterns tab letting users customise the catalogue per-contract.

## The Problem

Three of the most consequential bits of metadata on a Data Contract — Status, Change Detection (was Load Type), and History Window (was Data Window) — were captured as free-text or single enums. That meant:

- Two contracts in "production" might mean two different things if one team called it "live" and another "released"
- Change Detection was an enum buried in a TypeScript file — adding a value (e.g. "Snapshots", "Database Logs") meant a code change
- History Window was a structured `{type, value, unit}` object that made the simplest cases ("All history", "7 days") feel over-engineered

Meanwhile, the Layered Data Architecture Checklist already had a sophisticated pattern-types catalogue — **Status**, **Change Detection**, **History Window**, plus 24 others — with values, value descriptions, and pattern descriptions. The Data Contract was reinventing the wheel poorly.

## The Solution

### Pattern-driven Tier 2b chips

Status, Change Detection, and History Window are now first-class chips in the Tier 2b metadata strip below the toolbar tabs. Each chip is a click-to-open dropdown that lists the pattern's values from the shared pattern catalogue (`packages/shared/data/patterns/`):

- **Status** — single-select, draws from the OpenMetadata Standards 7-stage lifecycle
- **Change Detection** — multi-select (a contract may use CDC + snapshots), draws from the change-detection pattern's catalogue
- **History Window** — single-select, draws from the history-window pattern's catalogue

Picking a value from the dropdown updates the contract's metadata and saves automatically. The chip styling matches the Checklist canvas's pattern picker so users moving between canvases see consistent UI.

### Manage Patterns tab

A new **Manage Patterns** tab joins Canvas / Dictionary / Example Data / Agreement. Inside, the user can:

- Switch between the active pattern types via a dropdown
- Add / edit / delete values for the selected pattern
- Edit the description for each value (shown in tooltips on the canvas chips)
- Edit the pattern description itself
- Search across all values of all patterns
- **Manage Pattern Types** sub-section — add custom pattern types, rename existing ones, change multi-select behaviour
- **Reset to Defaults** — wipes per-contract overrides and reverts to the shared catalogue
- **Export Patterns / Import Patterns** — JSON-bundle round-trip

Customisations are scoped to the current contract — different contracts can have different pattern catalogues. They persist as graph nodes (`contract_config` for the type list, `contract_pattern` for per-pattern overrides) so the wider Context Plane sees them too.

### Refactor — Domain + Information Product as linked nodes

Domain and Information Product moved out of the contract's root properties and into linked graph nodes (`global_domain`, `global_info_product`). Same UX in the toolbar, but now the same Domain or Information Product can be referenced from multiple contracts — and from other canvases (Concept Model, IPC) — without duplication.

## Key Benefits

- **Vocabulary control** — pattern catalogues are JSON, editable in the Manage Patterns tab, no code change required
- **Cross-canvas consistency** — the same Status / Change Detection / History Window vocabulary used across every AgileData canvas
- **Per-contract flexibility** — override the catalogue when a specific contract needs a custom value, without losing the shared defaults
- **Reusable Domain / Information Product** — link the same domain or information product across contracts, glossaries, IPCs without duplication
- **Visible at a glance** — the Tier 2b chips show the contract's lifecycle, change detection, and history window in one strip without opening any tabs

The release is available now in the Context Plane monorepo at `apps/data-contract/`.
