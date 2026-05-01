// Data Contract standalone types — AgileData-native object model.
//
// The Context Plane's canonical Data Contract uses AgileData terminology.
// Other formats (Bitol/ODCS v3, OpenMetadata, etc.) are treated as "languages"
// that translate to/from this model via the Language Framework in
// packages/shared/src/languages.
//
// v2.1 renames (from v2.0 — AgileData-native):
//   qualityRules      → trustRules          (+ QualityRule → TrustRule)
//   slas              → dataSyncs           (+ SlaItem     → DataSyncItem)
//   references        → glossaryTerms
//   dataProduct       → informationProduct  (matches IPC canvas terminology)
//   logicalType       → dataType            (matches Data Dictionary canvas)
// The migration helper in stores/contract.svelte.ts normalises v2.0 → v2.1
// on load so existing JSON imports stay valid.

/** Base item shape used by sections that don't need typed fields. */
export interface ContractItem {
	id: string;
	name: string;
	description: string;
}

/** Enriched column — one row per column in the Data Asset schema. */
export interface ColumnItem extends ContractItem {
	dataType: string;        // string | integer | decimal | date | timestamp | boolean
	required: boolean;
	unique: boolean;
	primaryKey: boolean;
	classification: string;  // public | internal | confidential | restricted
}

/**
 * Trust Rule — a data-quality expectation the Producer commits to enforce.
 * AgileData term for what Bitol/ODCS calls a "quality" rule and what
 * OpenMetadata calls a "quality expectation".
 *
 * **v2.1.1 shape (matches Checklist Policy):** Policies on the Layered Data
 * Architecture Checklist have `{id, name, description, category, rule}` where
 * `rule` is a free-text statement. Trust Rules on a Data Contract mirror this
 * shape for consistency, and add an optional `column` link so the rule can
 * target a specific schema column (or `'*'` for table-level). Legacy
 * structured fields (`ruleType`, `operator`, `threshold`) are migrated into
 * `category` and `rule` on load.
 */
export interface TrustRule extends ContractItem {
	category: string;        // e.g. 'Completeness', 'Uniqueness', 'Accuracy', 'Freshness', 'Governance', 'Security', 'Custom'
	rule: string;            // free-text rule statement, e.g. "order_id must be non-null with >= 99.5% completeness"
	column: string;          // target column name or '*' for table-level
}

/**
 * Trust Rule categories — a default library of buckets users can tag rules
 * with. Patterned on the Checklist's PoliciesFile.categories string[].
 */
export const TRUST_RULE_CATEGORIES: string[] = [
	'Completeness',
	'Uniqueness',
	'Accuracy',
	'Freshness',
	'Timeliness',
	'Validity',
	'Consistency',
	'Security',
	'Governance',
	'Custom'
];

/**
 * Data Sync — a service-level commitment about when/how data moves to the
 * consumer. AgileData term for what Bitol/ODCS calls an "SLA" or
 * "slaProperty" and what OpenMetadata calls an SLA tier.
 */
export interface DataSyncItem extends ContractItem {
	property: string;        // frequency | latency | uptime | retention | availability
	value: string;
	unit: string;            // hours | minutes | days | percent
}


/** Enriched team member — a Publisher, Consumer or Steward of the contract. */
export interface TeamMember extends ContractItem {
	role: string;            // owner | steward | engineer | analyst | consumer
}

/**
 * Lineage item — aligned with W3C PROV-O (Provenance Ontology).
 * Each item is one of three PROV-O first-class concepts:
 *   entity   — a data thing (dataset, file, report)
 *   activity — a process / transformation / ingestion run
 *   agent    — a person / team / service responsible for an activity
 *
 * upstreamIds references OTHER LineageItem IDs this one depends on.
 * The resolved relationship label depends on the provType pairing:
 *   entity→entity    = was_derived_from
 *   entity→activity  = was_generated_by  (entity was produced by activity)
 *   activity→entity  = used               (activity consumed entity as input)
 *   activity→activity = was_informed_by
 *   entity→agent     = was_attributed_to
 *   activity→agent   = was_associated_with
 */
export type ProvType = 'entity' | 'activity' | 'agent';

export interface LineageItem extends ContractItem {
	provType: ProvType;
	upstreamIds?: string[];
	role?: string;           // free-text role hint, e.g. 'raw source', 'curated', 'ingestion job'
}

/**
 * Contract lifecycle stages — aligned with OpenMetadata Standards (OMS) 7-stage model.
 * Legacy values 'draft' and 'active' are retained for backward compatibility; the
 * store's migration maps 'draft' → 'design' and 'active' → 'production' on load.
 */
/**
 * @deprecated Status values now come from the shared `status` pattern
 * (see `packages/shared/data/patterns/lookups.json`). The field on
 * ContractModel is `string[]` to match the other pattern-driven fields.
 * This alias is retained only for migration code that still references it.
 */
export type ContractStatus = string;

/** @deprecated Retained for migration only — use the `status` pattern lookups. */
export const CONTRACT_STATUS_CYCLE: string[] = [
	'Ideation',
	'Design',
	'Development',
	'Testing',
	'Production',
	'Deprecated',
	'Retired'
];

/**
 * @deprecated Replaced by the `changeDetection` string field on ContractModel
 *  plus the shared `change-detection` pattern. Kept here only for the migration
 *  step in `stores/contract.svelte.ts` which maps legacy enum values to pattern
 *  values. Do not reference in new code.
 */
export type LoadType = string;

/** @deprecated Retained for the store's legacy → pattern migration. */
export const LEGACY_LOAD_TYPE_CYCLE: string[] = ['full', 'incremental', 'cdc', 'append', 'snapshot'];

/**
 * @deprecated Replaced by the `historyWindow` string field on ContractModel
 *  plus the shared `history-window` pattern. Kept for migration of legacy
 *  structured {type, value, unit} objects — see `normaliseHistoryWindow` in
 *  the store.
 */
export type DataWindowUnit = 'days' | 'weeks' | 'months' | 'years';

/** @deprecated See `historyWindow` string + shared `history-window` pattern. */
export interface DataWindow {
	type: 'rolling' | 'all';
	value?: number;
	unit?: DataWindowUnit;
}

/**
 * Example Data — a user-supplied sample of what the data actually looks like,
 * stored as an array of rows where each row is a map from column name to
 * string cell value. Used to illustrate the shape / feel of the data to
 * consumers reading the contract. Persists through the context-plane
 * converter on the contract_model root node's properties.
 */
export type ExampleDataRow = Record<string, string>;

/**
 * A pattern type as stored on a contract — same shape as the shared `Pattern`
 * interface in `@context-plane/shared/data/patterns` plus an optional per-user
 * `enabled` toggle. When `patternTypes` on a ContractModel is `null`/`undefined`
 * the canvas falls back to the shared static defaults filtered to
 * `canvas_data_contract`. Once the user customises (toggles, deletes, adds),
 * the array is materialised onto the model and persists from then on.
 */
export interface ContractPatternType {
	id: string;
	name: string;
	order: number;
	multiSelect: boolean;
	enabled?: boolean;
	appliesTo?: string[];
}

/**
 * A per-contract override for a single pattern's values + descriptions. Keyed
 * by patternId on `ContractModel.patternOverrides`. When a pattern has no entry
 * the canvas falls back to the shared static lookups + dictionary for that
 * pattern.
 */
export interface ContractPatternOverride {
	lookupValues: string[];
	valueDescriptions: Record<string, string>;
	patternDescription: string;
}

/** v2.1 Data Contract — AgileData-native object model. */
export interface ContractModel {
	version: '2.1';
	id: string;
	name: string;
	description: string;

	// Metadata
	/**
	 * Status — lifecycle stage of the contract. Values come from the shared `status`
	 * pattern (`multiSelect: false` — one status at a time, but stored as an array
	 * for uniformity with the other pattern-driven fields). Default catalogue:
	 * Ideation · Design · Development · Testing · Production · Deprecated · Retired.
	 * Legacy enum strings (`ideation`, `design`, …, plus `draft` → `Design`,
	 * `active` → `Production`) are auto-migrated by the store.
	 */
	status: string[];
	/**
	 * Business domain this contract belongs to. Stored as a linked ContractItem so it can
	 * be reused across Concept Model (`global_domain`) and other canvases. String shape
	 * from earlier v2.1 models is auto-migrated by the store.
	 */
	domain: ContractItem | null;
	/**
	 * Information Product this contract governs delivery for. Stored as a linked
	 * ContractItem so it round-trips to the IPC canvas's `global_info_product`. String
	 * shape from earlier v2.1 models is auto-migrated by the store.
	 */
	informationProduct: ContractItem | null;
	tags: string[];
	/**
	 * Change Detection — how data changes are detected + delivered. Values come from
	 * the shared `change-detection` pattern (`multiSelect: true` — a contract can use
	 * more than one mechanism, e.g. CDC for primary + snapshots for reconciliation).
	 * Previously a single string; now an array. Legacy values auto-migrate in the
	 * store (`"x"` → `["x"]`; `""` → `[]`).
	 */
	changeDetection: string[];
	/**
	 * Retention Period — how long data is retained. Values come from the shared
	 * `default-retention-period` pattern (`multiSelect: true` — e.g. a contract might
	 * declare different periods per layer). Array for consistency with other
	 * pattern-linked fields.
	 */
	retentionPeriod: string[];
	/**
	 * History Window — the timeframe of data each delivery carries. Values come from
	 * the shared `history-window` pattern (`multiSelect: false` — one window per
	 * contract). Stored as an array (max length 1) for uniformity with the other two
	 * pattern-linked fields. Previously a structured `{type, value, unit}` object under
	 * `dataWindow`; migrated to the string `["7 days"]` / `["All history"]` form.
	 */
	historyWindow: string[];

	// Sections
	dataAsset: ContractItem | null;        // the single Data Asset governed by this contract
	team: TeamMember[];                     // Publishers / Consumers / Stewards
	personas: ContractItem[];
	columns: ColumnItem[];                  // schema
	glossaryTerms: ContractItem[];          // glossary terms used/defined by the contract
	deliveryTypes: ContractItem[];          // how data is delivered / infrastructures
	trustRules: TrustRule[];                // data-quality expectations (AgileData "Trust Rules")
	dataSyncs: DataSyncItem[];              // SLA / freshness commitments (AgileData "Data Sync")
	lineage: LineageItem[];                 // PROV-O aligned (entities / activities / agents)
	exampleData: ExampleDataRow[];          // optional user-supplied sample rows (keyed by column name)

	// ─── Per-contract pattern customisations ───────────────────────────────
	// These two fields back the "Manage Pattern Types" UI (ContractPatternsTab).
	// In the embedded Context Plane (DuckDB-backed adapter) they're emitted as
	// `contract_config` + `contract_pattern` graph nodes. In standalone mode
	// the standalone-adapter writes through to these fields so the same UI
	// persists. Both are optional — `null`/`undefined`/`{}` means "use the
	// shared static defaults" (filtered to canvas_data_contract).

	/**
	 * User-customised pattern type list. `null`/`undefined` = use static defaults.
	 * Set as soon as the user adds, removes, edits, toggles, or trashes any
	 * pattern type.
	 */
	patternTypes?: ContractPatternType[] | null;

	/**
	 * Per-pattern value + description overrides keyed by patternId. Missing key
	 * = no override for that pattern (use static lookups + dictionary).
	 */
	patternOverrides?: Record<string, ContractPatternOverride>;
}

// Node representation used by canvas components (flat, adapter-compatible)
export interface ContractNode {
	id: string;
	label: string;
	name: string;
	description?: string;
	properties?: Record<string, unknown>;
}
