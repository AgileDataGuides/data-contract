/**
 * Bitol Open Data Contract Standard (ODCS) v3 language module.
 *
 * Translates between the Context Plane's native vocabulary and ODCS v3 YAML.
 * Spec: https://bitol-io.github.io/open-data-contract-standard/
 */

import YAML from 'yaml';
import type { Language, GraphData, ValidationResult } from './types.js';
import type { ContextNode, ContextLink } from '../types.js';
import { getNodeLabels } from '../types.js';

// --- Label/relationship/property maps --------------------------------------

const entityMap: Record<string, string> = {
	contract_model: 'DataContract',
	global_data_asset: 'schema',
	dict_column: 'schema.properties',
	global_publisher: 'team.members',
	global_policy: 'quality',
	global_data_sync: 'slaProperties',
	global_glossary_term: 'references',
	global_delivery_type: 'infrastructures'
};

const relationshipMap: Record<string, string> = {
	has_data_asset: 'schema',
	has_team_member: 'team.members',
	has_column: 'schema.properties',
	has_quality_rule: 'quality',
	has_sla: 'slaProperties',
	has_reference: 'references',
	has_infrastructure: 'infrastructures'
};

const propertyMap: Record<string, Record<string, string>> = {
	contract_model: {
		status: 'status',
		domain: 'domain',
		dataProduct: 'dataProduct',
		tags: 'tags'
	},
	dict_column: {
		logicalType: 'logicalType',
		required: 'required',
		unique: 'unique',
		primaryKey: 'primaryKey',
		classification: 'classification'
	},
	global_policy: {
		ruleType: 'type',
		column: 'element',
		threshold: 'value'
		// operator is mapped separately to mustBeX keys
	},
	global_data_sync: {
		property: 'property',
		value: 'value',
		unit: 'unit'
	},
	global_publisher: {
		role: 'role'
	}
};

// Operator string → ODCS operator key
const operatorMap: Record<string, string> = {
	'>=': 'mustBeGreaterOrEqualTo',
	'>': 'mustBeGreaterThan',
	'<=': 'mustBeLessOrEqualTo',
	'<': 'mustBeLessThan',
	'==': 'mustBe',
	'=': 'mustBe',
	'!=': 'mustNotBe'
};

// Reverse operator map for import
const operatorMapReverse: Record<string, string> = {};
for (const [k, v] of Object.entries(operatorMap)) {
	if (!(v in operatorMapReverse)) operatorMapReverse[v] = k;
}

// --- Helpers ---------------------------------------------------------------

function nodeHasLabel(n: ContextNode, label: string): boolean {
	return getNodeLabels(n).includes(label);
}

function linksFrom(links: ContextLink[], sourceId: string, relLabel: string): ContextLink[] {
	return links.filter((l) => l.source_id === sourceId && l.label === relLabel);
}

function findNode(nodes: ContextNode[], id: string): ContextNode | undefined {
	return nodes.find((n) => n.id === id);
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined || v === null || v === '') continue;
		if (Array.isArray(v) && v.length === 0) continue;
		out[k] = v;
	}
	return out as Partial<T>;
}

// --- Export: CP graph → ODCS YAML -----------------------------------------

function exportAll(data: GraphData, rootNodeId?: string): string {
	const { nodes, links } = data;

	// Find the contract_model root node
	const root =
		(rootNodeId ? findNode(nodes, rootNodeId) : undefined) ||
		nodes.find((n) => nodeHasLabel(n, 'contract_model'));

	if (!root) {
		throw new Error('No contract_model root node found — cannot export to ODCS');
	}

	const rootProps = root.properties || {};

	// Map CP's OMS 7-stage lifecycle to ODCS's 5-stage status enum.
	// ODCS accepts: proposed, draft, active, deprecated, retired. Accepts both the
	// new Title Case pattern labels (Ideation, Design, …) and the legacy lowercase
	// enum values (ideation, design, …) so older graphs still emit valid ODCS.
	function cpStatusToOdcs(s: string | undefined): string {
		switch ((s ?? '').toLowerCase()) {
			case 'ideation':    return 'proposed';
			case 'design':      return 'draft';
			case 'development': return 'draft';
			case 'testing':     return 'draft';
			case 'production':  return 'active';
			case 'deprecated':  return 'deprecated';
			case 'retired':     return 'retired';
			// pre-OMS aliases pass through unchanged (they already match ODCS)
			case 'draft':       return 'draft';
			case 'active':      return 'active';
			default:            return 'draft';
		}
	}

	// Status is now stored on the contract_model root as a string[] (one entry for
	// the OMS lifecycle stage). Read the first entry; fall back to a legacy single
	// string if older graphs haven't been migrated yet.
	function readStatus(): string | undefined {
		const raw = rootProps.status;
		if (Array.isArray(raw)) return (raw as string[])[0];
		if (typeof raw === 'string') return raw;
		return undefined;
	}

	// Fundamentals
	const odcs: Record<string, unknown> = {
		apiVersion: 'v3.0.2',
		kind: 'DataContract',
		id: (rootProps.sourceId as string) || root.id,
		name: root.name,
		version: '1.0.0',
		status: cpStatusToOdcs(readStatus())
	};

	// Domain + dataProduct are now linked nodes (has_domain → global_domain,
	// has_information_product → global_info_product). Fall back to root
	// properties for older graphs that haven't been migrated yet.
	const domainLink = linksFrom(links, root.id, 'has_domain')[0];
	if (domainLink) {
		const domainNode = findNode(nodes, domainLink.destination_id);
		if (domainNode?.name) odcs.domain = domainNode.name;
	} else if (rootProps.domain) {
		odcs.domain = typeof rootProps.domain === 'string' ? rootProps.domain : (rootProps.domain as { name?: string }).name || '';
	}
	const ipLink = linksFrom(links, root.id, 'has_information_product')[0];
	if (ipLink) {
		const ipNode = findNode(nodes, ipLink.destination_id);
		if (ipNode?.name) odcs.dataProduct = ipNode.name;
	} else if (rootProps.dataProduct) {
		odcs.dataProduct = typeof rootProps.dataProduct === 'string' ? rootProps.dataProduct : (rootProps.dataProduct as { name?: string }).name || '';
	}
	if (Array.isArray(rootProps.tags) && (rootProps.tags as string[]).length > 0) {
		odcs.tags = rootProps.tags;
	}
	if (root.description) {
		odcs.description = { purpose: root.description };
	}

	// --- Schema (data asset + columns) ---
	const assetLink = linksFrom(links, root.id, 'has_data_asset')[0];
	if (assetLink) {
		const asset = findNode(nodes, assetLink.destination_id);
		if (asset) {
			const schemaObj: Record<string, unknown> = {
				name: asset.name,
				logicalType: 'object'
			};
			if (asset.description) schemaObj.description = asset.description;

			const columnLinks = linksFrom(links, asset.id, 'has_column');
			const fallbackCols = linksFrom(links, root.id, 'has_column');
			const allCols = columnLinks.length > 0 ? columnLinks : fallbackCols;

			const properties: Record<string, unknown>[] = allCols
				.map((l) => findNode(nodes, l.destination_id))
				.filter((n): n is ContextNode => !!n)
				.map((col) => {
					const cp = col.properties || {};
					return stripEmpty({
						name: col.name,
						description: col.description,
						logicalType: (cp.logicalType as string) || 'string',
						required: cp.required as boolean,
						unique: cp.unique as boolean,
						primaryKey: cp.primaryKey as boolean,
						classification: cp.classification as string
					});
				});

			if (properties.length > 0) schemaObj.properties = properties;
			odcs.schema = [schemaObj];
		}
	} else {
		// No data asset — still try to export columns at top level
		const cols = linksFrom(links, root.id, 'has_column')
			.map((l) => findNode(nodes, l.destination_id))
			.filter((n): n is ContextNode => !!n);
		if (cols.length > 0) {
			odcs.schema = [{
				name: root.name + ' schema',
				logicalType: 'object',
				properties: cols.map((col) => {
					const cp = col.properties || {};
					return stripEmpty({
						name: col.name,
						description: col.description,
						logicalType: (cp.logicalType as string) || 'string',
						required: cp.required as boolean,
						unique: cp.unique as boolean,
						primaryKey: cp.primaryKey as boolean,
						classification: cp.classification as string
					});
				})
			}];
		}
	}

	// --- Team (members) ---
	const teamLinks = linksFrom(links, root.id, 'has_team_member');
	if (teamLinks.length > 0) {
		const members = teamLinks
			.map((l) => findNode(nodes, l.destination_id))
			.filter((n): n is ContextNode => !!n)
			.map((n) => {
				const p = n.properties || {};
				return stripEmpty({
					username: n.name.toLowerCase().replace(/\s+/g, '.'),
					name: n.name,
					description: n.description,
					role: (p.role as string) || 'engineer'
				});
			});
		odcs.team = { members };
	}

	// --- References ---
	const refLinks = linksFrom(links, root.id, 'has_reference');
	if (refLinks.length > 0) {
		odcs.references = refLinks
			.map((l) => findNode(nodes, l.destination_id))
			.filter((n): n is ContextNode => !!n)
			.map((n) => stripEmpty({ name: n.name, description: n.description }));
	}

	// --- Quality rules ---
	const qualityLinks = linksFrom(links, root.id, 'has_quality_rule');
	if (qualityLinks.length > 0) {
		odcs.quality = qualityLinks
			.map((l) => findNode(nodes, l.destination_id))
			.filter((n): n is ContextNode => !!n)
			.map((n) => {
				const p = n.properties || {};
				// Accept new Policy-shape (category + rule) first, fall back to legacy
				// structured fields (ruleType + operator + threshold) for pre-migration graphs.
				const categoryOrType = ((p.category as string | undefined)?.trim())
					|| ((p.ruleType as string | undefined)?.trim())
					|| 'custom';
				const op = (p.operator as string) || '>=';
				const odcsOperatorKey = operatorMap[op] || 'mustBeGreaterOrEqualTo';
				const threshold = p.threshold as string;
				// If the Policy-shape has a free-text `rule`, surface it in the ODCS
				// `description` so the rule statement isn't lost on export.
				const ruleText = (p.rule as string | undefined)?.trim();
				const description = n.description || ruleText || undefined;
				const rule: Record<string, unknown> = stripEmpty({
					name: n.name,
					description,
					type: categoryOrType.toLowerCase(),
					element: (p.column as string) || undefined
				});
				if (threshold !== undefined && threshold !== '') {
					// Try to parse as number, otherwise keep as string
					const num = Number(threshold);
					rule[odcsOperatorKey] = isNaN(num) ? threshold : num;
				}
				return rule;
			});
	}

	// --- SLA properties ---
	const slaLinks = linksFrom(links, root.id, 'has_sla');
	if (slaLinks.length > 0) {
		odcs.slaProperties = slaLinks
			.map((l) => findNode(nodes, l.destination_id))
			.filter((n): n is ContextNode => !!n)
			.map((n) => {
				const p = n.properties || {};
				return stripEmpty({
					property: (p.property as string) || n.name,
					value: (p.value as string) || '',
					unit: (p.unit as string) || undefined,
					description: n.description
				});
			});
	}

	// --- Servers (ODCS v3 §Infrastructure & Servers) ---
	// We emit ODCS `servers[]` from our AgileData-native global_delivery_type
	// nodes. The core AgileData model stays simple (name + description +
	// optional typeKey pointing at the shared delivery-types catalog). The
	// typeKey → ODCS type enum mapping lives below. Nodes without a
	// recognised typeKey land in ODCS as `type: custom` — ODCS's own
	// escape hatch.
	//
	// We do NOT emit the non-standard `infrastructures[]` block anymore;
	// it was our invention, not part of ODCS v3.
	const infraLinks = linksFrom(links, root.id, 'has_infrastructure');
	if (infraLinks.length > 0) {
		odcs.servers = infraLinks
			.map((l) => findNode(nodes, l.destination_id))
			.filter((n): n is ContextNode => !!n)
			.map((n) => {
				const p = n.properties || {};
				const typeKey = (p.typeKey as string | undefined) || '';
				return stripEmpty({
					server: n.name,
					type: catalogKeyToOdcsType(typeKey),
					description: n.description
				});
			});
	}

	return YAML.stringify(odcs, { lineWidth: 0 });
}

/**
 * Map a delivery-type catalog key (see packages/shared/data/delivery-types.json)
 * to the closest ODCS server type enum value. Unknown keys fall through to
 * `custom` — ODCS's own escape hatch.
 */
function catalogKeyToOdcsType(catalogKey: string): string {
	switch (catalogKey) {
		// warehouses
		case 'bigquery':   return 'bigquery';
		case 'snowflake':  return 'snowflake';
		case 'redshift':   return 'redshift';
		case 'databricks': return 'databricks';
		case 'synapse':    return 'synapse';
		// relational
		case 'postgres':   return 'postgres';
		case 'mysql':      return 'mysql';
		case 'sqlserver':  return 'sqlserver';
		case 'oracle':     return 'oracle';
		// object stores
		case 's3':         return 's3';
		case 'azure':      return 'azure';
		// streaming
		case 'kafka':      return 'kafka';
		case 'kinesis':    return 'kinesis';
		case 'pubsub':     return 'pubsub';
		// protocols / raw
		case 'api':        return 'api';
		case 'sftp':       return 'sftp';
		case 'local':      return 'local';
		// BI tools and anything unknown → custom (ODCS doesn't model these)
		default:           return 'custom';
	}
}

// --- Import: ODCS YAML → CP graph -----------------------------------------

function nextId(prefix: string): string {
	const rand = typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}

function nowIso(): string {
	return new Date().toISOString();
}

function importAll(content: string): GraphData {
	const doc = YAML.parse(content);
	if (!doc || typeof doc !== 'object') {
		throw new Error('Invalid ODCS YAML — root must be an object');
	}

	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const ts = nowIso();

	const rootId = `dc-model-${doc.id || nextId('cm')}`;

	// --- Fundamentals → contract_model node ---
	// Map ODCS status (proposed/draft/active/deprecated/retired) back to CP's
	// OMS 7-stage lifecycle, now using the Title Case labels of the `status`
	// pattern. ODCS is lossy — testing and development collapse to 'draft' on
	// export, so on round-trip they land on 'Design'.
	function odcsStatusToCp(s: string | undefined): string {
		switch (s) {
			case 'proposed':   return 'Ideation';
			case 'draft':      return 'Design';
			case 'active':     return 'Production';
			case 'deprecated': return 'Deprecated';
			case 'retired':    return 'Retired';
			default:           return 'Design';
		}
	}

	const rootProps: Record<string, unknown> = {
		canvas: ['canvas_data_contract'],
		sourceId: doc.id || 'imported',
		// Status is a string[] keyed off the `status` pattern (one element).
		status: [odcsStatusToCp(doc.status as string | undefined)],
		domain: doc.domain || '',
		dataProduct: doc.dataProduct || '',
		tags: Array.isArray(doc.tags) ? doc.tags : []
	};

	nodes.push({
		id: rootId,
		label: 'contract_model',
		name: doc.name || 'Imported Contract',
		description: doc.description?.purpose || null,
		properties: rootProps,
		created_at: ts,
		updated_at: ts
	});

	// --- Schema (first schema[0] is the data asset) ---
	const schemaArr = Array.isArray(doc.schema) ? doc.schema : [];
	const firstSchema = schemaArr[0];
	let assetId: string | null = null;
	if (firstSchema && typeof firstSchema === 'object') {
		assetId = `dc-data_asset-${nextId('da')}`;
		nodes.push({
			id: assetId,
			label: 'global_data_asset',
			name: firstSchema.name || 'Data Asset',
			description: firstSchema.description || null,
			properties: { canvas: ['canvas_data_contract'], sourceId: firstSchema.name || assetId },
			created_at: ts,
			updated_at: ts
		});
		links.push({
			id: nextId('link'),
			source_id: rootId,
			destination_id: assetId,
			label: 'has_data_asset',
			created_at: ts,
			updated_at: ts
		});

		// Columns nested under schema[0].properties
		const props = Array.isArray(firstSchema.properties) ? firstSchema.properties : [];
		let i = 1;
		for (const p of props) {
			if (!p || typeof p !== 'object') continue;
			const colId = `dc-column-${nextId('col')}`;
			nodes.push({
				id: colId,
				label: 'dict_column',
				name: p.name || `column_${i}`,
				description: p.description || null,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: p.name || colId,
					logicalType: p.logicalType || 'string',
					required: p.required === true,
					unique: p.unique === true,
					primaryKey: p.primaryKey === true,
					classification: p.classification || 'internal',
					order: i
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: colId,
				label: 'has_column',
				created_at: ts,
				updated_at: ts
			});
			i++;
		}
	}

	// --- Team → team.members ---
	const members = doc.team?.members;
	if (Array.isArray(members)) {
		let i = 1;
		for (const m of members) {
			if (!m || typeof m !== 'object') continue;
			const tmId = `dc-publisher-${nextId('tm')}`;
			nodes.push({
				id: tmId,
				label: 'global_publisher',
				name: m.name || m.username || 'Team Member',
				description: m.description || null,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: m.username || m.name || tmId,
					role: m.role || 'engineer',
					order: i
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: tmId,
				label: 'has_team_member',
				created_at: ts,
				updated_at: ts
			});
			i++;
		}
	}

	// --- References ---
	if (Array.isArray(doc.references)) {
		let i = 1;
		for (const r of doc.references) {
			if (!r || typeof r !== 'object') continue;
			const rid = `dc-glossary_term-${nextId('ref')}`;
			nodes.push({
				id: rid,
				label: 'global_glossary_term',
				name: r.name || `Reference ${i}`,
				description: r.description || null,
				properties: { canvas: ['canvas_data_contract'], sourceId: r.name || rid, order: i },
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: rid,
				label: 'has_reference',
				created_at: ts,
				updated_at: ts
			});
			i++;
		}
	}

	// --- Quality rules ---
	if (Array.isArray(doc.quality)) {
		let i = 1;
		for (const q of doc.quality) {
			if (!q || typeof q !== 'object') continue;
			// Detect operator from mustBeX keys
			let operator = '>=';
			let threshold = '';
			for (const [k, v] of Object.entries(q)) {
				if (k in operatorMapReverse) {
					operator = operatorMapReverse[k];
					threshold = String(v);
					break;
				}
			}
			const qid = `dc-policy-${nextId('qr')}`;
			// Synthesise a Policy-shape rule statement from the ODCS
			// operator + threshold + type so the CP side sees a readable `rule`.
			const typeForCategory = (q.type || 'Custom').trim();
			const categoryCapitalised = typeForCategory.charAt(0).toUpperCase() + typeForCategory.slice(1);
			const synthesisedRule = threshold
				? `${typeForCategory} ${operator} ${threshold}`.trim()
				: (q.description || typeForCategory);
			nodes.push({
				id: qid,
				label: 'global_policy',
				name: q.name || `Quality Rule ${i}`,
				description: q.description || null,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: q.name || qid,
					// New Policy-shape fields (primary)
					category: categoryCapitalised,
					rule: synthesisedRule,
					column: q.element || '*',
					// Legacy fields — retained so older importers / tools that still
					// read `ruleType / operator / threshold` keep working.
					ruleType: q.type || 'custom',
					operator,
					threshold,
					order: i
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: qid,
				label: 'has_quality_rule',
				created_at: ts,
				updated_at: ts
			});
			i++;
		}
	}

	// --- SLA properties ---
	if (Array.isArray(doc.slaProperties)) {
		let i = 1;
		for (const s of doc.slaProperties) {
			if (!s || typeof s !== 'object') continue;
			const sid = `dc-data_sync-${nextId('sla')}`;
			nodes.push({
				id: sid,
				label: 'global_data_sync',
				name: s.name || s.property || `SLA ${i}`,
				description: s.description || null,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: s.property || sid,
					property: s.property || '',
					value: s.value !== undefined ? String(s.value) : '',
					unit: s.unit || '',
					order: i
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: sid,
				label: 'has_sla',
				created_at: ts,
				updated_at: ts
			});
			i++;
		}
	}

	// --- Infrastructures ---
	// Import ODCS `servers[]` into our AgileData-native global_delivery_type
	// nodes. Each server becomes one delivery type; the ODCS `type:` enum is
	// reverse-mapped to a catalog key stored under properties.typeKey so the
	// UI can display the catalog label when re-rendered. Non-core ODCS
	// fields (host, port, project, dataset, environment, …) are NOT imported
	// — AgileData core model stays simple. Users who want those details can
	// edit the ODCS YAML directly or we add attributes via explicit design.
	if (Array.isArray(doc.servers)) {
		let i = 1;
		for (const s of doc.servers) {
			if (!s || typeof s !== 'object') continue;
			const srv = s as Record<string, unknown>;
			const odcsType = ((srv.type as string) || 'custom').toLowerCase();
			const typeKey = odcsTypeToCatalogKey(odcsType);
			const name = (srv.server as string) || (srv.id as string) || `Delivery ${i}`;
			const description = (srv.description as string) || null;
			const iid = `dc-delivery_type-${nextId('dt')}`;
			nodes.push({
				id: iid,
				label: 'global_delivery_type',
				name,
				description,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: (srv.id as string) || name || iid,
					typeKey,
					order: i
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: iid,
				label: 'has_infrastructure',
				created_at: ts,
				updated_at: ts
			});
			i++;
		}
	}

	return { nodes, links };
}

/**
 * Reverse of catalogKeyToOdcsType — take an ODCS `type:` enum value and
 * resolve back to a delivery-type catalog key where possible. Unknown
 * values land as 'custom'.
 */
function odcsTypeToCatalogKey(odcsType: string): string {
	const known = new Set([
		'bigquery', 'snowflake', 'redshift', 'databricks', 'synapse',
		'postgres', 'mysql', 'sqlserver', 'oracle',
		's3', 'azure',
		'kafka', 'kinesis', 'pubsub',
		'api', 'sftp', 'local'
	]);
	if (known.has(odcsType)) return odcsType;
	// Postgres spelling variants
	if (odcsType === 'postgresql') return 'postgres';
	return 'custom';
}

// --- Validation -----------------------------------------------------------

function validate(content: string): ValidationResult {
	const errors: string[] = [];
	let doc: unknown;
	try {
		doc = YAML.parse(content);
	} catch (e) {
		return { valid: false, errors: [`YAML parse error: ${(e as Error).message}`] };
	}
	if (!doc || typeof doc !== 'object') {
		return { valid: false, errors: ['Root must be an object'] };
	}
	const d = doc as Record<string, unknown>;
	if (!d.apiVersion) errors.push('Missing required field: apiVersion');
	if (d.kind !== 'DataContract') errors.push("Field 'kind' must be 'DataContract'");
	if (!d.id) errors.push('Missing required field: id');
	if (!d.version) errors.push('Missing required field: version');
	if (!d.status) errors.push('Missing required field: status');

	const validStatuses = ['proposed', 'draft', 'active', 'deprecated', 'retired'];
	if (d.status && !validStatuses.includes(d.status as string)) {
		errors.push(
			`Field 'status' must be one of: ${validStatuses.join(', ')} (got: ${String(d.status)})`
		);
	}

	return { valid: errors.length === 0, errors };
}

// --- Language module ------------------------------------------------------

export const bitol: Language = {
	id: 'bitol',
	name: 'Bitol ODCS',
	version: '3.0.2',
	fileExtension: 'yaml',
	mimeType: 'application/odcs+yaml;version=3.0.2',
	supportedEntities: [
		'contract_model',
		'global_data_asset',
		'dict_column',
		'global_publisher',
		'global_policy',
		'global_data_sync',
		'global_glossary_term',
		'global_delivery_type'
	],
	entityMap,
	relationshipMap,
	propertyMap,
	export: exportAll,
	import: importAll,
	validate
};
