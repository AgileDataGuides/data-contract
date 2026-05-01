# Card Edit Modal Lands on Every Section + Canvas Editing Now End-to-End Reliable

**1 May 2026**

AgileDataGuides today released a major reliability + UX update to the Data Contract canvas. Every section now has the new shared edit popup — click any card to open a modal with name, description, Cancel, Save, and Delete actions. Behind the scenes a series of persistence fixes restores end-to-end canvas-editing reliability: rename, reorder by drag-drop, add new card, delete card, and add to Lineage all now persist correctly across page reload.

## The Problem

The Data Contract canvas had three independent persistence bugs that combined to make basic editing untrustworthy:

1. **Inline rename a card** — name updated visually, but the change reverted on page reload. The standalone adapter was passing the wrong id to the store mutator and never triggering the autosave.
2. **Drag-drop reorder a card** — cards visually reordered, but the model never updated. The `order` property was stripped before reaching the store.
3. **Click + to add a new card** — card appeared in the canvas, vanished on reload. The store mutator marked the model dirty but no autosave timer fired.

A fourth bug specifically affected Lineage: the `+ Add` button on the Lineage section was wired to the wrong entity label, so adding a "lineage item" was actually overwriting the contract's main Data Asset.

There was also no popup affordance for editing or deleting a card — the only way to delete was via the chip's hover trash icon, and there was no UI at all for editing a card's description.

## The Solution

Five coordinated changes shipped together.

### Card edit modal on every section

A new shared **CardEditModal** opens on click for every card on the canvas — Data Asset, Schema/Columns (now "Details / Schema / Fields"), Trust Rules, Data Sync, Glossary Terms, Team, Personas, Delivery / Infrastructure, Lineage. The modal carries the card's name, description, and Cancel / Save / Delete actions. Pattern-driven Tier 2b chips (Status, Change Detection, History Window) keep their dropdown picker and aren't routed through the modal — they have their own pattern-aware UI.

### Card rename persists

The standalone adapter now extracts the underlying `sourceId` from the wrapped node id before forwarding to the store mutator. The page-level handler triggers the same 300ms autosave debounce every other path uses. Rename a card; reload; the new name is there.

### Drag-drop reorder persists

A new `reorderItem(itemId, newOrder)` store function splices the item to its new array slot. The adapter detects `properties.order` and routes it through. Drag a card; reload; the new order survives.

### Add new card persists

The page-level `onAddItem` / `onRemoveItem` / `handleAddNode` callbacks now trigger the same autosave debounce as every other path. Add a card; reload; it's still there.

### Lineage + Add no longer overwrites the Data Asset

The Lineage section's `entityLabel` was `global_data_asset`, which is a singular field on the contract. Hitting + Add on Lineage was clobbering the contract's main Data Asset record. Fixed: Lineage now uses `entityLabel="lineage_source"` and the store builds it as a `LineageItem` with `provType: 'entity'` so the converter emits the right `was_derived_from` link to the data asset.

### Plus a few small bits

- Section heading "Schema / Columns" renamed to **"Details / Schema / Fields"** to better reflect what the section actually carries
- Trash + toggle order on Manage Pattern Types swapped so the more frequent reversible action (toggle) sits rightmost

## How It Works

The CardEditModal is a single shared Svelte component in `packages/shared/src/components/CardEditModal.svelte`. The Data Contract `+page.svelte` derives `typeLabel` from each card's entity label (Column, Trust Rule, Data Sync, Team Member, Persona, Glossary Term, Delivery Type, Domain, Information Product, Lineage Item, Data Asset) so the modal heading reads correctly for every card type without modal-side knowledge of Data Contract internals.

The persistence fixes all funnel through the same 300ms `orderSaveTimer` debounce that was already wired for property updates and metadata changes — so canvas editing now goes through one consistent save path everywhere.

## Key Benefits

- **Editing actually works** — rename, reorder, add, delete, and Lineage + all persist across reload
- **One way to edit any card** — same popup pattern for every section
- **Description editing** — every card now exposes its description for editing, not just name
- **Lineage is safe again** — adding a Lineage item doesn't clobber the Data Asset
- **Cross-app consistency** — same shared modal as the Information Product Canvas and Business Event Matrix; users moving between SA apps see the same popup
- **Cleaner section heading** — "Details / Schema / Fields" reads as what the section actually is

The release is available now at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) and via the [live demo](https://agiledataguides.github.io/data-contract/).
