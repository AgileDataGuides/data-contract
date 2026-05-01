/**
 * Open Semantic Interchange (OSI) v1.0 language module.
 *
 * Spec: https://github.com/open-semantic-interchange/OSI
 * Apache 2.0 — finalised January 2026.
 *
 * For Metric Trees, OSI is the primary export target. Tree structure is preserved
 * via `custom_extensions.metric_tree` so OSI-naive consumers see a flat metric list
 * while OSI-aware ones can reconstruct the hierarchy.
 */

import YAML from 'yaml';
import type { Language, GraphData, ValidationResult } from './types.js';
import type { ContextNode, ContextLink } from '$lib/cp-shared';
import { getNodeLabels } from '$lib/cp-shared';

const entityMap: Record<string, string> = {
	metric_tree_model: 'SemanticModel',
	global_metric: 'metric'
};

const relationshipMap: Record<string, string> = {
	has_metric: 'metric_in_model',
	has_child_metric: 'custom_extensions.metric_tree.parent_of'
};

const propertyMap: Record<string, Record<string, string>> = {
	global_metric: {
		operator: 'custom_extensions.metric_tree.operator',
		coefficient: 'custom_extensions.metric_tree.coefficient',
		customFormula: 'custom_extensions.metric_tree.custom_formula',
		role: 'custom_extensions.metric_tree.role',
		unit: 'custom_extensions.metric_tree.unit',
		direction: 'custom_extensions.metric_tree.direction',
		target: 'custom_extensions.metric_tree.target',
		grain: 'custom_extensions.metric_tree.grain',
		owner: 'custom_extensions.metric_tree.owner',
		source: 'custom_extensions.metric_tree.source'
	}
};

// ── helpers ────────────────────────────────────────────────────────────────

function nodeHasLabel(n: ContextNode, label: string): boolean {
	return getNodeLabels(n).includes(label);
}

function linksFrom(links: ContextLink[], sourceId: string, label: string): ContextLink[] {
	return links.filter((l) => l.source_id === sourceId && l.label === label);
}

function findNode(nodes: ContextNode[], id: string): ContextNode | undefined {
	return nodes.find((n) => n.id === id);
}

function stripEmpty<T extends Record<string, unknown>>(o: T): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(o)) {
		if (v === undefined || v === null || v === '') continue;
		if (Array.isArray(v) && v.length === 0) continue;
		out[k] = v;
	}
	return out as Partial<T>;
}

function nextId(prefix: string): string {
	const rand = typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}

function nowIso(): string {
	return new Date().toISOString();
}

// ── Export ─────────────────────────────────────────────────────────────────

function exportAll(data: GraphData, rootNodeId?: string): string {
	const { nodes, links } = data;
	const root =
		(rootNodeId ? findNode(nodes, rootNodeId) : undefined) ||
		nodes.find((n) => nodeHasLabel(n, 'metric_tree_model'));
	if (!root) throw new Error('No metric_tree_model root node — cannot export to OSI');

	const rootProps = root.properties || {};

	// Collect metrics scoped to this tree via has_metric
	const metricLinks = linksFrom(links, root.id, 'has_metric');
	const metricNodes = metricLinks
		.map((l) => findNode(nodes, l.destination_id))
		.filter((n): n is ContextNode => !!n && nodeHasLabel(n, 'global_metric'));

	// Map node ID → metric.name for parent reference
	const nodeIdToName = new Map<string, string>();
	for (const n of metricNodes) nodeIdToName.set(n.id, n.name);

	// Collect parent-child relationships via has_child_metric
	const parentOfChild = new Map<string, string>(); // childNodeId → parentNodeName
	for (const l of links) {
		if (l.label === 'has_child_metric') {
			const parent = findNode(nodes, l.source_id);
			if (parent) parentOfChild.set(l.destination_id, parent.name);
		}
	}

	// Build OSI metrics[]
	const metrics = metricNodes.map((n) => {
		const p = n.properties || {};
		const tags = (p.tags as string[]) || [];
		const op = (p.operator as string) || 'sum';
		const customFormula = (p.customFormula as string) || '';

		// Expression: use customFormula if set, else a pseudo-expression
		const expression = customFormula
			? customFormula
			: `/* ${op} of child metrics in Metric Trees */`;

		return stripEmpty({
			name: n.name,
			description: n.description || undefined,
			expression: {
				dialects: [
					{ dialect: 'ANSI_SQL', expression }
				]
			},
			ai_context: tags.length > 0 ? { synonyms: tags } : undefined,
			custom_extensions: {
				metric_tree: stripEmpty({
					role: p.role,
					operator: op,
					coefficient: p.coefficient,
					custom_formula: customFormula || undefined,
					unit: p.unit,
					direction: p.direction,
					target: p.target,
					grain: p.grain,
					owner: p.owner,
					source: p.source,
					status: p.status,
					parent: parentOfChild.get(n.id) || undefined
				})
			}
		});
	});

	const odcs: Record<string, unknown> = stripEmpty({
		apiVersion: 'v1.0',
		kind: 'SemanticModel',
		name: root.name,
		description: root.description || undefined,
		ai_context: {
			synonyms: (rootProps.tags as string[]) || []
		},
		datasets: [], // required by OSI core-spec; we populate via leaves' source (future)
		metrics,
		custom_extensions: {
			metric_tree: {
				id: rootProps.sourceId,
				root_metric: rootProps.rootMetricId,
				domain: rootProps.domain,
				status: rootProps.status,
				owner: rootProps.owner,
				tags: rootProps.tags
			}
		}
	});

	return YAML.stringify(odcs, { lineWidth: 0 });
}

// ── Import ─────────────────────────────────────────────────────────────────

function importAll(content: string): GraphData {
	const doc = YAML.parse(content);
	if (!doc || typeof doc !== 'object') throw new Error('Invalid OSI YAML — root must be an object');

	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const ts = nowIso();

	const treeExt = doc.custom_extensions?.metric_tree || {};
	const rootMetricName = treeExt.root_metric as string | undefined;

	const rootId = `mt-model-${treeExt.id || nextId('mt')}`;
	nodes.push({
		id: rootId,
		label: 'metric_tree_model',
		name: doc.name || 'Imported Tree',
		description: doc.description || null,
		properties: {
			canvas: ['canvas_metric_tree'],
			sourceId: treeExt.id || 'imported',
			rootMetricId: null, // will be filled after metrics are created
			owner: treeExt.owner || '',
			tags: treeExt.tags || doc.ai_context?.synonyms || [],
			domain: treeExt.domain || '',
			status: treeExt.status || 'draft'
		},
		created_at: ts,
		updated_at: ts
	});

	// Create metric nodes
	const metricNameToNodeId = new Map<string, string>();
	if (Array.isArray(doc.metrics)) {
		for (const m of doc.metrics) {
			if (!m || typeof m !== 'object' || !m.name) continue;
			const mt = m.custom_extensions?.metric_tree || {};
			const nodeId = `mt-metric-${nextId('met')}`;
			metricNameToNodeId.set(m.name, nodeId);

			const expressionStr = typeof m.expression === 'object'
				? m.expression?.dialects?.[0]?.expression || ''
				: String(m.expression || '');

			nodes.push({
				id: nodeId,
				label: 'global_metric',
				name: m.name,
				description: m.description || null,
				properties: {
					canvas: ['canvas_metric_tree'],
					sourceId: m.name,
					role: mt.role,
					operator: mt.operator || 'sum',
					customFormula: mt.custom_formula || (expressionStr.includes('/* ') ? '' : expressionStr),
					coefficient: mt.coefficient ?? 1,
					unit: mt.unit || 'count',
					direction: mt.direction || 'higher_is_better',
					owner: mt.owner || '',
					target: mt.target || '',
					grain: mt.grain || 'month',
					source: mt.source || { type: 'manual' },
					tags: m.ai_context?.synonyms || [],
					status: mt.status || 'active'
				},
				created_at: ts,
				updated_at: ts
			});
			links.push({
				id: nextId('link'),
				source_id: rootId,
				destination_id: nodeId,
				label: 'has_metric',
				created_at: ts,
				updated_at: ts
			});
		}

		// Second pass — parent-child
		for (const m of doc.metrics) {
			if (!m || !m.name) continue;
			const mt = m.custom_extensions?.metric_tree || {};
			const parentName = mt.parent as string | undefined;
			if (parentName && metricNameToNodeId.has(parentName)) {
				const parentId = metricNameToNodeId.get(parentName)!;
				const childId = metricNameToNodeId.get(m.name)!;
				links.push({
					id: nextId('link'),
					source_id: parentId,
					destination_id: childId,
					label: 'has_child_metric',
					created_at: ts,
					updated_at: ts
				});
			}
		}
	}

	// Set rootMetricId on the model now that metrics exist
	if (rootMetricName && metricNameToNodeId.has(rootMetricName)) {
		const rootModelNode = nodes.find((n) => n.id === rootId)!;
		(rootModelNode.properties as Record<string, unknown>).rootMetricId = rootMetricName;
	} else {
		// Fallback — find a metric with no parent link
		const childIds = new Set(
			links.filter((l) => l.label === 'has_child_metric').map((l) => l.destination_id)
		);
		const orphanMetric = Array.from(metricNameToNodeId.entries()).find(([, id]) => !childIds.has(id));
		if (orphanMetric) {
			const rootModelNode = nodes.find((n) => n.id === rootId)!;
			(rootModelNode.properties as Record<string, unknown>).rootMetricId = orphanMetric[0];
		}
	}

	return { nodes, links };
}

// ── Validate ────────────────────────────────────────────────────────────────

function validate(content: string): ValidationResult {
	const errors: string[] = [];
	let doc: unknown;
	try {
		doc = YAML.parse(content);
	} catch (e) {
		return { valid: false, errors: [`YAML parse error: ${(e as Error).message}`] };
	}
	if (!doc || typeof doc !== 'object') return { valid: false, errors: ['Root must be an object'] };
	const d = doc as Record<string, unknown>;
	if (!d.apiVersion) errors.push('Missing required field: apiVersion');
	if (d.kind !== 'SemanticModel') errors.push("Field 'kind' must be 'SemanticModel'");
	if (!d.name) errors.push('Missing required field: name');
	if (!Array.isArray(d.metrics)) errors.push('Missing required field: metrics (array)');
	return { valid: errors.length === 0, errors };
}

// ── Language module ────────────────────────────────────────────────────────

export const osi: Language = {
	id: 'osi',
	name: 'Open Semantic Interchange',
	version: '1.0',
	fileExtension: 'yaml',
	mimeType: 'application/osi+yaml;version=1.0',
	supportedEntities: ['metric_tree_model', 'global_metric'],
	entityMap,
	relationshipMap,
	propertyMap,
	export: exportAll,
	import: importAll,
	validate
};
