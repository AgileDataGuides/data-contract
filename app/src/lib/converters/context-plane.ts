/**
 * Bidirectional converter between Data Contract v2.1 (AgileData-native) JSON
 * and Context Plane { nodes, links } graph format.
 */
import type { ContextNode, ContextLink } from '$lib/types/shared';
import type {
	ContractModel,
	ContractItem,
	ColumnItem,
	TrustRule,
	DataSyncItem,
	TeamMember,
	LineageItem,
	ProvType,
	ExampleDataRow
} from '../types';
import { migrateModel } from '../stores/contract.svelte';

function createId(prefix: string): string {
	const rand = typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}

function now(): string {
	return new Date().toISOString();
}

/**
 * Convert a ContractModel to Context Plane nodes + links format.
 */
export function contractToContextPlane(model: ContractModel): { nodes: ContextNode[]; links: ContextLink[] } {
	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const ts = now();

	// Contract model node (root entity) — carries ODCS Fundamentals metadata in properties.
	// Domain + Information Product moved OUT of properties and into linked nodes
	// (global_domain via has_domain, global_info_product via has_information_product) so
	// they can be reused across the Concept Model / IPC canvases respectively. See the
	// `addItemNode` calls below.
	const rootNodeId = `dc-model-${model.id}`;
	nodes.push({
		id: rootNodeId,
		label: 'contract_model',
		name: model.name,
		description: model.description || null,
		properties: {
			canvas: ['canvas_data_contract'],
			sourceId: model.id,
			status: model.status,
			tags: model.tags,
			changeDetection: model.changeDetection,
			retentionPeriod: model.retentionPeriod,
			historyWindow: model.historyWindow,
			exampleData: model.exampleData
		},
		created_at: ts,
		updated_at: ts
	});

	function addItemNode(
		item: ContractItem,
		label: string,
		relLabel: string,
		extraProps: Record<string, unknown> = {},
		order?: number
	) {
		const shortLabel = label.replace('global_', '').replace('dict_', '');
		const nodeId = `dc-${shortLabel}-${item.id}`;
		nodes.push({
			id: nodeId,
			label,
			name: item.name,
			description: item.description || undefined,
			properties: {
				canvas: ['canvas_data_contract'],
				sourceId: item.id,
				...(order !== undefined ? { order } : {}),
				...extraProps
			},
			created_at: ts,
			updated_at: ts
		});
		links.push({
			id: createId('link'),
			source_id: rootNodeId,
			destination_id: nodeId,
			label: relLabel,
			created_at: ts,
			updated_at: ts
		});
		return nodeId;
	}

	// Data Asset (singular)
	let assetNodeId: string | null = null;
	if (model.dataAsset) {
		assetNodeId = addItemNode(model.dataAsset, 'global_data_asset', 'has_data_asset');
	}

	// Domain (singular, cross-canvas — reused on Concept Model as global_domain)
	if (model.domain) {
		addItemNode(model.domain, 'global_domain', 'has_domain');
	}

	// Information Product (singular, cross-canvas — reused on IPC as global_info_product)
	if (model.informationProduct) {
		addItemNode(model.informationProduct, 'global_info_product', 'has_information_product');
	}

	// Team (array, enriched with role)
	for (let i = 0; i < model.team.length; i++) {
		const tm = model.team[i] as TeamMember;
		addItemNode(tm, 'global_publisher', 'has_team_member', { role: tm.role }, i + 1);
	}

	// Personas
	for (let i = 0; i < model.personas.length; i++) {
		addItemNode(model.personas[i], 'global_persona', 'consumed_by', {}, i + 1);
	}

	// Columns (enriched with dataType/required/unique/primaryKey/classification)
	for (let i = 0; i < model.columns.length; i++) {
		const c = model.columns[i] as ColumnItem;
		addItemNode(c, 'dict_column', 'has_column', {
			dataType: c.dataType,
			required: c.required,
			unique: c.unique,
			primaryKey: c.primaryKey,
			classification: c.classification
		}, i + 1);
	}

	// Glossary Terms (AgileData term — graph label is `global_glossary_term`)
	for (let i = 0; i < model.glossaryTerms.length; i++) {
		addItemNode(model.glossaryTerms[i], 'global_glossary_term', 'has_reference', {}, i + 1);
	}

	// Delivery Types / Infrastructure — simple AgileData object with name +
	// description. When catalog-picked, carries an optional `typeKey` pointing
	// at the predefined value (see packages/shared/data/delivery-types.json).
	// The language modules (Bitol, OpenMetadata) translate these into their
	// own server/infrastructure vocabularies.
	for (let i = 0; i < model.deliveryTypes.length; i++) {
		const dt = model.deliveryTypes[i];
		const props: Record<string, unknown> = {};
		const typeKey = (dt as unknown as { typeKey?: string }).typeKey;
		if (typeKey) props.typeKey = typeKey;
		addItemNode(dt, 'global_delivery_type', 'has_infrastructure', props, i + 1);
	}

	// Data Sync (AgileData term — graph label is still `global_data_sync`)
	for (let i = 0; i < model.dataSyncs.length; i++) {
		const s = model.dataSyncs[i] as DataSyncItem;
		addItemNode(s, 'global_data_sync', 'has_sla', {
			property: s.property,
			value: s.value,
			unit: s.unit
		}, i + 1);
	}

	// Trust Rules (AgileData term — graph label is still `global_policy`).
	// Build a name → nodeId map for the contract's columns first so we can
	// emit a validates_column link from each rule to its target column node.
	const columnNameToNodeId = new Map<string, string>();
	for (let i = 0; i < model.columns.length; i++) {
		const c = model.columns[i];
		columnNameToNodeId.set(c.name, `dc-column-${c.id}`);
	}
	for (let i = 0; i < model.trustRules.length; i++) {
		const q = model.trustRules[i] as TrustRule;
		const ruleNodeId = addItemNode(q, 'global_policy', 'has_quality_rule', {
			category: q.category,
			rule: q.rule,
			column: q.column
		}, i + 1);
		// Explicit graph link: trust rule → the column it validates. Table-level
		// rules (column === '*') stay link-less because there is no single target.
		// If the rule references a column name that doesn't exist in the schema,
		// the link is skipped silently — the property still holds the name so
		// the UI can flag it as "not in this contract".
		if (q.column && q.column !== '*') {
			const colNodeId = columnNameToNodeId.get(q.column);
			if (colNodeId) {
				links.push({
					id: createId('link'),
					source_id: ruleNodeId,
					destination_id: colNodeId,
					label: 'validates_column',
					created_at: ts,
					updated_at: ts
				});
			}
		}
	}

	// Lineage — PROV-O aligned. Each LineageItem becomes a node (kind depends on
	// provType) and a relationship to the contract's data asset + relationships
	// between lineage items (upstreamIds) using PROV-O predicates.
	if (assetNodeId) {
		// First pass: create a node for every lineage item, keyed by source id
		const linIdToNodeId = new Map<string, string>();
		for (let i = 0; i < model.lineage.length; i++) {
			const lin = model.lineage[i];
			const linNodeId = `dc-lineage-${lin.id}`;
			linIdToNodeId.set(lin.id, linNodeId);
			// Pick a label based on provType
			let nodeLabel = 'global_data_asset';
			if (lin.provType === 'activity') nodeLabel = 'global_provenance_activity';
			else if (lin.provType === 'agent') nodeLabel = 'global_publisher';
			nodes.push({
				id: linNodeId,
				label: nodeLabel,
				name: lin.name,
				description: lin.description || undefined,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: lin.id,
					provType: lin.provType,
					role: lin.role || undefined,
					order: i + 1
				},
				created_at: ts,
				updated_at: ts
			});
		}

		// Second pass: link each lineage item to the contract's data asset using
		// the PROV-O predicate that matches its provType. And link between
		// lineage items using upstreamIds.
		for (const lin of model.lineage) {
			const linNodeId = linIdToNodeId.get(lin.id);
			if (!linNodeId) continue;

			// Contract data asset <-> lineage item
			// entity: dataAsset wasDerivedFrom upstream-entity
			// activity: dataAsset wasGeneratedBy activity
			// agent: dataAsset wasAttributedTo agent
			if (lin.provType === 'entity') {
				links.push({ id: createId('link'), source_id: assetNodeId, destination_id: linNodeId, label: 'was_derived_from', created_at: ts, updated_at: ts });
			} else if (lin.provType === 'activity') {
				links.push({ id: createId('link'), source_id: assetNodeId, destination_id: linNodeId, label: 'was_generated_by', created_at: ts, updated_at: ts });
			} else if (lin.provType === 'agent') {
				links.push({ id: createId('link'), source_id: assetNodeId, destination_id: linNodeId, label: 'was_attributed_to', created_at: ts, updated_at: ts });
			}

			// Upstream relationships — label chosen by the provType pairing
			for (const upId of lin.upstreamIds || []) {
				const upNodeId = linIdToNodeId.get(upId);
				if (!upNodeId) continue;
				const upstream = model.lineage.find((x) => x.id === upId);
				if (!upstream) continue;
				let label = 'was_derived_from';
				if (lin.provType === 'entity' && upstream.provType === 'entity') label = 'was_derived_from';
				else if (lin.provType === 'entity' && upstream.provType === 'activity') label = 'was_generated_by';
				else if (lin.provType === 'activity' && upstream.provType === 'entity') label = 'used';
				else if (lin.provType === 'activity' && upstream.provType === 'activity') label = 'was_informed_by';
				else if (lin.provType === 'entity' && upstream.provType === 'agent') label = 'was_attributed_to';
				else if (lin.provType === 'activity' && upstream.provType === 'agent') label = 'was_associated_with';
				links.push({ id: createId('link'), source_id: linNodeId, destination_id: upNodeId, label, created_at: ts, updated_at: ts });
			}
		}
	}

	// ─── Per-contract pattern customisations ─────────────────────────────
	// Emit one `contract_config` node carrying the user's customised
	// patternTypes list, plus one `contract_pattern` node per per-pattern
	// override. Stable IDs so create→update→get round-trips through the
	// standalone-adapter (which finds existing nodes by id/name+label).
	if (model.patternTypes && Array.isArray(model.patternTypes)) {
		const configNodeId = `dc-config-${model.id}`;
		nodes.push({
			id: configNodeId,
			label: 'contract_config',
			name: 'Contract Config',
			description: 'Pattern types + per-contract config storage',
			properties: {
				canvas: ['canvas_data_contract'],
				sourceId: model.id,
				patternTypes: model.patternTypes
			},
			created_at: ts,
			updated_at: ts
		});
		links.push({
			id: createId('link'),
			source_id: rootNodeId,
			destination_id: configNodeId,
			label: 'has_contract_config',
			created_at: ts,
			updated_at: ts
		});
	}

	if (model.patternOverrides && typeof model.patternOverrides === 'object') {
		for (const [patternId, override] of Object.entries(model.patternOverrides)) {
			const overrideNodeId = `dc-pattern-${model.id}-${patternId}`;
			nodes.push({
				id: overrideNodeId,
				label: 'contract_pattern',
				name: patternId,
				description: override.patternDescription || null,
				properties: {
					canvas: ['canvas_data_contract'],
					sourceId: model.id,
					patternId,
					lookupValues: override.lookupValues,
					valueDescriptions: override.valueDescriptions,
					patternDescription: override.patternDescription
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: createId('link'),
				source_id: rootNodeId,
				destination_id: overrideNodeId,
				label: 'has_pattern_override',
				created_at: ts,
				updated_at: ts
			});
		}
	}

	return { nodes, links };
}

/**
 * Convert Context Plane nodes + links back to a ContractModel.
 * Runs through migrateModel at the end to guarantee a valid v2.0 shape.
 */
export function contextPlaneToContract(
	data: { nodes: ContextNode[]; links: ContextLink[] },
	rootNodeId?: string
): ContractModel {
	const { nodes, links } = data;

	// When a specific contract_model root is provided (e.g. CP with multiple
	// contracts in the same Business Model), scope to it. Otherwise fall back
	// to the first contract_model node we can find.
	const rootNode = rootNodeId
		? nodes.find((n) => n.id === rootNodeId && n.label.includes('contract_model'))
		: nodes.find((n) => n.label.includes('contract_model'));
	const rootId = rootNode?.id;
	const rootLinks = rootId ? links.filter((l) => l.source_id === rootId) : [];
	const rootLinkedIds = new Set(rootLinks.map((l) => l.destination_id));

	function findLinkedByRel(relLabel: string): ContextNode[] {
		return rootLinks
			.filter((l) => l.label === relLabel)
			.map((l) => nodes.find((n) => n.id === l.destination_id))
			.filter((n): n is ContextNode => !!n);
	}

	function findLinked(label: string): ContextNode[] {
		return nodes.filter((n) => n.label.includes(label) && rootLinkedIds.has(n.id));
	}

	function toItem(n: ContextNode): ContractItem {
		return {
			id: (n.properties?.sourceId as string) || n.id,
			name: n.name,
			description: n.description || ''
		};
	}

	function toColumnItem(n: ContextNode): ColumnItem {
		const p = n.properties || {};
		return {
			...toItem(n),
			// Accept either new `dataType` property or legacy `logicalType` fallback
			dataType: (p.dataType as string) || (p.logicalType as string) || 'string',
			required: (p.required as boolean) ?? false,
			unique: (p.unique as boolean) ?? false,
			primaryKey: (p.primaryKey as boolean) ?? false,
			classification: (p.classification as string) || 'internal'
		};
	}

	function toTrustRule(n: ContextNode): TrustRule {
		const p = n.properties || {};
		// Prefer the validates_column graph link over the stored `column` property
		// because the link always points to the current column node — if someone
		// renamed the column directly on the graph, the property could be stale
		// but the link still resolves correctly.
		const linkToColumn = links.find((l) => l.source_id === n.id && l.label === 'validates_column');
		const linkedColumnNode = linkToColumn ? nodes.find((cn) => cn.id === linkToColumn.destination_id) : null;
		const columnName = linkedColumnNode?.name || (p.column as string) || '*';

		// Prefer new Policy-shape fields; fall back to legacy structured fields.
		const existingCategory = (p.category as string | undefined)?.trim();
		const existingRule = (p.rule as string | undefined)?.trim();
		const legacyRuleType = (p.ruleType as string | undefined)?.trim() || '';
		const legacyOperator = (p.operator as string | undefined)?.trim() || '';
		const legacyThreshold = (p.threshold as string | undefined)?.trim() || '';

		const category = existingCategory
			|| (legacyRuleType ? legacyRuleType.charAt(0).toUpperCase() + legacyRuleType.slice(1) : 'Custom');
		const legacyRuleParts = [legacyRuleType, legacyOperator, legacyThreshold].filter((x) => x);
		const rule = existingRule ?? (legacyRuleParts.length > 0 ? legacyRuleParts.join(' ') : '');

		return {
			...toItem(n),
			category,
			rule,
			column: columnName
		};
	}

	function toDataSyncItem(n: ContextNode): DataSyncItem {
		const p = n.properties || {};
		return {
			...toItem(n),
			property: (p.property as string) || '',
			value: (p.value as string) || '',
			unit: (p.unit as string) || ''
		};
	}

	function toTeamMember(n: ContextNode): TeamMember {
		const p = n.properties || {};
		return {
			...toItem(n),
			role: (p.role as string) || 'engineer'
		};
	}

	function dedupeById(arr: ContextNode[]): ContextNode[] {
		const seen = new Set<string>();
		return arr.filter((n) => {
			if (seen.has(n.id)) return false;
			seen.add(n.id);
			return true;
		});
	}

	const assetNodes = findLinked('global_data_asset');
	const assetNode = assetNodes[0];
	const assetNodeId = assetNode?.id;

	// Domain + Information Product — linked via has_domain / has_information_product (new shape).
	// Fall back to root properties if the contract predates the unification (string values on
	// the root node). migrateModel handles the string → ContractItem normalization.
	const domainNode = findLinkedByRel('has_domain').find((n) => n.label.includes('global_domain'))
		|| findLinked('global_domain')[0];
	const informationProductNode = findLinkedByRel('has_information_product').find((n) => n.label.includes('global_info_product'))
		|| findLinked('global_info_product')[0];

	// Team (has_team_member preferred, fallback to legacy published_by)
	const teamNodes = dedupeById([...findLinkedByRel('has_team_member'), ...findLinkedByRel('published_by')]);

	// Glossary Terms (has_reference preferred, fallback legacy defined_by)
	const refsNodes = dedupeById([...findLinkedByRel('has_reference'), ...findLinkedByRel('defined_by')]);

	// Data Sync (has_sla link preferred, fallback legacy synced_by)
	const slaNodes = dedupeById([...findLinkedByRel('has_sla'), ...findLinkedByRel('synced_by')]);

	// Trust Rules (has_quality_rule link preferred, fallback legacy governed_by)
	const qrNodes = dedupeById([...findLinkedByRel('has_quality_rule'), ...findLinkedByRel('governed_by')]);

	// Delivery (has_infrastructure preferred, fallback legacy delivered_via)
	const delNodes = dedupeById([...findLinkedByRel('has_infrastructure'), ...findLinkedByRel('delivered_via')]);

	// Delivery types may carry an optional `typeKey` pointing at a predefined
	// catalog entry (see packages/shared/data/delivery-types.json). Preserved
	// verbatim through round-trip so catalog linkage survives export/import.
	function toDeliveryType(n: ContextNode): ContractItem & { typeKey?: string } {
		const p = n.properties || {};
		const item: ContractItem & { typeKey?: string } = toItem(n);
		if (typeof p.typeKey === 'string' && p.typeKey) item.typeKey = p.typeKey;
		return item;
	}

	// Lineage: extract from PROV-O relationships attached to the data asset,
	// plus legacy sourced_from/enriched_by/feeds_into labels for backward compat.
	// Each hit yields a LineageItem with a provType inferred from the label.
	const lineageItems: LineageItem[] = [];
	const seenLineage = new Set<string>();
	if (assetNodeId) {
		const provMap: Record<string, ProvType> = {
			// PROV-O predicates
			was_derived_from: 'entity',
			was_generated_by: 'activity',
			used: 'entity',
			was_associated_with: 'agent',
			was_attributed_to: 'agent',
			was_informed_by: 'activity',
			// Legacy
			sourced_from: 'entity',
			enriched_by: 'entity',
			feeds_into: 'entity'
		};
		for (const link of links) {
			const pt = provMap[link.label];
			if (!pt) continue;
			let targetId: string | null = null;
			if (link.source_id === assetNodeId) targetId = link.destination_id;
			if (link.destination_id === assetNodeId) targetId = link.source_id;
			if (!targetId || targetId === rootId || seenLineage.has(targetId)) continue;
			const node = nodes.find((n) => n.id === targetId);
			if (!node) continue;
			seenLineage.add(targetId);
			const lin = toItem(node);
			const storedProvType = node.properties?.provType as ProvType | undefined;
			const role = node.properties?.role as string | undefined;
			lineageItems.push({
				...lin,
				provType: storedProvType || pt,
				role: role || undefined
			});
		}
	}

	const rootProps = rootNode?.properties || {};

	// ─── Per-contract pattern customisations ─────────────────────────────
	// Extract patternTypes from the linked contract_config node, and
	// patternOverrides from each linked contract_pattern node.
	const configNode = nodes.find(
		(n) => n.label.includes('contract_config') && rootLinkedIds.has(n.id)
	);
	const patternTypes = (configNode?.properties?.patternTypes as unknown[] | undefined) ?? null;

	const overrideNodes = nodes.filter(
		(n) => n.label.includes('contract_pattern') && rootLinkedIds.has(n.id)
	);
	const patternOverrides: Record<string, unknown> = {};
	for (const n of overrideNodes) {
		const pid = n.properties?.patternId as string | undefined;
		if (!pid) continue;
		patternOverrides[pid] = {
			lookupValues: (n.properties?.lookupValues as string[] | undefined) ?? [],
			valueDescriptions: (n.properties?.valueDescriptions as Record<string, string> | undefined) ?? {},
			patternDescription: (n.properties?.patternDescription as string | undefined) ?? ''
		};
	}

	// Build the raw model, then run through migrateModel to guarantee current shape.
	// changeDetection / retentionPeriod / historyWindow pass through as-is —
	// migrateModel handles normalisation + legacy fallbacks (loadType → changeDetection,
	// structured dataWindow → historyWindow string).
	const raw: unknown = {
		version: '2.0',
		id:
			(rootNode?.properties?.sourceId as string) ||
			rootNode?.id ||
			'imported',
		name: rootNode?.name || 'Imported Contract',
		description: rootNode?.description || '',
		// Status is now a string[]; legacy single-string is auto-wrapped + label-mapped
		// by migrateModel's normaliseStatus.
		status: rootProps.status,
		// Prefer linked nodes; fall back to any legacy string property on the root (older exports).
		domain: domainNode
			? toItem(domainNode)
			: (rootProps.domain as unknown) ?? null,
		informationProduct: informationProductNode
			? toItem(informationProductNode)
			: (rootProps.informationProduct as unknown) ?? (rootProps.dataProduct as unknown) ?? null,
		tags: (rootProps.tags as string[]) || [],
		// New field names (current); `loadType` / `dataWindow` kept as fallback for older graphs.
		changeDetection: rootProps.changeDetection,
		retentionPeriod: rootProps.retentionPeriod,
		historyWindow: rootProps.historyWindow,
		loadType: rootProps.loadType,
		dataWindow: rootProps.dataWindow,
		exampleData: rootProps.exampleData as ExampleDataRow[] | undefined,
		dataAsset: assetNode ? toItem(assetNode) : null,
		team: teamNodes.map(toTeamMember),
		personas: findLinked('global_persona').map(toItem),
		columns: findLinked('dict_column').map(toColumnItem),
		glossaryTerms: refsNodes.map(toItem),
		deliveryTypes: delNodes.map(toDeliveryType),
		trustRules: qrNodes.map(toTrustRule),
		dataSyncs: slaNodes.map(toDataSyncItem),
		lineage: lineageItems,
		patternTypes,
		patternOverrides
	};

	return migrateModel(raw as Record<string, unknown>);
}
