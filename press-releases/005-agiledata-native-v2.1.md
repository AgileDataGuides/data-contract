# Data Contract v2.1 Goes AgileData-Native + Adds Word and PDF Export

**23 April 2026**

AgileDataGuides today released Data Contract v2.1, a comprehensive renaming sweep that adopts AgileData-native vocabulary for every section of the canvas, plus two new export formats — Word (.docx-compatible HTML) and PDF.

## The Problem

The v2.0 release matched ODCS terminology section-for-section: *Quality Rules*, *SLAs*, *References*, *Data Product*. Useful for ODCS interchange, but ODCS terminology isn't how AgileData talks about these concepts internally. *Quality Rule* is one possible label but it's narrower than what AgileData means by a Trust Rule (which spans completeness, accuracy, security, and governance). *SLA* is contract-language; AgileData calls the same artefact a *Data Sync* commitment because it's about how/when data flows. *References* mixes glossary terms and external links; AgileData separates them. *Data Product* clashed with the IPC canvas's *Information Product*. Mixing vocabularies across canvases meant users had to translate in their heads.

Export was JSON, ODCS YAML, OpenMetadata JSON, and RTF. RTF opens in Word, but it doesn't preserve formatting fidelity the way native Word does. PDF — the universal share format — wasn't an option at all.

## The Solution

### v2.1 — AgileData-native naming

| ODCS / v2.0 term | AgileData / v2.1 term | Why |
|---|---|---|
| Quality Rules | **Trust Rules** | Broader concept — covers completeness, accuracy, security, governance |
| SLAs | **Data Sync** | Names the actual thing — the freshness / latency / uptime commitment for data movement |
| References | **Glossary Terms** | Distinct from external links; explicitly the business glossary anchor |
| Data Product | **Information Product** | Aligns with the IPC canvas's terminology for the same concept |
| `logicalType` (column) | **`dataType`** | Matches the Data Dictionary canvas's term |
| `publisher` (singular) | **`team[]`** (array) | A contract has multiple roles — owner, steward, engineer, consumer |

Migration runs automatically on load — old field names are remapped to new ones. The model bumps to `version: '2.1'`. ODCS export still emits the ODCS-native terms (Quality, SLA, References) — translation is the Language Framework's job.

### Dictionary tab

A new **Dictionary** tab reuses the shared `DictionaryTableView` component (already used in the Data Dictionary canvas). Renders the contract's columns as a flat table with type, classification, primary-key flag, and description in one scannable view — a complement to the canvas's card-based view.

### Export Word

The Export Word button writes the contract as HTML with `Content-Type: application/msword`, which Word, Pages, and LibreOffice all open as a native document. Headings, tables, and lists keep their formatting through the round trip.

### Export PDF

The Export PDF button uses `jsPDF` + `autoTable` to render the contract directly to a PDF file. Each section becomes a heading; columns / quality rules / SLAs render as tables; lineage becomes an indented bullet list. Identical filename pattern to the other exports.

## Key Benefits

- **Unified vocabulary** — every AgileData canvas (IPC, BEM, Concept Model, Data Dictionary, Data Contract) uses the same terms for the same things
- **Trust Rules covers more ground** — quality, accuracy, security, governance all live in one section instead of being split across Quality Rules / Policies / Compliance
- **Word + PDF for everyone** — the two formats every stakeholder can read, no install required
- **Auto-migrating** — existing contracts pick up v2.1 naming on load with no manual rewrite
- **Multi-format export** — JSON / ODCS YAML / OpenMetadata JSON / RTF / Word / PDF, all from the same canvas

Data Contract v2.1 is available now in the Context Plane monorepo at `apps/data-contract/`.
