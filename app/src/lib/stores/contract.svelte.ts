import type {
	ContractModel,
	ContractItem,
	ColumnItem,
	TrustRule,
	DataSyncItem,
	TeamMember,
	LineageItem,
	ProvType,
	ExampleDataRow,
	ContractPatternType,
	ContractPatternOverride
} from '../types';
import { getDeliveryTypeByLabel } from '$lib/shared-data/delivery-types';

/**
 * Normalise lineage items to the PROV-O aligned shape.
 * Legacy lineage entries are plain ContractItems without provType — they default
 * to 'entity' (the most common case: upstream/downstream data assets).
 */
function normaliseLineage(raw: unknown): LineageItem[] {
	if (!Array.isArray(raw)) return [];
	return (raw as Record<string, unknown>[]).map((r) => {
		const pt = r.provType as ProvType | undefined;
		const validProv: ProvType[] = ['entity', 'activity', 'agent'];
		return {
			id: (r.id as string) || 'lin-unknown',
			name: (r.name as string) || '',
			description: (r.description as string) || '',
			provType: pt && validProv.includes(pt) ? pt : 'entity',
			upstreamIds: Array.isArray(r.upstreamIds) ? (r.upstreamIds as string[]) : undefined,
			role: (r.role as string) || undefined
		};
	});
}

function createId(prefix: string): string {
	const rand = typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}

function slugify(name: string, existing: string[]): string {
	let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
	if (!existing.includes(base)) return base;
	let i = 2;
	while (existing.includes(`${base}-${i}`)) i++;
	return `${base}-${i}`;
}

// --- Migration: v1.0 → v2.0 -------------------------------------------------

/**
 * Normalise legacy status values to the OMS 7-stage lifecycle.
 * draft   → design   (still being drafted)
 * active  → production (live)
 * Everything else passes through unchanged.
 */
/**
 * Map any raw status input (legacy enum, single label string, or array) to the
 * canonical string[] shape expected by the new pattern-driven Status dropdown.
 * Values come from the shared `status` pattern (Title Case labels). Legacy
 * lowercase enum keys + `draft` / `active` aliases are mapped to their nearest
 * pattern label.
 */
const STATUS_LEGACY_MAP: Record<string, string> = {
	// Lowercase enum keys → Title Case pattern labels.
	ideation: 'Ideation',
	design: 'Design',
	development: 'Development',
	testing: 'Testing',
	production: 'Production',
	deprecated: 'Deprecated',
	retired: 'Retired',
	// Pre-OMS aliases.
	draft: 'Design',
	active: 'Production'
};

function normaliseStatus(raw: unknown): string[] {
	const mapOne = (s: string): string => STATUS_LEGACY_MAP[s.toLowerCase()] ?? s;
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean)
			.map(mapOne);
	}
	if (typeof raw === 'string') {
		const t = raw.trim();
		return t ? [mapOne(t)] : [];
	}
	return [];
}

/**
 * Normalise load type to a known value. Unknown / missing values default to 'full'
 * which matches the historical behaviour (no load type specified = full refresh).
 */
/**
 * Normalise load type. Values come from the shared `change-detection` pattern
 * now; legacy enum values from earlier v2.1 models map to their closest
 * change-detection equivalent so existing contracts don't lose their semantics.
 *
 *   full        → Snapshots                                (full rebuild each run)
 *   snapshot    → Snapshots                                (already snapshot semantics)
 *   incremental → Change Data Capture (Database Logs)      (most common interpretation)
 *   cdc         → Change Data Capture (Database Logs)      (explicit CDC)
 *   append      → Streaming Inserts                        (appends rows as they arrive)
 *
 * Anything that isn't recognised passes through unchanged (the UI will still
 * render it — the cycling chip just won't re-select it unless the user adds
 * the value to the change-detection pattern).
 */
const LEGACY_LOAD_TYPE_MAP: Record<string, string> = {
	full: 'Snapshots',
	snapshot: 'Snapshots',
	incremental: 'Change Data Capture (Database Logs)',
	cdc: 'Change Data Capture (Database Logs)',
	append: 'Streaming Inserts'
};

/**
 * Normalise change-detection (pattern-linked, now an array) from legacy shapes:
 *   - undefined / null / empty string → []
 *   - plain string → [mappedValue] (enum → nearest change-detection value when known)
 *   - array of strings → each element run through the legacy map
 * Unknown values pass through unchanged so user-added pattern values keep rendering.
 */
function normaliseChangeDetection(raw: unknown): string[] {
	if (raw == null) return [];
	if (typeof raw === 'string') {
		const t = raw.trim();
		if (!t) return [];
		return [LEGACY_LOAD_TYPE_MAP[t] ?? t];
	}
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean)
			.map((v) => LEGACY_LOAD_TYPE_MAP[v] ?? v);
	}
	return [];
}

/** Normalise a simple string / string[] pattern-linked field to a string array. */
function normaliseStringArray(raw: unknown): string[] {
	if (raw == null) return [];
	if (typeof raw === 'string') {
		const t = raw.trim();
		return t ? [t] : [];
	}
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean);
	}
	return [];
}

/**
 * Normalise a legacy trust rule to the v2.1.1 Policy-shape.
 *
 *   Old (v2.0 / early v2.1): {id, name, description, ruleType, column, operator, threshold}
 *   New:                     {id, name, description, category, rule, column}
 *
 * The legacy structured fields collapse into a human-readable `rule` string —
 * `"{ruleType} {operator} {threshold}"` when all three are present,
 * falling back to just whatever piece was populated. The `ruleType` is
 * title-cased into `category`. Values that already carry the new shape pass
 * through unchanged.
 */
function normaliseTrustRule(raw: unknown): TrustRule {
	const r = (raw as Record<string, unknown>) || {};
	const id = (r.id as string) || 'tr-unknown';
	const name = (r.name as string) || 'Trust Rule';
	const description = (r.description as string) || '';
	const column = (r.column as string) || '*';

	// Already migrated?
	const existingCategory = (r.category as string | undefined)?.trim();
	const existingRule = (r.rule as string | undefined)?.trim();
	if (existingCategory && existingRule != null) {
		return { id, name, description, category: existingCategory, rule: existingRule, column };
	}

	// Legacy → migrate.
	const ruleType = ((r.ruleType as string) || '').trim();
	const operator = ((r.operator as string) || '').trim();
	const threshold = ((r.threshold as string) || '').trim();
	const category = existingCategory || (ruleType ? ruleType.charAt(0).toUpperCase() + ruleType.slice(1) : 'Custom');
	const ruleParts = [ruleType, operator, threshold].filter((p) => p && p.length > 0);
	const rule = existingRule ?? (ruleParts.length > 0 ? ruleParts.join(' ') : description || name);

	return { id, name, description, category, rule, column };
}

/**
 * Normalise example data. Accepts an array of {columnName → cellValue} maps.
 * Anything else (missing, null, not-array) yields an empty array.
 */
function normaliseExampleData(raw: unknown): ExampleDataRow[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
		.map((r) => {
			const out: ExampleDataRow = {};
			for (const [k, v] of Object.entries(r)) {
				if (v == null) continue;
				out[k] = String(v);
			}
			return out;
		});
}

/**
 * Normalise a "linked item" field that was previously stored as a free-text string
 * (e.g. `domain: "Sales"` or `informationProduct: "Customer Orders"`) and is now a
 * ContractItem linked via a graph relationship. Accepts:
 *   - null / undefined / empty string → null
 *   - plain string → ContractItem with a deterministic id based on a slug of the name
 *   - object with {name,id?,description?} → normalise to ContractItem
 * The deterministic id (vs a random one) means repeated migrations of the same
 * string value produce the same ContractItem, so cross-model matching by id works.
 */
function normaliseLinkedItem(raw: unknown, prefix: string): ContractItem | null {
	if (raw == null) return null;
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
		return { id: `${prefix}-${slug}`, name: trimmed, description: '' };
	}
	if (typeof raw === 'object') {
		const r = raw as Record<string, unknown>;
		const name = (r.name as string | undefined)?.trim();
		if (!name) return null;
		const id = (r.id as string) || `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
		return { id, name, description: (r.description as string) || '' };
	}
	return null;
}

/**
 * Normalise history window. Current shape is a plain string matching one of the
 * `history-window` pattern values (`All history`, `1 day`, `7 days`, `1 year`…).
 * Legacy v2.1 models stored this as a structured `{type, value, unit}` object under
 * `dataWindow` — we stringify those into the closest pattern value. Unknown strings
 * pass through unchanged so user-added pattern values keep rendering.
 *
 *   { type: 'all' }                             → "All history"
 *   { type: 'rolling', value: 7, unit: 'days' } → "7 days"
 *   { type: 'rolling', value: 1, unit: 'days' } → "1 day"
 *   { type: 'rolling', value: 1, unit: 'years'} → "1 year"
 */
/**
 * Normalise history window to string[]. Accepts:
 *   - string (legacy) → [string]
 *   - structured {type, value, unit} (v2.1 legacy) → stringified + wrapped
 *   - string[] (current) → trimmed, empties filtered
 *   - anything else → []
 */
function normaliseHistoryWindow(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean);
	}
	if (typeof raw === 'string') {
		const t = raw.trim();
		return t ? [t] : [];
	}
	if (raw && typeof raw === 'object') {
		const w = raw as Record<string, unknown>;
		if (w.type === 'rolling') {
			const value = typeof w.value === 'number' && w.value > 0 ? Math.floor(w.value) : 7;
			const unit = (w.unit as string | undefined) ?? 'days';
			const singular =
				unit === 'days' ? 'day' : unit === 'weeks' ? 'week' : unit === 'months' ? 'month' : 'year';
			return [value === 1 ? `1 ${singular}` : `${value} ${unit}`];
		}
		if (w.type === 'all') return ['All history'];
	}
	return [];
}

/**
 * Migrate an older ContractModel to the current v2.1 structure.
 *   v1.0: publisher (singular), glossaryTerms, dataSyncs, policies
 *   v2.0: team (array), references, slas, qualityRules + metadata (ODCS-aligned)
 *   v2.1: trustRules (was qualityRules), dataSyncs (was slas),
 *         glossaryTerms (was references) — AgileData-native naming
 *
 * Runs on every load — idempotent for models already at v2.1. Also
 * normalises `status` to the OMS 7-stage lifecycle.
 */
export function migrateModel(m: Record<string, unknown>): ContractModel {
	const currentVersion = (m as { version?: string }).version;

	// v2.0 → v2.1 (field-name refactor to AgileData terminology)
	if (currentVersion === '2.0') {
		const v2 = m as Record<string, unknown>;
		const rawRules = (v2.trustRules as unknown[] | undefined)
			?? (v2.qualityRules as unknown[] | undefined)
			?? [];
		const trustRules = rawRules.map(normaliseTrustRule);
		const dataSyncs = (v2.dataSyncs as DataSyncItem[] | undefined)
			?? (v2.slas as DataSyncItem[] | undefined)
			?? [];
		const glossaryTerms = (v2.glossaryTerms as ContractItem[] | undefined)
			?? (v2.references as ContractItem[] | undefined)
			?? [];
		const informationProductRaw = v2.informationProduct ?? v2.dataProduct ?? null;
		const informationProduct = normaliseLinkedItem(informationProductRaw, 'info-product');
		const domain = normaliseLinkedItem(v2.domain, 'domain');
		const oldColumns = (v2.columns as Array<Record<string, unknown>> | undefined) ?? [];
		const columns = oldColumns.map((c) => ({
			...c,
			dataType: (c.dataType as string | undefined) ?? (c.logicalType as string | undefined) ?? 'string'
		})) as ColumnItem[];
		return {
			...(v2 as unknown as ContractModel),
			version: '2.1',
			status: normaliseStatus(v2.status),
			domain,
			informationProduct,
			// Pattern-linked fields — all arrays now. Legacy single strings / structured
			// objects get wrapped + stringified (see normaliseChangeDetection /
			// normaliseHistoryWindow / normaliseStringArray).
			changeDetection: normaliseChangeDetection(v2.changeDetection ?? v2.loadType),
			historyWindow: normaliseHistoryWindow(v2.historyWindow ?? v2.dataWindow),
			retentionPeriod: normaliseStringArray(v2.retentionPeriod),
			trustRules,
			dataSyncs,
			glossaryTerms,
			columns,
			lineage: normaliseLineage(v2.lineage),
			exampleData: normaliseExampleData(v2.exampleData),
			patternTypes: (v2.patternTypes as ContractPatternType[] | undefined) ?? null,
			patternOverrides: (v2.patternOverrides as Record<string, ContractPatternOverride> | undefined) ?? {}
		};
	}

	// Already v2.1 — still accept legacy field names in case an older v2.1
	// export floated around during the renames. Normalise status + lineage too.
	if (currentVersion === '2.1') {
		const v21 = m as Record<string, unknown>;
		const glossaryTerms = (v21.glossaryTerms as ContractItem[] | undefined)
			?? (v21.references as ContractItem[] | undefined)
			?? [];
		const informationProductRaw = v21.informationProduct ?? v21.dataProduct ?? null;
		const informationProduct = normaliseLinkedItem(informationProductRaw, 'info-product');
		const domain = normaliseLinkedItem(v21.domain, 'domain');
		const oldColumns = (v21.columns as Array<Record<string, unknown>> | undefined) ?? [];
		const columns = oldColumns.map((c) => ({
			...c,
			dataType: (c.dataType as string | undefined) ?? (c.logicalType as string | undefined) ?? 'string'
		})) as ColumnItem[];
		const rawRules21 = (v21.trustRules as unknown[] | undefined)
			?? (v21.qualityRules as unknown[] | undefined)
			?? [];
		const trustRules21 = rawRules21.map(normaliseTrustRule);
		return {
			...(v21 as unknown as ContractModel),
			status: normaliseStatus(v21.status as string),
			domain,
			informationProduct,
			changeDetection: normaliseChangeDetection(v21.changeDetection ?? v21.loadType),
			historyWindow: normaliseHistoryWindow(v21.historyWindow ?? v21.dataWindow),
			retentionPeriod: normaliseStringArray(v21.retentionPeriod),
			glossaryTerms,
			columns,
			trustRules: trustRules21,
			lineage: normaliseLineage(v21.lineage),
			exampleData: normaliseExampleData(v21.exampleData),
			patternTypes: (v21.patternTypes as ContractPatternType[] | undefined) ?? null,
			patternOverrides: (v21.patternOverrides as Record<string, ContractPatternOverride> | undefined) ?? {}
		};
	}

	// v1.0 or unknown — full migration
	const old = m as Record<string, unknown>;

	// publisher (singular) → team (array)
	const oldPublisher = old.publisher as ContractItem | null;
	const team: TeamMember[] = [];
	if (oldPublisher) {
		team.push({ ...oldPublisher, role: 'owner' });
	}

	// glossary terms — v1 used `glossaryTerms`, v2.0 used `references`, v2.1 back to `glossaryTerms`
	const glossaryTerms = (old.glossaryTerms as ContractItem[] | undefined)
		?? (old.references as ContractItem[] | undefined)
		?? [];

	// policies (plain items) → trustRules (Policy-shape) — accepts either old name
	const oldRules = (old.trustRules as unknown[] | undefined)
		?? (old.qualityRules as unknown[] | undefined)
		?? (old.policies as unknown[] | undefined)
		?? [];
	const trustRules: TrustRule[] = oldRules.map(normaliseTrustRule);

	// dataSyncs (plain items) → dataSyncs (typed) — accepts either old name
	const oldSyncs = (old.dataSyncs as ContractItem[] | undefined)
		?? (old.slas as ContractItem[] | undefined)
		?? [];
	const dataSyncs: DataSyncItem[] = oldSyncs.map((s) => {
		const rich = s as Partial<DataSyncItem>;
		return {
			id: s.id,
			name: s.name,
			description: s.description,
			property: rich.property ?? 'frequency',
			value: rich.value ?? '',
			unit: rich.unit ?? ''
		};
	});

	// columns (plain items) → columns (typed)
	const oldColumns = (old.columns as ContractItem[] | undefined) ?? [];
	const columns: ColumnItem[] = oldColumns.map((c) => {
		const rich = c as Partial<ColumnItem> & { logicalType?: string };
		return {
			id: c.id,
			name: c.name,
			description: c.description,
			dataType: rich.dataType ?? rich.logicalType ?? 'string',
			required: rich.required ?? false,
			unique: rich.unique ?? false,
			primaryKey: rich.primaryKey ?? false,
			classification: rich.classification ?? 'internal'
		};
	});

	return {
		version: '2.1',
		id: (old.id as string) || 'imported',
		name: (old.name as string) || 'Imported Contract',
		description: (old.description as string) || '',
		status: normaliseStatus(old.status),
		domain: normaliseLinkedItem(old.domain, 'domain'),
		informationProduct: normaliseLinkedItem(old.informationProduct ?? old.dataProduct, 'info-product'),
		tags: (old.tags as string[]) || [],
		changeDetection: normaliseChangeDetection(old.changeDetection ?? old.loadType),
		historyWindow: normaliseHistoryWindow(old.historyWindow ?? old.dataWindow),
		retentionPeriod: normaliseStringArray(old.retentionPeriod),
		dataAsset: (old.dataAsset as ContractItem | null) || null,
		team,
		personas: (old.personas as ContractItem[] | undefined) || [],
		columns,
		glossaryTerms,
		deliveryTypes: (old.deliveryTypes as ContractItem[] | undefined) || [],
		trustRules,
		dataSyncs,
		lineage: normaliseLineage(old.lineage),
		exampleData: normaliseExampleData(old.exampleData),
		patternTypes: (old.patternTypes as ContractPatternType[] | undefined) ?? null,
		patternOverrides: (old.patternOverrides as Record<string, ContractPatternOverride> | undefined) ?? {}
	};
}

// --- Single reactive store --------------------------------------------------

function emptyModel(): ContractModel {
	return {
		version: '2.1',
		id: 'empty',
		name: 'Loading...',
		description: '',
		status: ['Design'],
		domain: null,
		informationProduct: null,
		tags: [],
		changeDetection: ['Snapshots'],
		historyWindow: ['All history'],
		retentionPeriod: [],
		dataAsset: null,
		team: [],
		personas: [],
		columns: [],
		glossaryTerms: [],
		deliveryTypes: [],
		trustRules: [],
		dataSyncs: [],
		lineage: [],
		exampleData: [],
		patternTypes: null,
		patternOverrides: {}
	};
}

export const store = $state({
	savedList: [] as { id: string; name: string }[],
	model: emptyModel(),
	dirty: false,
	loaded: false
});

// --- Demo mode (GitHub Pages static build) ---------------------------------
//
// When the SvelteKit app is built with `DEMO_BUILD=true VITE_DEMO_MODE=true`
// (the `pnpm build:demo` script), all persistence flips to localStorage. The
// SvelteKit `+server.ts` API routes don't exist on a static GitHub Pages
// deployment, so we shim them. Normal dev / standalone install keeps using
// the API routes against `../data/`.
const DEMO_MODE =
	typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_DEMO_MODE?: string } }).env?.VITE_DEMO_MODE === 'true';
const LS_KEY = 'data-contract-demo-models';

function lsGetAll(): Record<string, ContractModel> {
	try {
		const raw = localStorage.getItem(LS_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function lsSaveAll(models: Record<string, ContractModel>): void {
	localStorage.setItem(LS_KEY, JSON.stringify(models));
}

// NOTE: demo-mode seed imports live in `./demo-seed.ts`, NOT here. That file
// uses the `$data` Vite alias (only defined in the standalone app's own
// vite.config.ts) and is imported only by the SA `+page.svelte`. The Context
// Plane frontend transitively imports this store through the data-contract
// package's converter exports, so any `$data/...` imports added at module
// scope here would break the CP dev build with "Failed to resolve import".
// Keep that aliased path confined to demo-seed.ts.

// --- API helpers -----------------------------------------------------------

async function apiListModels(): Promise<ContractModel[]> {
	if (DEMO_MODE) return Object.values(lsGetAll());
	const res = await fetch('/api/models');
	return res.json();
}

async function apiSaveModel(m: ContractModel): Promise<void> {
	if (DEMO_MODE) {
		const all = lsGetAll();
		all[m.id] = m;
		lsSaveAll(all);
		return;
	}
	await fetch(`/api/models/${m.id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(m)
	});
}

async function apiCreateModel(m: ContractModel): Promise<void> {
	if (DEMO_MODE) {
		const all = lsGetAll();
		all[m.id] = m;
		lsSaveAll(all);
		return;
	}
	await fetch('/api/models', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(m)
	});
}

async function apiDeleteModel(id: string): Promise<void> {
	if (DEMO_MODE) {
		const all = lsGetAll();
		delete all[id];
		lsSaveAll(all);
		return;
	}
	await fetch(`/api/models/${id}`, { method: 'DELETE' });
}

// --- Example model (v2.1, AgileData-native) --------------------------------

function makeExampleModel(): ContractModel {
	return {
		version: '2.1',
		id: 'example-contract',
		name: 'Customer Orders Contract',
		description: 'Data contract for the customer orders dataset',
		status: ['Production'],
		domain: { id: 'domain-sales', name: 'Sales', description: 'Sales & Revenue domain' },
		informationProduct: { id: 'info-product-customer-orders', name: 'Customer Orders', description: '' },
		tags: ['orders', 'customers', 'sales'],
		changeDetection: ['Change Data Capture (Database Logs)'],
		historyWindow: ['7 days'],
		retentionPeriod: ['7 years'],
		dataAsset: {
			id: 'asset-001',
			name: 'Customer Orders',
			description: 'All customer order transactions'
		},
		team: [
			{
				id: 'team-001',
				name: 'Order Processing Team',
				description: 'Owns the order data pipeline',
				role: 'owner'
			},
			{
				id: 'team-002',
				name: 'Data Steward — Sales',
				description: 'Ensures data quality and governance',
				role: 'steward'
			}
		],
		personas: [
			{ id: 'persona-001', name: 'Sales Analyst', description: 'Analyses sales trends and patterns' },
			{ id: 'persona-002', name: 'Finance Team', description: 'Uses order data for revenue reporting' }
		],
		columns: [
			{
				id: 'col-001',
				name: 'order_id',
				description: 'Unique order identifier',
				dataType: 'integer',
				required: true,
				unique: true,
				primaryKey: true,
				classification: 'internal'
			},
			{
				id: 'col-002',
				name: 'customer_id',
				description: 'Foreign key to customer',
				dataType: 'string',
				required: true,
				unique: false,
				primaryKey: false,
				classification: 'internal'
			},
			{
				id: 'col-003',
				name: 'order_date',
				description: 'When the order was placed',
				dataType: 'date',
				required: true,
				unique: false,
				primaryKey: false,
				classification: 'internal'
			},
			{
				id: 'col-004',
				name: 'total_amount',
				description: 'Total order value',
				dataType: 'decimal',
				required: false,
				unique: false,
				primaryKey: false,
				classification: 'confidential'
			}
		],
		glossaryTerms: [
			{
				id: 'gt-001',
				name: 'Customer',
				description: 'An individual or organisation that purchases products'
			},
			{
				id: 'gt-002',
				name: 'Revenue',
				description: 'Total income from sales before expenses'
			}
		],
		deliveryTypes: [
			// Catalog-linked entries — name matches a label in packages/shared/data/delivery-types.json.
			// Bitol export maps these to ODCS server types via the typeKey.
			{ id: 'dt-001', name: 'BigQuery', description: 'Production analytics warehouse (acme-analytics-prod.sales)', typeKey: 'bigquery' } as ContractItem & { typeKey: string },
			{ id: 'dt-002', name: 'Amazon S3', description: 'Raw Parquet landing zone (s3://acme-raw/orders/)', typeKey: 's3' } as ContractItem & { typeKey: string },
			{ id: 'dt-003', name: 'Looker', description: 'Published to Sales Analytics Looker dashboard', typeKey: 'looker' } as ContractItem & { typeKey: string }
		],
		trustRules: [
			{
				id: 'tr-001',
				name: 'order_id completeness',
				description: 'order_id must never be null',
				category: 'Completeness',
				rule: 'order_id is non-null on at least 99.5% of rows',
				column: 'order_id'
			},
			{
				id: 'tr-002',
				name: 'total_amount non-negative',
				description: 'order totals must be non-negative',
				category: 'Accuracy',
				rule: 'total_amount >= 0 on at least 99.5% of rows',
				column: 'total_amount'
			}
		],
		dataSyncs: [
			{
				id: 'ds-001',
				name: 'Daily refresh',
				description: 'Data refreshed every 24 hours',
				property: 'frequency',
				value: '24',
				unit: 'hours'
			},
			{
				id: 'ds-002',
				name: 'Uptime',
				description: 'Availability target',
				property: 'uptime',
				value: '99.9',
				unit: 'percent'
			}
		],
		lineage: [
			{ id: 'lin-001', name: 'ERP System', description: 'Source: SAP order transactions', provType: 'entity', role: 'raw source' },
			{ id: 'lin-002', name: 'Nightly Orders ETL', description: 'Ingestion job that extracts SAP orders into the warehouse', provType: 'activity', upstreamIds: ['lin-001'], role: 'ingestion' },
			{ id: 'lin-003', name: 'Analytics Warehouse', description: 'Central analytics layer (downstream consumer)', provType: 'entity', upstreamIds: ['lin-002'], role: 'curated' },
			{ id: 'lin-004', name: 'Data Engineering', description: 'Team responsible for the pipeline', provType: 'agent', upstreamIds: ['lin-002'], role: 'operator' }
		],
		exampleData: [
			{ order_id: '1001', customer_id: 'C-042', order_date: '2026-04-20', total_amount: '149.95' },
			{ order_id: '1002', customer_id: 'C-173', order_date: '2026-04-21', total_amount: '89.00' },
			{ order_id: '1003', customer_id: 'C-042', order_date: '2026-04-22', total_amount: '312.50' }
		],
		patternTypes: null,
		patternOverrides: {}
	};
}

// --- Init ------------------------------------------------------------------

export async function initStore() {
	if (store.loaded) return;
	const models = await apiListModels();

	// Demo-mode seeding (when localStorage is empty) is handled by the SA
	// `+page.svelte` calling `seedDemoIfEmpty()` from `./demo-seed.ts` BEFORE
	// initStore runs. The store stays generic so the CP frontend can import
	// this module via the converter without pulling in the SA-only `$data`
	// alias.

	if (models.length === 0) {
		const example = makeExampleModel();
		await apiCreateModel(example);
		store.savedList = [{ id: example.id, name: example.name }];
		store.model = example;
	} else {
		store.savedList = models.map((m) => ({ id: m.id, name: m.name }));
		const lastId = typeof window !== 'undefined' ? localStorage.getItem('dc-current-id') : null;
		const found = models.find((m) => m.id === lastId);
		const selected = found || models[0];
		const migrated = migrateModel(selected as unknown as Record<string, unknown>);
		// Persist migration if the model was at an older version
		if ((selected as { version?: string }).version !== '2.1') {
			await apiSaveModel(migrated);
		}
		store.model = migrated;
	}
	store.dirty = false;
	store.loaded = true;
}

// --- Model CRUD ------------------------------------------------------------

export async function switchTo(id: string) {
	if (store.dirty) {
		try { await saveModel(); } catch { /* best effort */ }
	}
	const res = await fetch(`/api/models/${id}`);
	if (res.ok) {
		const loaded = await res.json();
		const migrated = migrateModel(loaded);
		if (loaded.version !== '2.1') {
			await apiSaveModel(migrated);
		}
		store.model = migrated;
		store.dirty = false;
		if (typeof window !== 'undefined') {
			localStorage.setItem('dc-current-id', id);
		}
	}
}

export async function saveModel() {
	const snapshot = JSON.parse(JSON.stringify(store.model));
	await apiSaveModel(snapshot);
	const idx = store.savedList.findIndex((s) => s.id === store.model.id);
	if (idx >= 0) {
		store.savedList[idx] = { id: store.model.id, name: store.model.name };
	}
	store.dirty = false;
}

function markDirty() {
	store.dirty = true;
}

export async function newModel(name: string) {
	const existingIds = store.savedList.map((s) => s.id);
	const id = slugify(name, existingIds);
	const newM: ContractModel = {
		version: '2.1',
		id,
		name,
		description: '',
		status: ['Design'],
		domain: null,
		informationProduct: null,
		tags: [],
		changeDetection: ['Snapshots'],
		historyWindow: ['All history'],
		retentionPeriod: [],
		dataAsset: null,
		team: [],
		personas: [],
		columns: [],
		glossaryTerms: [],
		deliveryTypes: [],
		trustRules: [],
		dataSyncs: [],
		lineage: [],
		exampleData: []
	};
	(newM as ContractModel).patternTypes = null;
	(newM as ContractModel).patternOverrides = {};
	await apiCreateModel(newM);
	store.savedList = [...store.savedList, { id, name }];
	store.model = newM;
	store.dirty = false;
	if (typeof window !== 'undefined') {
		localStorage.setItem('dc-current-id', id);
	}
}

export async function deleteModel(id: string) {
	await apiDeleteModel(id);
	store.savedList = store.savedList.filter((s) => s.id !== id);
	if (store.savedList.length > 0) {
		await switchTo(store.savedList[0].id);
	} else {
		const example = makeExampleModel();
		await apiCreateModel(example);
		store.savedList = [{ id: example.id, name: example.name }];
		store.model = example;
	}
	store.dirty = false;
}

export function renameModel(name: string) {
	store.model.name = name;
	markDirty();
}

export function updateDescription(desc: string) {
	store.model.description = desc;
	markDirty();
}

/** Update any of the root-level metadata fields (status, tags, changeDetection,
 *  retentionPeriod, historyWindow, exampleData). `domain` and `informationProduct`
 *  are NOT metadata properties any more — they're linked graph nodes added /
 *  removed via addItem / removeItem using global_domain / global_info_product. */
export function updateMetadata(
	updates: Partial<Pick<ContractModel, 'status' | 'tags' | 'changeDetection' | 'retentionPeriod' | 'historyWindow' | 'exampleData'>>
) {
	if (updates.status !== undefined) store.model.status = updates.status;
	if (updates.tags !== undefined) store.model.tags = updates.tags;
	if (updates.changeDetection !== undefined) store.model.changeDetection = updates.changeDetection;
	if (updates.retentionPeriod !== undefined) store.model.retentionPeriod = updates.retentionPeriod;
	if (updates.historyWindow !== undefined) store.model.historyWindow = updates.historyWindow;
	if (updates.exampleData !== undefined) store.model.exampleData = updates.exampleData;
	markDirty();
}

// --- Section CRUD ----------------------------------------------------------

/** Field name mapping from entity labels to ContractModel fields */
const LABEL_TO_FIELD: Record<string, { field: keyof ContractModel; singular?: boolean }> = {
	global_data_asset: { field: 'dataAsset', singular: true },
	global_domain: { field: 'domain', singular: true },
	global_info_product: { field: 'informationProduct', singular: true },
	global_publisher: { field: 'team' },                  // now array, not singular
	global_persona: { field: 'personas' },
	dict_column: { field: 'columns' },
	global_glossary_term: { field: 'glossaryTerms' },     // AgileData term
	global_delivery_type: { field: 'deliveryTypes' },
	global_data_sync: { field: 'dataSyncs' },             // AgileData term
	global_policy: { field: 'trustRules' },               // AgileData term
	lineage_source: { field: 'lineage' },
	lineage_enrichment: { field: 'lineage' },
	lineage_downstream: { field: 'lineage' }
};

/** Build a typed item with sensible defaults based on the entity label. */
function buildItem(entityLabel: string, name: string): ContractItem {
	const base: ContractItem = {
		id: createId(entityLabel.slice(0, 8)),
		name,
		description: ''
	};

	if (entityLabel === 'dict_column') {
		return {
			...base,
			dataType: 'string',
			required: false,
			unique: false,
			primaryKey: false,
			classification: 'internal'
		} as ColumnItem;
	}

	if (entityLabel === 'global_policy') {
		return {
			...base,
			category: 'Custom',
			rule: '',
			column: '*'
		} as TrustRule;
	}

	if (entityLabel === 'global_data_sync') {
		return { ...base, property: '', value: '', unit: '' } as DataSyncItem;
	}

	if (entityLabel === 'global_publisher') {
		return { ...base, role: 'engineer' } as TeamMember;
	}

	if (entityLabel === 'global_delivery_type') {
		// When the user picked a value from the catalog datalist, the name
		// will match a catalog entry. Resolve it to a typeKey so language
		// modules (Bitol, OpenMetadata) can translate to ODCS type enums
		// without re-guessing. Free-typed names land with typeKey='custom'.
		const catalogEntry = getDeliveryTypeByLabel(name);
		const typeKey = catalogEntry?.key || 'custom';
		return { ...base, typeKey } as ContractItem & { typeKey: string };
	}

	if (
		entityLabel === 'lineage_source' ||
		entityLabel === 'lineage_enrichment' ||
		entityLabel === 'lineage_downstream'
	) {
		// LineageItem requires a provType — without it, the converter would
		// create the node but skip the `was_derived_from` / `was_generated_by`
		// / `was_attributed_to` link to the contract's data asset, and the
		// Lineage CanvasSection (which filters by those links) would hide
		// the card. Default to 'entity' (the most common starting point — a
		// new upstream dataset). The user can change provType later via the
		// detail / edit modal.
		const provType: ProvType =
			entityLabel === 'lineage_enrichment' ? 'activity' :
			entityLabel === 'lineage_downstream' ? 'entity' :
			'entity';
		return { ...base, provType, upstreamIds: [] } as LineageItem;
	}

	return base;
}

export function addItem(entityLabel: string, name: string): ContractItem | null {
	const mapping = LABEL_TO_FIELD[entityLabel];
	if (!mapping) return null;

	const item = buildItem(entityLabel, name);

	if (mapping.singular) {
		(store.model as Record<string, unknown>)[mapping.field] = item;
	} else {
		const arr = store.model[mapping.field] as ContractItem[];
		arr.push(item);
	}
	markDirty();
	return item;
}

export function removeItem(entityLabel: string, itemId: string) {
	const mapping = LABEL_TO_FIELD[entityLabel];
	if (!mapping) return;

	if (mapping.singular) {
		const current = store.model[mapping.field] as ContractItem | null;
		if (current?.id === itemId) {
			(store.model as Record<string, unknown>)[mapping.field] = null;
		}
	} else {
		const arr = store.model[mapping.field] as ContractItem[];
		const idx = arr.findIndex((i) => i.id === itemId);
		if (idx >= 0) arr.splice(idx, 1);
	}
	markDirty();
}

export function updateItemName(itemId: string, newName: string) {
	// Singular fields
	if (store.model.dataAsset?.id === itemId) {
		store.model.dataAsset.name = newName;
		markDirty();
		return;
	}
	if (store.model.domain?.id === itemId) {
		store.model.domain.name = newName;
		markDirty();
		return;
	}
	if (store.model.informationProduct?.id === itemId) {
		store.model.informationProduct.name = newName;
		markDirty();
		return;
	}
	// Array fields
	const arrays: (keyof ContractModel)[] = [
		'team', 'personas', 'columns', 'glossaryTerms', 'deliveryTypes', 'trustRules', 'dataSyncs', 'lineage'
	];
	for (const field of arrays) {
		const arr = store.model[field] as ContractItem[];
		const item = arr.find((i) => i.id === itemId);
		if (item) {
			const oldName = item.name;
			item.name = newName;

			// Cascade: if a column was renamed, every Trust Rule that targets
			// the old name should follow. Keeps rule.column references live
			// without requiring a separate ID lookup.
			if (field === 'columns' && oldName !== newName) {
				cascadeColumnRename(oldName, newName);
			}

			markDirty();
			return;
		}
	}
}

/** Rename cascades from a column to every trustRule.column that matches,
 *  and every exampleData row keyed by the old name. */
function cascadeColumnRename(oldName: string, newName: string) {
	for (const rule of store.model.trustRules) {
		if (rule.column === oldName) {
			rule.column = newName;
		}
	}
	for (const row of store.model.exampleData) {
		if (oldName in row) {
			row[newName] = row[oldName];
			delete row[oldName];
		}
	}
}

// ── Example Data mutators ──────────────────────────────────────────────────
// Keep shape explicit: rows are maps from column name to string value. The
// UI builds inputs column-by-column using `model.columns`, so reading a
// missing key yields '' (empty string) without any coercion needed.

/** Append an empty row (all columns blank). */
export function addExampleDataRow() {
	const row: ExampleDataRow = {};
	for (const c of store.model.columns) row[c.name] = '';
	store.model.exampleData.push(row);
	markDirty();
}

/** Remove the row at the given index (no-op if out of range). */
export function removeExampleDataRow(idx: number) {
	if (idx < 0 || idx >= store.model.exampleData.length) return;
	store.model.exampleData.splice(idx, 1);
	markDirty();
}

/** Update a single cell in the example data table. */
export function updateExampleDataCell(rowIdx: number, columnName: string, value: string) {
	const row = store.model.exampleData[rowIdx];
	if (!row) return;
	row[columnName] = value;
	markDirty();
}

/** Replace the whole example data array at once (used by the CP metadata path). */
export function setExampleData(rows: ExampleDataRow[]) {
	store.model.exampleData = normaliseExampleData(rows);
	markDirty();
}

// ─── Per-contract pattern customisations ─────────────────────────────────
//
// The Manage Pattern Types UI in `ContractPatternsTab.svelte` writes through
// the injected DataAdapter (createNode/updateNode/deleteNode). The standalone
// adapter routes those calls into these mutators so the changes land on the
// model and survive page reload.

/**
 * Move an item to a new position within its containing array, given its raw
 * ContractItem id and the new 1-based order. Used by the shared
 * CanvasSection's drag-drop reorder. The converter emits `order: i + 1` per
 * item, so reorder requests come in 1-based — we splice to slot `order - 1`.
 *
 * Searches all known array fields for the item; no entity-label mapping
 * needed. No-op if the item isn't found or the slot doesn't change.
 */
export function reorderItem(itemId: string, newOrder: number) {
	const arrays: (keyof ContractModel)[] = [
		'team', 'personas', 'columns', 'glossaryTerms',
		'deliveryTypes', 'trustRules', 'dataSyncs', 'lineage'
	];
	for (const field of arrays) {
		const arr = store.model[field] as ContractItem[];
		const fromIdx = arr.findIndex((i) => i.id === itemId);
		if (fromIdx === -1) continue;
		const toIdx = Math.max(0, Math.min(arr.length - 1, newOrder - 1));
		if (fromIdx === toIdx) return;
		const [moved] = arr.splice(fromIdx, 1);
		arr.splice(toIdx, 0, moved);
		markDirty();
		return;
	}
}

/** Replace the per-contract list of pattern types. `null` = use static defaults. */
export function setPatternTypes(types: ContractPatternType[] | null) {
	store.model.patternTypes = types;
	markDirty();
}

/** Set or replace the override for a single pattern (lookups + descriptions). */
export function setPatternOverride(patternId: string, override: ContractPatternOverride) {
	if (!store.model.patternOverrides) store.model.patternOverrides = {};
	store.model.patternOverrides[patternId] = override;
	markDirty();
}

/** Remove a pattern's override (revert that pattern to static defaults). */
export function deletePatternOverride(patternId: string) {
	if (store.model.patternOverrides) {
		delete store.model.patternOverrides[patternId];
		markDirty();
	}
}

/** Update arbitrary properties on any item in the contract. */
export function updateItemProperties(itemId: string, updates: Record<string, unknown>) {
	// Singular fields
	if (store.model.dataAsset?.id === itemId) {
		Object.assign(store.model.dataAsset, updates);
		markDirty();
		return;
	}
	if (store.model.domain?.id === itemId) {
		Object.assign(store.model.domain, updates);
		markDirty();
		return;
	}
	if (store.model.informationProduct?.id === itemId) {
		Object.assign(store.model.informationProduct, updates);
		markDirty();
		return;
	}
	// Array fields
	const arrays: (keyof ContractModel)[] = [
		'team', 'personas', 'columns', 'glossaryTerms', 'deliveryTypes', 'trustRules', 'dataSyncs', 'lineage'
	];
	for (const field of arrays) {
		const arr = store.model[field] as ContractItem[];
		const item = arr.find((i) => i.id === itemId);
		if (item) {
			Object.assign(item, updates);
			markDirty();
			return;
		}
	}
}

// --- Import/Export ---------------------------------------------------------

export function exportJSON(): string {
	return JSON.stringify(store.model, null, 2);
}

export async function importJSON(json: string) {
	const parsed = JSON.parse(json);
	if (!parsed.id || !parsed.name) {
		throw new Error('Invalid Data Contract model JSON');
	}
	const migrated = migrateModel(parsed);
	const existingIds = store.savedList.map((s) => s.id);
	const id = slugify(migrated.name, existingIds);
	migrated.id = id;
	await apiCreateModel(migrated);
	store.savedList = [...store.savedList, { id, name: migrated.name }];
	store.model = migrated;
	store.dirty = false;
	if (typeof window !== 'undefined') {
		localStorage.setItem('dc-current-id', id);
	}
}
