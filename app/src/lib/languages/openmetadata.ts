/**
 * OpenMetadata Standards (OMS) language module.
 *
 * Exports a CP Data Contract graph as JSON-LD shaped per the OpenMetadata
 * Standards DataContract schema (https://openmetadatastandards.org). Import is
 * supported for the Data Contract entity with best-effort field mapping.
 *
 * Mapping (CP entity/property → OMS):
 *   contract_model           → DataContract
 *   global_data_asset        → Table (contract.entity)
 *   dict_column              → Column (table.columns)
 *   global_publisher         → Team / User (owners)
 *   global_glossary_term     → GlossaryTerm (references)
 *   global_policy            → Policy (qualityExpectations, nested)
 *   global_data_sync         → slaProperties (nested on contract.sla)
 *   global_delivery_type     → infrastructure (extension)
 *   global_persona           → Persona (extension)
 *   global_provenance_activity → om:Activity (lineage)
 *
 * OMS entityStatus: maps CP's 7-stage lifecycle down to the 3-state OMS enum
 * (Draft / Active / Deprecated). Retired collapses to Deprecated; all
 * pre-production stages collapse to Draft.
 */

import type { GraphData, Language, ValidationResult } from './types.js';
import type { ContextNode, ContextLink } from '$lib/cp-shared';
import { getNodeLabels } from '$lib/cp-shared';

const OMS_VERSION = '1.11.0';
const OMS_NAMESPACE = 'http://open-metadata.org/ontology#';

// ── Status mapping ───────────────────────────────────────────────────────────
// Accepts both the new Title Case `status` pattern labels (Ideation, Design, …)
// and the legacy lowercase enum values (ideation, design, …) so older graphs
// emit valid OMS without a re-migration.
function cpStatusToOmsEntityStatus(s: string | undefined): string {
	switch ((s ?? '').toLowerCase()) {
		case 'ideation':
		case 'design':
		case 'development':
		case 'testing':
		case 'draft':
			return 'Draft';
		case 'production':
		case 'active':
			return 'Active';
		case 'deprecated':
		case 'retired':
			return 'Deprecated';
		default:
			return 'Draft';
	}
}

// OMS-side reverse mapping yields Title Case pattern labels — the canonical
// shape the contract_model node carries since the `status` pattern was added.
function omsEntityStatusToCp(s: string | undefined): string {
	switch (s) {
		case 'Draft':      return 'Design';
		case 'Active':     return 'Production';
		case 'Deprecated': return 'Deprecated';
		default:           return 'Design';
	}
}

// BigQuery/ODCS logicalType → OMS dataType
function logicalTypeToOmsDataType(lt: string | undefined): string {
	switch ((lt || '').toLowerCase()) {
		case 'integer': return 'INT';
		case 'decimal': return 'DECIMAL';
		case 'string':  return 'STRING';
		case 'date':    return 'DATE';
		case 'timestamp': return 'TIMESTAMP';
		case 'boolean': return 'BOOLEAN';
		default:        return 'STRING';
	}
}

// Reverse: OMS dataType → CP logicalType
function omsDataTypeToLogical(dt: string | undefined): string {
	switch ((dt || '').toUpperCase()) {
		case 'INT':
		case 'BIGINT':
		case 'INT64':
		case 'SMALLINT':
		case 'TINYINT':
			return 'integer';
		case 'DECIMAL':
		case 'DOUBLE':
		case 'FLOAT':
		case 'FLOAT64':
		case 'NUMERIC':
			return 'decimal';
		case 'DATE':      return 'date';
		case 'TIMESTAMP':
		case 'DATETIME':  return 'timestamp';
		case 'BOOLEAN':
		case 'BOOL':      return 'boolean';
		default:          return 'string';
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function urn(kind: string, id: string): string {
	return `urn:cp:${kind}:${id}`;
}

function slug(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';
}

// ── Export ───────────────────────────────────────────────────────────────────

function exportAll(data: GraphData, rootNodeId?: string): string {
	const { nodes, links } = data;

	// Find the contract_model root. Accept any label with "contract_model" in it.
	const roots = nodes.filter((n) => getNodeLabels(n).includes('contract_model'));
	const root = rootNodeId ? roots.find((n) => n.id === rootNodeId) : roots[0];
	if (!root) throw new Error('No contract_model node found to export.');

	const rootProps = root.properties || {};
	const outgoing = links.filter((l) => l.source_id === root.id);
	const linkedWith = (label: string) =>
		outgoing
			.filter((l) => l.label === label)
			.map((l) => nodes.find((n) => n.id === l.destination_id))
			.filter((n): n is ContextNode => !!n);

	// The governed data asset (Table in OMS)
	const asset = linkedWith('has_data_asset')[0];

	// Columns scoped to the contract
	const columns = linkedWith('has_column');

	// Policies / quality expectations
	const policies = [...linkedWith('has_quality_rule'), ...linkedWith('governed_by')];

	// SLA items (data syncs)
	const slas = [...linkedWith('has_sla'), ...linkedWith('synced_by')];

	// Team
	const team = [...linkedWith('has_team_member'), ...linkedWith('published_by')];

	// References (glossary terms)
	const references = [...linkedWith('has_reference'), ...linkedWith('defined_by')];

	// Delivery types (infrastructure)
	const delivery = [...linkedWith('has_infrastructure'), ...linkedWith('delivered_via')];

	// Personas
	const personas = linkedWith('consumed_by');

	// Lineage via PROV-O predicates on the asset node
	const assetLinks = asset ? links.filter((l) => l.source_id === asset.id) : [];
	const lineageUpstream = assetLinks
		.filter((l) => ['was_derived_from', 'was_generated_by', 'used'].includes(l.label))
		.map((l) => {
			const n = nodes.find((x) => x.id === l.destination_id);
			return n ? { predicate: l.label, node: n } : null;
		})
		.filter((x): x is { predicate: string; node: ContextNode } => !!x);

	const doc: Record<string, unknown> = {
		'@context': {
			'@vocab': OMS_NAMESPACE,
			om: OMS_NAMESPACE,
			rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
			rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
			prov: 'http://www.w3.org/ns/prov#'
		},
		'@type': 'DataContract',
		'@id': urn('contract', root.id),
		id: (rootProps.sourceId as string) || root.id,
		name: slug(root.name),
		displayName: root.name,
		fullyQualifiedName: `cp.${slug(root.name)}`,
		description: root.description || '',
		version: '1.0.0',
		// Status is now a string[] keyed off the `status` pattern; read the first entry.
		// Falls back to a single-string property for older graphs that haven't migrated.
		entityStatus: cpStatusToOmsEntityStatus(
			Array.isArray(rootProps.status)
				? ((rootProps.status as string[])[0])
				: (rootProps.status as string | undefined)
		),
		effectiveFrom: new Date().toISOString(),
		omsSchemaVersion: OMS_VERSION
	};

	// Domain + Information Product are now linked nodes via has_domain /
	// has_information_product. Resolve the linked node's name; fall back to
	// the legacy property-on-root shape for older graphs.
	const domainLink = outgoing.find((l) => l.label === 'has_domain');
	const domainNodeName = domainLink
		? (nodes.find((n) => n.id === domainLink.destination_id)?.name)
		: typeof rootProps.domain === 'string'
			? rootProps.domain
			: (rootProps.domain as { name?: string } | undefined)?.name;
	if (domainNodeName) {
		doc.domain = {
			'@type': 'Domain',
			name: domainNodeName,
			displayName: domainNodeName
		};
	}
	const ipLink = outgoing.find((l) => l.label === 'has_information_product');
	const ipNodeName = ipLink
		? (nodes.find((n) => n.id === ipLink.destination_id)?.name)
		: typeof rootProps.dataProduct === 'string'
			? rootProps.dataProduct as string
			: (rootProps.dataProduct as { name?: string } | undefined)?.name;
	if (ipNodeName) {
		doc.dataProducts = [{
			'@type': 'DataProduct',
			name: slug(ipNodeName),
			displayName: ipNodeName
		}];
	}
	if (Array.isArray(rootProps.tags) && (rootProps.tags as string[]).length > 0) {
		doc.tags = (rootProps.tags as string[]).map((t) => ({
			'@type': 'TagLabel',
			tagFQN: `cp.user.${t}`,
			name: t,
			source: 'Classification'
		}));
	}

	// entity: reference to the governed Table
	if (asset) {
		doc.entity = {
			'@type': 'Table',
			'@id': urn('table', asset.id),
			id: (asset.properties?.sourceId as string) || asset.id,
			name: slug(asset.name),
			displayName: asset.name,
			fullyQualifiedName: `cp.${slug(asset.name)}`,
			description: asset.description || '',
			columns: columns.map((c) => ({
				'@type': 'Column',
				name: c.name,
				displayName: c.name,
				description: c.description || '',
				dataType: logicalTypeToOmsDataType(c.properties?.logicalType as string | undefined),
				constraint: (c.properties?.primaryKey as boolean) ? 'PRIMARY_KEY' : (c.properties?.unique as boolean) ? 'UNIQUE' : (c.properties?.required as boolean) ? 'NOT_NULL' : 'NULL',
				tags: (c.properties?.classification as string) ? [{ tagFQN: `cp.classification.${c.properties?.classification}`, source: 'Classification' }] : []
			}))
		};
	}

	// schema[] at contract level is a common OMS pattern too — mirror columns there
	if (columns.length > 0) {
		doc.schema = columns.map((c) => ({
			name: c.name,
			dataType: logicalTypeToOmsDataType(c.properties?.logicalType as string | undefined),
			description: c.description || ''
		}));
	}

	// Owners (team members with role=owner or first team member)
	if (team.length > 0) {
		doc.owners = team.map((m) => ({
			'@type': 'EntityReference',
			type: 'user',
			name: m.name,
			displayName: m.name,
			role: (m.properties?.role as string) || 'owner'
		}));
	}

	// SLA — collapse our Data Sync items (global_data_sync nodes) into an OMS SLA object
	if (slas.length > 0) {
		const sla: Record<string, unknown> = { '@type': 'SLA' };
		for (const s of slas) {
			const prop = (s.properties?.property as string) || 'frequency';
			const value = (s.properties?.value as string) || '';
			const unit = (s.properties?.unit as string) || '';
			sla[prop] = unit ? `${value} ${unit}`.trim() : value;
		}
		doc.sla = sla;
	}

	// Quality expectations (test cases)
	if (policies.length > 0) {
		doc.qualityExpectations = policies.map((p) => {
			// Prefer Policy-shape (category + rule) with legacy fallback.
			const pp = p.properties || {};
			const categoryRaw = ((pp.category as string | undefined) || (pp.ruleType as string | undefined) || 'custom').trim();
			const ruleText = (pp.rule as string | undefined)?.trim();
			return {
				'@type': 'TestCase',
				name: p.name,
				displayName: p.name,
				// Surface the free-text `rule` in the TestCase description so the
				// actual rule statement travels with the export.
				description: p.description || ruleText || '',
				testDefinition: {
					name: categoryRaw.toLowerCase(),
					parameters: {
						column: (pp.column as string) || '*',
						operator: (pp.operator as string) || '>=',
						threshold: (pp.threshold as string) || ''
					}
				}
			};
		});
	}

	// References (glossary terms)
	if (references.length > 0) {
		doc.glossaryTerms = references.map((g) => ({
			'@type': 'GlossaryTerm',
			name: g.name,
			displayName: g.name,
			description: g.description || ''
		}));
	}

	// Infrastructure / delivery
	if (delivery.length > 0) {
		doc.infrastructure = delivery.map((d) => ({
			'@type': 'Infrastructure',
			name: d.name,
			description: d.description || ''
		}));
	}

	// Personas (consumer side)
	if (personas.length > 0) {
		doc.personas = personas.map((p) => ({
			'@type': 'Persona',
			name: p.name,
			description: p.description || ''
		}));
	}

	// Lineage — PROV-O relations on the asset node
	if (lineageUpstream.length > 0) {
		doc.lineage = {
			'@type': 'LineageDetails',
			upstreamEdges: lineageUpstream.map(({ predicate, node }) => {
				const kind = getNodeLabels(node).includes('global_provenance_activity') ? 'Activity' : 'Table';
				return {
					'@type': kind === 'Activity' ? 'prov:Activity' : 'EntityReference',
					predicate: `prov:${predicate.replace(/_(.)/g, (_, c) => c.toUpperCase())}`,
					name: node.name,
					description: node.description || '',
					role: (node.properties?.role as string) || undefined
				};
			})
		};
	}

	return JSON.stringify(doc, null, 2);
}

// ── Import ───────────────────────────────────────────────────────────────────

function nextId(prefix: string): string {
	const rand = typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}

function importAll(content: string): GraphData {
	const doc = JSON.parse(content);
	if (!doc || typeof doc !== 'object') {
		throw new Error('Invalid OpenMetadata JSON-LD — root must be an object');
	}

	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const ts = new Date().toISOString();

	// Root contract
	const rootId = `dc-model-${nextId('cm')}`;
	const contractName = (doc.displayName as string) || (doc.name as string) || 'Imported Contract';
	nodes.push({
		id: rootId,
		label: 'contract_model',
		name: contractName,
		description: (doc.description as string) || '',
		properties: {
			canvas: ['canvas_data_contract'],
			sourceId: (doc.id as string) || nextId('cm'),
			// Status is a string[] (single OMS lifecycle value).
			status: [omsEntityStatusToCp(doc.entityStatus as string | undefined)],
			domain: (doc.domain && typeof doc.domain === 'object' && 'displayName' in doc.domain)
				? (doc.domain as { displayName: string }).displayName
				: (doc.domain as string) || '',
			dataProduct: Array.isArray(doc.dataProducts) && doc.dataProducts[0]
				? (doc.dataProducts[0] as { displayName?: string; name?: string }).displayName
					|| (doc.dataProducts[0] as { name?: string }).name
					|| ''
				: '',
			tags: Array.isArray(doc.tags)
				? (doc.tags as { name?: string }[]).map((t) => t.name || '').filter(Boolean)
				: []
		},
		created_at: ts,
		updated_at: ts
	});

	// Data asset (entity)
	const entity = doc.entity as { id?: string; name?: string; displayName?: string; description?: string; columns?: unknown[] } | undefined;
	if (entity) {
		const assetId = `dc-asset-${nextId('a')}`;
		nodes.push({
			id: assetId,
			label: 'global_data_asset',
			name: entity.displayName || entity.name || 'Asset',
			description: entity.description || '',
			properties: { canvas: ['canvas_data_contract'], sourceId: entity.id || nextId('a') },
			created_at: ts,
			updated_at: ts
		});
		links.push({ id: nextId('link'), source_id: rootId, destination_id: assetId, label: 'has_data_asset', created_at: ts, updated_at: ts });

		// Columns
		if (Array.isArray(entity.columns)) {
			for (let i = 0; i < entity.columns.length; i++) {
				const col = entity.columns[i] as { name?: string; description?: string; dataType?: string; constraint?: string; tags?: { tagFQN?: string }[] };
				const colId = `dc-col-${nextId('c')}`;
				const cons = col.constraint || 'NULL';
				nodes.push({
					id: colId,
					label: 'dict_column',
					name: col.name || `col${i + 1}`,
					description: col.description || '',
					properties: {
						canvas: ['canvas_data_contract'],
						sourceId: col.name || nextId('c'),
						logicalType: omsDataTypeToLogical(col.dataType),
						primaryKey: cons === 'PRIMARY_KEY',
						unique: cons === 'UNIQUE' || cons === 'PRIMARY_KEY',
						required: cons === 'NOT_NULL' || cons === 'PRIMARY_KEY',
						classification: (col.tags || [])
							.map((t) => (t.tagFQN || '').replace(/^cp\.classification\./, ''))
							.find((c) => !!c) || 'internal',
						order: i + 1
					},
					created_at: ts,
					updated_at: ts
				});
				links.push({ id: nextId('link'), source_id: rootId, destination_id: colId, label: 'has_column', created_at: ts, updated_at: ts });
			}
		}
	}

	// Owners
	if (Array.isArray(doc.owners)) {
		for (const o of doc.owners as { name?: string; displayName?: string; role?: string; description?: string }[]) {
			const id = `dc-owner-${nextId('o')}`;
			nodes.push({
				id,
				label: 'global_publisher',
				name: o.displayName || o.name || 'Owner',
				description: o.description || '',
				properties: { canvas: ['canvas_data_contract'], role: o.role || 'owner' },
				created_at: ts,
				updated_at: ts
			});
			links.push({ id: nextId('link'), source_id: rootId, destination_id: id, label: 'has_team_member', created_at: ts, updated_at: ts });
		}
	}

	// Quality expectations
	if (Array.isArray(doc.qualityExpectations)) {
		for (const q of doc.qualityExpectations as { name?: string; displayName?: string; description?: string; testDefinition?: { name?: string; parameters?: { column?: string; operator?: string; threshold?: string } } }[]) {
			const id = `dc-quality-${nextId('q')}`;
			const td = q.testDefinition || {};
			const params = td.parameters || {};
			const typeName = (td.name || 'custom').trim();
			const categoryCapitalised = typeName.charAt(0).toUpperCase() + typeName.slice(1);
			const synthesisedRule = params.threshold
				? `${typeName} ${params.operator || '>='} ${params.threshold}`.trim()
				: (q.description || typeName);
			nodes.push({
				id,
				label: 'global_policy',
				name: q.displayName || q.name || 'Quality Rule',
				description: q.description || '',
				properties: {
					canvas: ['canvas_data_contract'],
					// Policy-shape (new primary fields)
					category: categoryCapitalised,
					rule: synthesisedRule,
					column: params.column || '*',
					// Legacy fields — kept for backward compat with older importers.
					ruleType: td.name || 'custom',
					operator: params.operator || '>=',
					threshold: params.threshold || ''
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({ id: nextId('link'), source_id: rootId, destination_id: id, label: 'has_quality_rule', created_at: ts, updated_at: ts });
		}
	}

	// Glossary terms
	if (Array.isArray(doc.glossaryTerms)) {
		for (const g of doc.glossaryTerms as { name?: string; displayName?: string; description?: string }[]) {
			const id = `dc-ref-${nextId('r')}`;
			nodes.push({
				id,
				label: 'global_glossary_term',
				name: g.displayName || g.name || 'Glossary Term',
				description: g.description || '',
				properties: { canvas: ['canvas_data_contract'] },
				created_at: ts,
				updated_at: ts
			});
			links.push({ id: nextId('link'), source_id: rootId, destination_id: id, label: 'has_reference', created_at: ts, updated_at: ts });
		}
	}

	// Infrastructure
	if (Array.isArray(doc.infrastructure)) {
		for (const inf of doc.infrastructure as { name?: string; description?: string }[]) {
			const id = `dc-infra-${nextId('i')}`;
			nodes.push({
				id,
				label: 'global_delivery_type',
				name: inf.name || 'Delivery',
				description: inf.description || '',
				properties: { canvas: ['canvas_data_contract'] },
				created_at: ts,
				updated_at: ts
			});
			links.push({ id: nextId('link'), source_id: rootId, destination_id: id, label: 'has_infrastructure', created_at: ts, updated_at: ts });
		}
	}

	// SLA — flatten into sla items
	const sla = doc.sla as Record<string, unknown> | undefined;
	if (sla && typeof sla === 'object') {
		for (const [prop, value] of Object.entries(sla)) {
			if (prop.startsWith('@')) continue;
			const id = `dc-sla-${nextId('s')}`;
			const v = String(value ?? '');
			const [valueStr, ...unitParts] = v.split(' ');
			nodes.push({
				id,
				label: 'global_data_sync',
				name: prop,
				description: '',
				properties: {
					canvas: ['canvas_data_contract'],
					property: prop,
					value: valueStr || v,
					unit: unitParts.join(' ') || ''
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({ id: nextId('link'), source_id: rootId, destination_id: id, label: 'has_sla', created_at: ts, updated_at: ts });
		}
	}

	return { nodes, links };
}

// ── Validate ─────────────────────────────────────────────────────────────────

function validateContent(content: string): ValidationResult {
	const errors: string[] = [];
	let doc: unknown;
	try {
		doc = JSON.parse(content);
	} catch (e) {
		return { valid: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
	}
	if (!doc || typeof doc !== 'object') {
		return { valid: false, errors: ['Root must be an object'] };
	}
	const d = doc as Record<string, unknown>;
	if (d['@type'] !== 'DataContract') {
		errors.push(`Expected "@type": "DataContract" at root, got "${String(d['@type'])}"`);
	}
	if (!d.name) errors.push('Missing required field: name');
	if (!d.entityStatus) errors.push('Missing required field: entityStatus');
	const validStatuses = ['Draft', 'Active', 'Deprecated'];
	if (d.entityStatus && !validStatuses.includes(d.entityStatus as string)) {
		errors.push(`entityStatus must be one of ${validStatuses.join(', ')} (got: ${String(d.entityStatus)})`);
	}
	return { valid: errors.length === 0, errors };
}

// ── Language definition ──────────────────────────────────────────────────────

export const openmetadata: Language = {
	id: 'openmetadata',
	name: 'OpenMetadata Standards',
	version: OMS_VERSION,
	fileExtension: 'jsonld',
	mimeType: 'application/ld+json',
	supportedEntities: [
		'contract_model',
		'global_data_asset',
		'dict_column',
		'global_publisher',
		'global_glossary_term',
		'global_policy',
		'global_data_sync',
		'global_delivery_type',
		'global_persona',
		'global_provenance_activity'
	],
	entityMap: {
		contract_model: 'DataContract',
		global_data_asset: 'Table',
		dict_column: 'Column',
		global_publisher: 'User',
		global_glossary_term: 'GlossaryTerm',
		global_policy: 'TestCase',
		global_data_sync: 'SLA',
		global_delivery_type: 'Infrastructure',
		global_persona: 'Persona',
		global_provenance_activity: 'prov:Activity'
	},
	relationshipMap: {
		has_data_asset: 'entity',
		has_column: 'columns',
		has_team_member: 'owners',
		has_reference: 'glossaryTerms',
		has_quality_rule: 'qualityExpectations',
		has_sla: 'sla',
		has_infrastructure: 'infrastructure',
		was_derived_from: 'prov:wasDerivedFrom',
		was_generated_by: 'prov:wasGeneratedBy',
		used: 'prov:used',
		was_informed_by: 'prov:wasInformedBy',
		was_associated_with: 'prov:wasAssociatedWith',
		was_attributed_to: 'prov:wasAttributedTo'
	},
	export: exportAll,
	import: importAll,
	validate: validateContent
};
