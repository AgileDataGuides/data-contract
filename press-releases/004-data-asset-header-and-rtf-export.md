# Data Asset Moves to the Header, Plus RTF Export

**23 April 2026**

AgileDataGuides today released a structural refactor of the Data Contract canvas — the Data Asset now lives in the toolbar header instead of as a card on the canvas — alongside a new RTF export that lets users drop a Data Contract straight into Word, Pages, or any other rich-text editor.

## The Problem

The previous canvas layout treated the Data Asset as just another card in the 3×3 grid. That worked, but it understated how central the Data Asset is — every other section on the canvas (columns, quality rules, lineage) is *about* that one asset. Users would frequently scroll past the Data Asset card while editing schema or quality rules, then have to scroll back to confirm which asset they were even working on.

For sharing contracts with non-technical stakeholders, JSON, ODCS YAML, and OpenMetadata JSON were the only export options. None of those open in Word. Users wanting to circulate a draft contract for sign-off were stuck either screenshotting the canvas or manually retyping everything into a doc.

## The Solution

Two related changes.

### Data Asset in the header

The Data Asset now sits in the Tier 2 toolbar — the same row as the contract name and description. A new **Data Asset picker widget** lets users pick from existing assets (so the same dataset can be governed by multiple contracts at different lifecycle stages) or type a new asset name to create one inline. The card on the canvas is gone; the asset name is permanently visible at the top while editing the rest of the contract, so context never gets lost while scrolling.

Existing contracts auto-migrate — the v1/v2.0 `dataAsset` card moves into the header on first load.

### Export RTF

A new **Export RTF** button writes the contract to a Rich Text Format file that opens cleanly in Microsoft Word, Apple Pages, LibreOffice Writer, and Google Docs (via Upload). Sections render as headings, columns as a table, quality rules and SLAs as bullet lists, and the contract's status / domain / data product appear at the top as a metadata block.

RTF is hand-rolled in a converter module (`src/lib/converters/rtf.ts`) so there's no dependency on a heavyweight Word library — the file is plain text with RTF control words, generated client-side.

## Key Benefits

- **Permanent context** — the Data Asset name is always visible while editing schema, rules, and lineage
- **Reusable assets** — the same Data Asset can be referenced from multiple contracts (e.g. a draft and a production contract for the same table)
- **Word-ready export** — circulate a Data Contract draft to non-technical stakeholders in a format they can read and comment on without installing anything
- **No new dependencies** — RTF generation is pure string manipulation

The release is available now in the Context Plane monorepo at `apps/data-contract/`.
