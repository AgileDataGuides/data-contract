/**
 * dbt MetricFlow language module.
 *
 * Spec: https://docs.getdbt.com/docs/build/about-metricflow
 * Apache 2.0. Reference implementation of OSI. Huge ecosystem.
 *
 * dbt has two objects: `semantic_models` (contain measures) and `metrics`.
 * Metric Trees map well because dbt's `derived` metric type has `input_metrics`
 * pointing to its children — almost 1:1 with a tree branch.
 *
 * Export pattern:
 *   - Internal tree nodes with children → `type: derived`, `type_params.expr` = parent formula,
 *     `type_params.metrics` = [{ name: child.name }, ...]
 *   - Leaf tree nodes (no children) → `type: simple`, `type_params.measure` = node.name
 *   - All metrics also carry `meta.metric_tree` with tree-specific fields (role, coefficient, unit,
 *     target, grain, direction) for round-trip fidelity.
 */

import YAML from 'yaml';
import type { Language, GraphData, ValidationResult } from './types.js';
import type { ContextNode, ContextLink } from '$lib/cp-shared';
import { getNodeLabels } from '$lib/cp-shared';

const entityMap: Record<string, string> = {
	metric_tree_model: 'dbt_semantic_layer',
	global_metric: 'metric'
};

const relationshipMap: Record<string, string> = {
	has_child_metric: 'metrics[].type_params.input_metrics'
};

const propertyMap: Record<string, Record<string, string>> = {
	global_metric: {
		operator: 'meta.metric_tree.operator',
		coefficient: 'meta.metric_tree.coefficient',
		customFormula: 'type_params.expr',
		role: 'meta.metric_tree.role',
		unit: 'meta.metric_tree.unit',
		direction: 'meta.metric_tree.direction',
		target: 'meta.metric_tree.target',
		grain: 'meta.metric_tree.grain',
		owner: 'meta.owner',
		source: 'meta.metric_tree.source'
	}
};

// ── helpers ────────────────────────────────────────────────────────────────

function nodeHasLabel(n: ContextNode, label: string): boolean {
	return getNodeLabels(n).includes(label);
}
function linksFrom(links: ContextLink[], source: string, label: string): ContextLink[] {
	return links.filter((l) => l.source_id === source && l.label === label);
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
function nowIso(): string { return new Date().toISOString(); }

/** Turn a metric name into a dbt-safe identifier. */
function safeName(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'metric';
}

/** Build a formula string from operator + children's names. */
function buildDerivedExpr(
	operator: string,
	children: { name: string; coefficient: number }[],
	customFormula: string
): string {
	if (operator === 'custom' && customFormula) return customFormula;
	const names = children.map((c) => safeName(c.name));
	if (children.length === 0) return '';
	switch (operator) {
		case 'sum':
			return children
				.map((c, i) => {
					const n = names[i];
					const coef = c.coefficient ?? 1;
					if (coef === 1) return (i === 0 ? '' : '+ ') + n;
					if (coef === -1) return (i === 0 ? '-' : '- ') + n;
					return (i === 0 ? '' : '+ ') + `${coef} * ${n}`;
				})
				.join(' ');
		case 'product':
			return names.join(' * ');
		case 'ratio':
			return names.length >= 2 ? `${names[0]} / ${names[1]}` : names[0];
		case 'weighted_avg': {
			const num = children.map((c, i) => `${c.coefficient ?? 1} * ${names[i]}`).join(' + ');
			const den = children.map((c) => `${c.coefficient ?? 1}`).join(' + ');
			return `(${num}) / (${den})`;
		}
		default:
			return names.join(' + ');
	}
}

// ── Export ─────────────────────────────────────────────────────────────────

function exportAll(data: GraphData, rootNodeId?: string): string {
	const { nodes, links } = data;
	const root =
		(rootNodeId ? findNode(nodes, rootNodeId) : undefined) ||
		nodes.find((n) => nodeHasLabel(n, 'metric_tree_model'));
	if (!root) throw new Error('No metric_tree_model root — cannot export to dbt MetricFlow');

	// Collect metrics in this tree
	const metricLinks = linksFrom(links, root.id, 'has_metric');
	const metricNodes = metricLinks
		.map((l) => findNode(nodes, l.destination_id))
		.filter((n): n is ContextNode => !!n && nodeHasLabel(n, 'global_metric'));

	// Build parent-children map
	const childrenOf = new Map<string, ContextNode[]>(); // parentName → children nodes
	for (const l of links) {
		if (l.label === 'has_child_metric') {
			const parent = findNode(nodes, l.source_id);
			const child = findNode(nodes, l.destination_id);
			if (!parent || !child) continue;
			const list = childrenOf.get(parent.name) || [];
			list.push(child);
			childrenOf.set(parent.name, list);
		}
	}

	const metrics = metricNodes.map((n) => {
		const p = n.properties || {};
		const children = childrenOf.get(n.name) || [];
		const hasChildren = children.length > 0;

		const meta = stripEmpty({
			owner: p.owner,
			metric_tree: stripEmpty({
				role: p.role,
				operator: p.operator,
				coefficient: p.coefficient,
				unit: p.unit,
				direction: p.direction,
				target: p.target,
				grain: p.grain,
				source: p.source,
				status: p.status
			})
		});

		if (hasChildren) {
			// Derived metric
			const operator = (p.operator as string) || 'sum';
			const customFormula = (p.customFormula as string) || '';
			const childList = children.map((c) => ({
				name: c.name,
				coefficient: (c.properties?.coefficient as number) ?? 1
			}));
			const expr = buildDerivedExpr(operator, childList, customFormula);

			return stripEmpty({
				name: safeName(n.name),
				label: n.name,
				description: n.description || undefined,
				type: 'derived',
				type_params: {
					expr,
					metrics: childList.map((c) => ({ name: safeName(c.name) }))
				},
				meta
			});
		} else {
			// Leaf — simple
			return stripEmpty({
				name: safeName(n.name),
				label: n.name,
				description: n.description || undefined,
				type: 'simple',
				type_params: {
					measure: safeName(n.name)
				},
				meta
			});
		}
	});

	// dbt also needs semantic_models[] — we build one minimal model referencing leaf measures
	const leafNames = metricNodes
		.filter((n) => !(childrenOf.get(n.name) && childrenOf.get(n.name)!.length > 0))
		.map((n) => ({ name: safeName(n.name), agg: 'sum', expr: safeName(n.name) }));

	const doc: Record<string, unknown> = stripEmpty({
		semantic_models: [
			{
				name: safeName(root.name) + '_semantic_model',
				description: root.description || 'Metric tree exported from Context Plane',
				model: "ref('your_source_model')",
				entities: [{ name: 'id', type: 'primary' }],
				dimensions: [{ name: 'dt', type: 'time', type_params: { time_granularity: 'day' } }],
				measures: leafNames
			}
		],
		metrics
	});

	return YAML.stringify(doc, { lineWidth: 0 });
}

// ── Import ─────────────────────────────────────────────────────────────────

function importAll(content: string): GraphData {
	const doc = YAML.parse(content);
	if (!doc || typeof doc !== 'object') throw new Error('Invalid dbt MetricFlow YAML — root must be object');

	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const ts = nowIso();

	const treeId = nextId('mt');
	const rootId = `mt-model-${treeId}`;
	nodes.push({
		id: rootId,
		label: 'metric_tree_model',
		name: doc.semantic_models?.[0]?.description || 'Imported dbt Metric Tree',
		description: null,
		properties: {
			canvas: ['canvas_metric_tree'],
			sourceId: treeId,
			rootMetricId: null,
			owner: '',
			tags: [],
			domain: '',
			status: 'draft'
		},
		created_at: ts,
		updated_at: ts
	});

	const nameToNodeId = new Map<string, string>();
	const dbtMetrics = Array.isArray(doc.metrics) ? doc.metrics : [];

	// First pass — create all metric nodes
	for (const m of dbtMetrics) {
		if (!m || !m.name) continue;
		const mt = m.meta?.metric_tree || {};
		const displayName = m.label || m.name;
		const nodeId = `mt-metric-${nextId('met')}`;
		nameToNodeId.set(m.name, nodeId);

		nodes.push({
			id: nodeId,
			label: 'global_metric',
			name: displayName,
			description: m.description || null,
			properties: {
				canvas: ['canvas_metric_tree'],
				sourceId: displayName,
				role: mt.role,
				operator: mt.operator || (m.type === 'derived' ? 'custom' : 'sum'),
				customFormula: m.type === 'derived' ? (m.type_params?.expr || '') : '',
				coefficient: mt.coefficient ?? 1,
				unit: mt.unit || 'count',
				direction: mt.direction || 'higher_is_better',
				owner: m.meta?.owner || '',
				target: mt.target || '',
				grain: mt.grain || 'month',
				source: mt.source || { type: 'manual' },
				tags: [],
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

	// Second pass — parent-child via derived.input_metrics
	for (const m of dbtMetrics) {
		if (!m || m.type !== 'derived' || !m.type_params?.metrics) continue;
		const parentId = nameToNodeId.get(m.name);
		if (!parentId) continue;
		for (const inp of m.type_params.metrics) {
			const childName = typeof inp === 'string' ? inp : inp?.name;
			if (!childName) continue;
			const childId = nameToNodeId.get(childName);
			if (!childId) continue;
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

	// Root = any metric not referenced as a child
	const allChildIds = new Set(
		links.filter((l) => l.label === 'has_child_metric').map((l) => l.destination_id)
	);
	const roots = Array.from(nameToNodeId.entries()).filter(([, id]) => !allChildIds.has(id));
	if (roots.length > 0) {
		const rootModel = nodes.find((n) => n.id === rootId)!;
		(rootModel.properties as Record<string, unknown>).rootMetricId = roots[0][0];
	}

	return { nodes, links };
}

function validate(content: string): ValidationResult {
	const errors: string[] = [];
	let doc: unknown;
	try { doc = YAML.parse(content); }
	catch (e) { return { valid: false, errors: [`YAML parse error: ${(e as Error).message}`] }; }
	if (!doc || typeof doc !== 'object') return { valid: false, errors: ['Root must be an object'] };
	const d = doc as Record<string, unknown>;
	if (!Array.isArray(d.metrics) && !Array.isArray(d.semantic_models))
		errors.push("Must contain 'metrics' or 'semantic_models' array");
	return { valid: errors.length === 0, errors };
}

export const dbtMetricflow: Language = {
	id: 'dbt-metricflow',
	name: 'dbt MetricFlow',
	version: '2025.11',
	fileExtension: 'yaml',
	mimeType: 'application/yaml',
	supportedEntities: ['metric_tree_model', 'global_metric'],
	entityMap,
	relationshipMap,
	propertyMap,
	export: exportAll,
	import: importAll,
	validate
};
