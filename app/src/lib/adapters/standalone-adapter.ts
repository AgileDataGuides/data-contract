import type { DataAdapter, ContextNode, ContextLink } from '$lib/cp-shared';
import type { ContractModel, ContractPatternType, ContractPatternOverride } from '$lib/types';
import { contractToContextPlane } from '$lib/converters/context-plane';

/**
 * Create a DataAdapter that wraps the contract store for standalone mode.
 * Converts between ContextNode/ContextLink format and the native ContractModel.
 *
 * Pattern-type customisations: the Manage Pattern Types UI in
 * `ContractPatternsTab.svelte` writes through the adapter using two graph
 * labels:
 *   - `contract_config`  — carries the user's customised patternTypes list
 *                          (one node per contract, linked via has_contract_config)
 *   - `contract_pattern` — per-pattern value/description override
 *                          (one node per overridden pattern, linked via has_pattern_override)
 *
 * In the embedded CP context (DuckDB-backed adapter) these become real graph
 * nodes. In standalone mode this adapter routes them into two new ContractModel
 * fields — `patternTypes` and `patternOverrides` — via the
 * `onSetPatternTypes` / `onSetPatternOverride` / `onDeletePatternOverride`
 * callbacks. The converter (`contractToContextPlane`) then re-emits these as
 * the same graph nodes deterministically (stable IDs `dc-config-<modelId>`
 * and `dc-pattern-<modelId>-<patternId>`) so the round-trip
 * createNode → updateNode → getNode lookup chain works.
 */
export function createStandaloneAdapter(callbacks: {
	getModel: () => ContractModel;
	getSavedList: () => { id: string; name: string }[];
	onUpdateNode: (id: string, updates: Partial<ContextNode>) => void;
	onCreateContract: (name: string) => Promise<void>;
	onDeleteContract: (id: string) => Promise<void>;
	onRenameContract: (name: string) => void;
	onUpdateDescription: (desc: string) => void;
	onAddItem: (entityLabel: string, name: string) => void;
	onRemoveItem: (entityLabel: string, itemId: string) => void;
	onSwitchTo: (id: string) => Promise<void>;
	/** Optional: update typed properties (dataType/required/ruleType/...) on an item */
	onUpdateItemProperties?: (sourceId: string, updates: Record<string, unknown>) => void;
	/** Optional: update contract root metadata (status/domain/informationProduct/tags) */
	onUpdateMetadata?: (updates: Record<string, unknown>) => void;
	/** Optional: replace the per-contract pattern types list (or null = use defaults). */
	onSetPatternTypes?: (types: ContractPatternType[] | null) => void;
	/** Optional: set/replace one pattern's value+description override. */
	onSetPatternOverride?: (patternId: string, override: ContractPatternOverride) => void;
	/** Optional: remove a pattern override (revert to static defaults for that pattern). */
	onDeletePatternOverride?: (patternId: string) => void;
	/** Optional: reorder an item within its containing array. Called when the
	 *  shared CanvasSection drag-drop emits `properties.order` updates. */
	onReorderItem?: (sourceId: string, newOrder: number) => void;
}): DataAdapter {
	function getSnapshot() {
		return contractToContextPlane(callbacks.getModel());
	}

	return {
		async getNodes(filter) {
			const { nodes } = getSnapshot();
			if (filter?.label) return nodes.filter((n) => n.label.includes(filter.label!));
			return nodes;
		},
		async getNode(id) {
			const { nodes } = getSnapshot();
			return nodes.find((n) => n.id === id) ?? null;
		},
		async createNode(input) {
			const now = new Date().toISOString();
			const name = input.name || 'Untitled';
			const label = input.label;

			if (label === 'contract_model') {
				await callbacks.onCreateContract(name);
			} else if (label === 'contract_config') {
				// Pattern types config — write through to ContractModel.patternTypes.
				const types = (input.properties?.patternTypes as ContractPatternType[] | undefined) ?? null;
				if (callbacks.onSetPatternTypes) callbacks.onSetPatternTypes(types);
			} else if (label === 'contract_pattern') {
				// Per-pattern override — write through to ContractModel.patternOverrides.
				const props = input.properties as Record<string, unknown> | null | undefined;
				const patternId = props?.patternId as string | undefined;
				if (patternId && callbacks.onSetPatternOverride) {
					callbacks.onSetPatternOverride(patternId, {
						lookupValues: (props?.lookupValues as string[] | undefined) ?? [],
						valueDescriptions: (props?.valueDescriptions as Record<string, string> | undefined) ?? {},
						patternDescription: (props?.patternDescription as string | undefined) ?? ''
					});
				}
			} else {
				callbacks.onAddItem(label, name);
			}

			const { nodes } = getSnapshot();
			// For contract_config / contract_pattern, the converter emits stable IDs —
			// look up by label first since names match exactly ("Contract Config" / patternId).
			const found =
				(label === 'contract_config' || label === 'contract_pattern')
					? nodes.find((n) => n.label.includes(label) && (
						label === 'contract_pattern'
							? (n.properties as Record<string, unknown> | null)?.patternId === (input.properties as Record<string, unknown> | undefined)?.patternId
							: true
					))
					: nodes.find((n) => n.name === name && n.label.includes(label));
			return found || { id: `temp-${Date.now()}`, label, name, properties: input.properties || null, created_at: now, updated_at: now };
		},
		async updateNode(id, updates) {
			const { nodes } = getSnapshot();
			const node = nodes.find((n) => n.id === id);
			if (!node) return { id, label: '', name: '', ...updates } as ContextNode;

			// Pattern config / overrides — route to model fields.
			if (node.label.includes('contract_config') && updates.properties) {
				const types = ((updates.properties as Record<string, unknown>).patternTypes
					?? (node.properties as Record<string, unknown> | null)?.patternTypes) as ContractPatternType[] | null | undefined;
				if (callbacks.onSetPatternTypes) callbacks.onSetPatternTypes(types ?? null);
				return { ...node, ...updates } as ContextNode;
			}
			if (node.label.includes('contract_pattern') && updates.properties) {
				const merged = { ...(node.properties as Record<string, unknown> | null), ...(updates.properties as Record<string, unknown>) };
				const patternId = merged.patternId as string | undefined;
				if (patternId && callbacks.onSetPatternOverride) {
					callbacks.onSetPatternOverride(patternId, {
						lookupValues: (merged.lookupValues as string[] | undefined) ?? [],
						valueDescriptions: (merged.valueDescriptions as Record<string, string> | undefined) ?? {},
						patternDescription: (merged.patternDescription as string | undefined) ?? ''
					});
				}
				return { ...node, ...updates } as ContextNode;
			}

			if (node.label.includes('contract_model')) {
				if (updates.name) callbacks.onRenameContract(updates.name);
				if (updates.description !== undefined) callbacks.onUpdateDescription(updates.description || '');
				// Route metadata property updates to onUpdateMetadata if provided
				if (updates.properties && callbacks.onUpdateMetadata) {
					// Note: `domain` and `informationProduct` are no longer metadata
					// properties — they're linked graph nodes (global_domain /
					// global_info_product), handled by addItem/removeItem via
					// LABEL_TO_FIELD. Only true root-level properties remain here.
					// Legacy keys (`loadType`, `dataWindow`) are still accepted so
					// older property-update paths keep working; the store rewrites
					// them to the new fields on migrate.
					const metaKeys = [
						'status', 'tags', 'changeDetection', 'retentionPeriod', 'historyWindow',
						'exampleData', 'loadType', 'dataWindow'
					] as const;
					const metaUpdates: Record<string, unknown> = {};
					for (const k of metaKeys) {
						if (k in updates.properties) metaUpdates[k] = (updates.properties as Record<string, unknown>)[k];
					}
					if (Object.keys(metaUpdates).length > 0) callbacks.onUpdateMetadata(metaUpdates);
				}
			} else {
				// For non-contract nodes: name/description go through onUpdateNode,
				// other properties go through onUpdateItemProperties (if provided).
				//
				// IMPORTANT: pass the underlying ContractItem id (`sourceId`), NOT the
				// converter-wrapped node id (e.g. `dc-delivery_type-…`). Store mutators
				// like `updateItemName` look up by raw item.id; the wrapped form would
				// silently miss every record.
				const sourceId = (node.properties?.sourceId as string) || id;
				const nameOrDesc: Partial<ContextNode> = {};
				if (updates.name !== undefined) nameOrDesc.name = updates.name;
				if (updates.description !== undefined) nameOrDesc.description = updates.description;
				if (Object.keys(nameOrDesc).length > 0) callbacks.onUpdateNode(sourceId, nameOrDesc);

				if (updates.properties) {
					const props = updates.properties as Record<string, unknown>;
					// Drag-drop reorder: shared CanvasSection emits per-card
					// `properties.order` updates with the new 1-based slot.
					if (typeof props.order === 'number' && callbacks.onReorderItem) {
						callbacks.onReorderItem(sourceId, props.order);
					}
					if (callbacks.onUpdateItemProperties) {
						// Strip system properties + `order` (handled above) before forwarding.
						const { canvas: _c, sourceId: _s, order: _o, ...rest } = props;
						if (Object.keys(rest).length > 0) callbacks.onUpdateItemProperties(sourceId, rest);
					}
				}
			}

			return { ...node, ...updates } as ContextNode;
		},
		async deleteNode(id) {
			const { nodes } = getSnapshot();
			const node = nodes.find((n) => n.id === id);
			if (!node) return;

			if (node.label.includes('contract_model')) {
				await callbacks.onDeleteContract((node.properties?.sourceId as string) || id);
			} else if (node.label.includes('contract_pattern')) {
				const patternId = (node.properties as Record<string, unknown> | null)?.patternId as string | undefined;
				if (patternId && callbacks.onDeletePatternOverride) {
					callbacks.onDeletePatternOverride(patternId);
				}
			} else if (node.label.includes('contract_config')) {
				// Deleting the config node = revert pattern types to defaults.
				if (callbacks.onSetPatternTypes) callbacks.onSetPatternTypes(null);
			} else {
				const sourceId = (node.properties?.sourceId as string) || id;
				const label = node.label.split(',')[0];
				callbacks.onRemoveItem(label, sourceId);
			}
		},
		async getLinks(filter) {
			const { links } = getSnapshot();
			if (filter?.label) return links.filter((l) => l.label === filter.label);
			if (filter?.source_id) return links.filter((l) => l.source_id === filter.source_id);
			return links;
		},
		async createLink(input) {
			const now = new Date().toISOString();
			return { id: `temp-${Date.now()}`, ...input, created_at: now, updated_at: now } as ContextLink;
		},
		async deleteLink() {
			// Links are structural in standalone mode
		},
		async exportAll() { return getSnapshot(); },
		async importAll() {
			// Handled at the store level
		}
	};
}
