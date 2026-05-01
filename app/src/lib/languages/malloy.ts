/**
 * Malloy language module.
 *
 * Malloy is a code-style DSL for semantic modelling, not a YAML format.
 * Spec: https://github.com/malloydata/malloy  (MIT, Linux Foundation).
 *
 * For metric trees, leaves become simple aggregate measures and internal nodes
 * reference their children by name — the tree structure is preserved implicitly
 * through the measure definitions:
 *
 *   source: my_tree is my_source extend {
 *     // Leaves
 *     measure: new_customers is count()
 *     measure: new_customer_avg_acv is sum(acv) / count()
 *     // Derived
 *     measure: new_mrr is new_customers * new_customer_avg_acv
 *     // Root
 *     measure: monthly_recurring_revenue is new_mrr + expansion_mrr - contraction_mrr - churned_mrr
 *   }
 *
 * Measures are emitted in topological order (leaves first) so every reference
 * resolves. Tree metadata (role, target, unit, etc.) is preserved via line
 * comments prefixed with `// @cp_metric_tree:` so we can round-trip cleanly.
 */

import type { Language, GraphData, ValidationResult } from './types.js';
import type { ContextNode, ContextLink } from '../types.js';
import { getNodeLabels } from '../types.js';

// ── maps ──────────────────────────────────────────────────────────────────

const entityMap: Record<string, string> = {
	metric_tree_model: 'source',
	global_metric: 'measure'
};

const relationshipMap: Record<string, string> = {
	has_metric: 'source.measures',
	has_child_metric: 'measure expression reference'
};

const propertyMap: Record<string, Record<string, string>> = {
	global_metric: {
		customFormula: 'measure expression',
		role: '// @cp_metric_tree: role',
		operator: '// @cp_metric_tree: operator',
		coefficient: '// @cp_metric_tree: coefficient',
		unit: '// @cp_metric_tree: unit',
		direction: '// @cp_metric_tree: direction',
		target: '// @cp_metric_tree: target',
		grain: '// @cp_metric_tree: grain',
		owner: '// @cp_metric_tree: owner',
		source: '// @cp_metric_tree: source',
		status: '// @cp_metric_tree: status'
	}
};

// ── helpers ───────────────────────────────────────────────────────────────

function nodeHasLabel(n: ContextNode, label: string): boolean {
	return getNodeLabels(n).includes(label);
}
function linksFrom(links: ContextLink[], sourceId: string, label: string): ContextLink[] {
	return links.filter((l) => l.source_id === sourceId && l.label === label);
}
function findNode(nodes: ContextNode[], id: string): ContextNode | undefined {
	return nodes.find((n) => n.id === id);
}
function nextId(prefix: string): string {
	const rand = typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID().slice(0, 8)
		: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${rand}`;
}
function nowIso(): string { return new Date().toISOString(); }

/** Malloy-safe identifier. */
function safeName(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'measure';
}

/** Escape a comment value (strip newlines and backticks). */
function escComment(v: unknown): string {
	if (v === null || v === undefined) return '';
	const s = typeof v === 'string' ? v : JSON.stringify(v);
	return s.replace(/[\r\n]+/g, ' ').replace(/`/g, "'");
}

/** Build a measure expression from an operator + ordered child names. */
function buildExpression(
	operator: string,
	children: { safeName: string; coefficient: number }[],
	customFormula: string
): string {
	if (operator === 'custom' && customFormula) return customFormula;
	if (children.length === 0) {
		// Leaf — use a neutral placeholder so Malloy compiles
		return 'count()';
	}
	switch (operator) {
		case 'sum':
			return children
				.map((c, i) => {
					const coef = c.coefficient ?? 1;
					if (coef === 1) return i === 0 ? c.safeName : `+ ${c.safeName}`;
					if (coef === -1) return i === 0 ? `-${c.safeName}` : `- ${c.safeName}`;
					return i === 0 ? `${coef} * ${c.safeName}` : `+ ${coef} * ${c.safeName}`;
				})
				.join(' ');
		case 'product':
			return children.map((c) => c.safeName).join(' * ');
		case 'ratio':
			return children.length >= 2 ? `${children[0].safeName} / ${children[1].safeName}` : children[0].safeName;
		case 'weighted_avg': {
			const num = children.map((c) => `${c.coefficient ?? 1} * ${c.safeName}`).join(' + ');
			const den = children.map((c) => `${c.coefficient ?? 1}`).join(' + ');
			return `(${num}) / (${den})`;
		}
		default:
			return children.map((c) => c.safeName).join(' + ');
	}
}

// ── Export ────────────────────────────────────────────────────────────────

function exportAll(data: GraphData, rootNodeId?: string): string {
	const { nodes, links } = data;
	const root =
		(rootNodeId ? findNode(nodes, rootNodeId) : undefined) ||
		nodes.find((n) => nodeHasLabel(n, 'metric_tree_model'));
	if (!root) throw new Error('No metric_tree_model root — cannot export to Malloy');

	// Collect all metric nodes in this tree via has_metric
	const metricLinks = linksFrom(links, root.id, 'has_metric');
	const metricNodes = metricLinks
		.map((l) => findNode(nodes, l.destination_id))
		.filter((n): n is ContextNode => !!n && nodeHasLabel(n, 'global_metric'));

	// Build parent → children (ordered) and child → parent maps
	const childrenOf = new Map<string, ContextNode[]>();
	const parentOf = new Map<string, ContextNode>();
	for (const l of links) {
		if (l.label === 'has_child_metric') {
			const parent = findNode(nodes, l.source_id);
			const child = findNode(nodes, l.destination_id);
			if (!parent || !child) continue;
			const list = childrenOf.get(parent.id) || [];
			list.push(child);
			childrenOf.set(parent.id, list);
			parentOf.set(child.id, parent);
		}
	}

	// Topological sort: leaves first, then nodes whose children are all emitted
	const emitted = new Set<string>();
	const orderedNodes: ContextNode[] = [];
	const remaining = [...metricNodes];
	let safetyCounter = 0;
	while (remaining.length > 0 && safetyCounter++ < 10_000) {
		for (let i = 0; i < remaining.length; i++) {
			const n = remaining[i];
			const kids = childrenOf.get(n.id) || [];
			const allKidsEmitted = kids.every((k) => emitted.has(k.id));
			if (allKidsEmitted) {
				orderedNodes.push(n);
				emitted.add(n.id);
				remaining.splice(i, 1);
				i--;
			}
		}
	}
	// If anything remains, append it in original order (prevents infinite loop on cycles)
	orderedNodes.push(...remaining);

	// Build measure blocks
	const lines: string[] = [];
	const rootSafe = safeName(root.name);
	lines.push(`// Metric Tree exported from Context Plane — ${escComment(root.name)}`);
	if (root.description) lines.push(`// ${escComment(root.description)}`);
	lines.push(``);
	lines.push(`source: ${rootSafe} is your_source_table extend {`);

	for (const n of orderedNodes) {
		const p = n.properties || {};
		const kids = childrenOf.get(n.id) || [];
		const operator = (p.operator as string) || 'sum';
		const customFormula = (p.customFormula as string) || '';

		const orderedKids = [...kids].sort((a, b) => {
			const ao = (a.properties?.order as number) ?? 0;
			const bo = (b.properties?.order as number) ?? 0;
			return ao - bo;
		});
		const childRefs = orderedKids.map((c) => ({
			safeName: safeName(c.name),
			coefficient: (c.properties?.coefficient as number) ?? 1
		}));
		const expr = buildExpression(operator, childRefs, customFormula);

		// Emit tree-metadata comments BEFORE the measure (so parsing associates them)
		const metaLines: string[] = [];
		if (p.role) metaLines.push(`  // @cp_metric_tree: role=${escComment(p.role)}`);
		if (operator && kids.length > 0) metaLines.push(`  // @cp_metric_tree: operator=${escComment(operator)}`);
		if (p.coefficient !== undefined && parentOf.has(n.id))
			metaLines.push(`  // @cp_metric_tree: coefficient=${escComment(p.coefficient)}`);
		if (p.unit) metaLines.push(`  // @cp_metric_tree: unit=${escComment(p.unit)}`);
		if (p.direction) metaLines.push(`  // @cp_metric_tree: direction=${escComment(p.direction)}`);
		if (p.target) metaLines.push(`  // @cp_metric_tree: target=${escComment(p.target)}`);
		if (p.grain) metaLines.push(`  // @cp_metric_tree: grain=${escComment(p.grain)}`);
		if (p.owner) metaLines.push(`  // @cp_metric_tree: owner=${escComment(p.owner)}`);
		if (p.status) metaLines.push(`  // @cp_metric_tree: status=${escComment(p.status)}`);
		if (p.source) metaLines.push(`  // @cp_metric_tree: source=${escComment(p.source)}`);
		const tags = (p.tags as string[]) || [];
		if (tags.length > 0) metaLines.push(`  // @cp_metric_tree: tags=${tags.map(escComment).join(',')}`);
		if (n.description) metaLines.push(`  // ${escComment(n.description)}`);

		lines.push('');
		lines.push(...metaLines);
		lines.push(`  measure: ${safeName(n.name)} is ${expr}`);
	}

	lines.push('}');
	lines.push('');

	return lines.join('\n');
}

// ── Import ────────────────────────────────────────────────────────────────

/**
 * Parse Malloy source text (ours, or hand-written) into a GraphData.
 * We only recognise `measure: <name> is <expression>` lines inside a
 * `source: ... extend { ... }` block, plus our own `// @cp_metric_tree: key=value`
 * comments that carry tree metadata.
 *
 * Parent/child links are inferred from identifier references inside each
 * measure's expression — if measure X's expression references measure Y,
 * Y is a child of X.
 */
function importAll(content: string): GraphData {
	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const ts = nowIso();

	// Identify the tree name from `source: <name> is ...`
	const sourceMatch = content.match(/source\s*:\s*([A-Za-z_][\w]*)\s+is/);
	const treeName = sourceMatch ? sourceMatch[1] : 'imported_tree';

	const rootId = `mt-model-${nextId('mt')}`;
	nodes.push({
		id: rootId,
		label: 'metric_tree_model',
		name: treeName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
		description: null,
		properties: {
			canvas: ['canvas_metric_tree'],
			sourceId: treeName,
			rootMetricId: null,
			owner: '',
			tags: [],
			domain: '',
			status: 'draft'
		},
		created_at: ts,
		updated_at: ts
	});

	// Walk the file line by line, collect pending metadata comments, then a measure.
	const lines = content.split(/\r?\n/);
	type PendingMeta = Record<string, string | string[]>;
	let pendingMeta: PendingMeta = {};
	let pendingDesc: string[] = [];

	const measuresInOrder: { name: string; expression: string; meta: PendingMeta; description: string }[] = [];

	const metaLineRe = /^\s*\/\/\s*@cp_metric_tree:\s*([\w]+)\s*=\s*(.*)$/;
	const plainCommentRe = /^\s*\/\/\s*(.*)$/;
	const measureLineRe = /^\s*measure\s*:\s*([A-Za-z_][\w]*)\s+is\s+(.*?)\s*$/;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		const metaMatch = line.match(metaLineRe);
		if (metaMatch) {
			const key = metaMatch[1];
			const val = metaMatch[2].trim();
			if (key === 'tags') {
				pendingMeta[key] = val.split(',').map((s) => s.trim()).filter(Boolean);
			} else {
				pendingMeta[key] = val;
			}
			continue;
		}
		const measureMatch = line.match(measureLineRe);
		if (measureMatch) {
			const name = measureMatch[1];
			const expression = measureMatch[2].replace(/;$/, '').trim();
			measuresInOrder.push({
				name,
				expression,
				meta: pendingMeta,
				description: pendingDesc.join(' ').trim()
			});
			pendingMeta = {};
			pendingDesc = [];
			continue;
		}
		const commentMatch = line.match(plainCommentRe);
		if (commentMatch && !metaMatch) {
			pendingDesc.push(commentMatch[1]);
			continue;
		}
		// On any other content, reset description (keep pendingMeta until next measure)
		if (line.trim() === '' || /^\s*(source|}|{)/.test(line)) {
			pendingDesc = [];
		}
	}

	// Create metric nodes
	const nameToNodeId = new Map<string, string>();
	for (const m of measuresInOrder) {
		const meta = m.meta;
		const nodeId = `mt-metric-${nextId('met')}`;
		const displayName = m.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
		nameToNodeId.set(m.name, nodeId);

		nodes.push({
			id: nodeId,
			label: 'global_metric',
			name: displayName,
			description: m.description || null,
			properties: {
				canvas: ['canvas_metric_tree'],
				sourceId: displayName,
				role: meta.role || undefined,
				operator: meta.operator || 'sum',
				customFormula: meta.operator === 'custom' ? m.expression : '',
				coefficient: meta.coefficient !== undefined ? Number(meta.coefficient) : 1,
				unit: meta.unit || 'count',
				direction: meta.direction || 'higher_is_better',
				owner: meta.owner || '',
				target: meta.target || '',
				grain: meta.grain || 'month',
				source: meta.source && typeof meta.source === 'string'
					? { type: 'manual', description: meta.source }
					: { type: 'manual' },
				tags: Array.isArray(meta.tags) ? meta.tags : [],
				status: meta.status || 'active'
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

	// Infer parent-child: scan each measure's expression for references to other measures
	const allMeasureNames = Array.from(nameToNodeId.keys());
	for (const m of measuresInOrder) {
		const parentNodeId = nameToNodeId.get(m.name);
		if (!parentNodeId) continue;
		// Strip strings / comments inside the expression (simple heuristic)
		const expr = m.expression;
		for (const candidate of allMeasureNames) {
			if (candidate === m.name) continue;
			const tokenRe = new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
			if (tokenRe.test(expr)) {
				const childId = nameToNodeId.get(candidate)!;
				// Avoid duplicate edges
				if (!links.some((l) => l.label === 'has_child_metric' && l.source_id === parentNodeId && l.destination_id === childId)) {
					links.push({
						id: nextId('link'),
						source_id: parentNodeId,
						destination_id: childId,
						label: 'has_child_metric',
						created_at: ts,
						updated_at: ts
					});
				}
			}
		}
	}

	// Root metric = any measure not referenced as a child
	const allChildIds = new Set(
		links.filter((l) => l.label === 'has_child_metric').map((l) => l.destination_id)
	);
	const orphanEntry = Array.from(nameToNodeId.entries()).find(([, id]) => !allChildIds.has(id));
	if (orphanEntry) {
		const rootModel = nodes.find((n) => n.id === rootId)!;
		const orphanNode = nodes.find((n) => n.id === orphanEntry[1]);
		(rootModel.properties as Record<string, unknown>).rootMetricId = orphanNode?.name || orphanEntry[0];
		// Stamp the root metric's role if not already set
		if (orphanNode && !orphanNode.properties?.role) {
			(orphanNode.properties as Record<string, unknown>).role = 'root';
		}
	}

	return { nodes, links };
}

// ── Validate ──────────────────────────────────────────────────────────────

function validate(content: string): ValidationResult {
	const errors: string[] = [];
	if (!/source\s*:/.test(content)) errors.push("Missing 'source:' declaration");
	if (!/measure\s*:/.test(content)) errors.push("No 'measure:' declarations found");
	// Count braces
	const open = (content.match(/\{/g) || []).length;
	const close = (content.match(/\}/g) || []).length;
	if (open !== close) errors.push(`Unbalanced braces (${open} open, ${close} close)`);
	return { valid: errors.length === 0, errors };
}

// ── Language module ────────────────────────────────────────────────────────

export const malloy: Language = {
	id: 'malloy',
	name: 'Malloy',
	version: '0.x',
	fileExtension: 'malloy',
	mimeType: 'text/x-malloy',
	supportedEntities: ['metric_tree_model', 'global_metric'],
	entityMap,
	relationshipMap,
	propertyMap,
	export: exportAll,
	import: importAll,
	validate
};
