<script lang="ts">
	/**
	 * Contract Patterns tab — manages the Data Architecture pattern values
	 * that are scoped to the selected Data Contract. Visual + interaction
	 * design mirrors the Checklist's ChecklistPatternsTab exactly (same UI
	 * grammar, same persistence model). The Data Contract additionally uses
	 * the `change-detection` pattern's values to populate the Load Type
	 * cycling chip on the main contract canvas — so editing that pattern
	 * here affects what Load Types the user can cycle through.
	 *
	 * Persistence:
	 *   - Static defaults come from `@context-plane/shared/data/patterns`,
	 *     filtered via `getPatternsForCanvas('canvas_data_contract')` — the
	 *     master pattern catalog includes patterns that are Checklist-only
	 *     (Layer Governance Policy, Contains PII, Destructive Rebuilds, …)
	 *     and we don't want to show those on the Data Contract.
	 *   - Per-contract overrides are stored as `contract_pattern` nodes linked
	 *     to the contract via `has_pattern_override`. Each override carries
	 *     `{patternId, lookupValues, valueDescriptions, patternDescription}`.
	 *   - The list of pattern TYPES (not their values) can also be customised
	 *     per-contract — stored on a `contract_config` node linked via
	 *     `has_contract_config`, with a `patternTypes` array.
	 *
	 * All mutations go through the injected DataAdapter (standalone or CP).
	 */
	import { getContext } from 'svelte';
	import type { DataAdapter, ContextNode, ContextLink } from '$lib/cp-shared';
	import { getNodeLabels } from '$lib/cp-shared';
	import {
		getPatternsForCanvas,
		rawLookups as staticLookups,
		rawDictionary as staticDictionary,
		type Pattern,
		type PatternLookups,
		type PatternDictionary
	} from '$lib/shared-data/patterns';

	// Filter the master to only patterns relevant to this canvas.
	const staticPatterns: Pattern[] = getPatternsForCanvas('canvas_data_contract');

	interface Props {
		nodes: ContextNode[];
		links: ContextLink[];
		selectedContractId: string | null;
	}

	let { nodes, links, selectedContractId }: Props = $props();

	const adapter = getContext<DataAdapter>('dataAdapter');

	// ─── Helpers ───────────────────────────────────────────────
	function exportTimestamp(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
	}

	function slugifyName(name: string): string {
		return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'export';
	}

	const selectedContractName = $derived(
		selectedContractId ? (nodes.find((n) => n.id === selectedContractId)?.name ?? '') : ''
	);

	// ─── Local state ───────────────────────────────────────────
	let selectedPattern = $state<string>(staticPatterns[0].id);
	let newValue = $state('');
	let newDescription = $state('');
	let editingValue = $state<string | null>(null);
	let editDescription = $state('');
	let editingPatternDesc = $state(false);
	let editPatternDescValue = $state('');
	let search = $state('');
	let switcherOpen = $state(false);
	let highlightValue = $state<string | null>(null);

	// Manage Pattern Types state
	let showPatternTypes = $state(false);
	let newPatternName = $state('');
	let newPatternMultiSelect = $state(true);
	let editingPatternTypeId = $state<string | null>(null);
	let editPatternTypeName = $state('');
	let editPatternTypeMultiSelect = $state(false);

	// ─── Derived: config node for pattern types ───
	let configNode = $derived(
		selectedContractId
			? (() => {
					const configLinkIds = links
						.filter((l) => l.label === 'has_contract_config' && l.source_id === selectedContractId)
						.map((l) => l.destination_id);
					return nodes.find(
						(n) => getNodeLabels(n).includes('contract_config') && configLinkIds.includes(n.id)
					) ?? null;
				})()
			: null
	);

	let localPatterns = $derived<Pattern[]>(
		configNode?.properties?.patternTypes
			? (configNode.properties.patternTypes as Pattern[])
			: [...staticPatterns]
	);

	// ─── Derived: override nodes linked to selected contract ───
	let overrideLinks = $derived<ContextLink[]>(
		selectedContractId
			? links.filter(
					(l) => l.label === 'has_pattern_override' && l.source_id === selectedContractId
				)
			: []
	);

	let overrideNodes = $derived<ContextNode[]>(
		overrideLinks
			.map((l) => nodes.find((n) => n.id === l.destination_id))
			.filter((n): n is ContextNode => !!n && getNodeLabels(n).includes('contract_pattern'))
	);

	// Build merged lookups/descriptions/pattern-descriptions from static + overrides
	function getOverrideNode(patternId: string): ContextNode | undefined {
		return overrideNodes.find(
			(n) => (n.properties as Record<string, unknown>)?.patternId === patternId
		);
	}

	let localLookups = $derived.by<PatternLookups>(() => {
		const merged: PatternLookups = {};
		for (const p of localPatterns) {
			const override = getOverrideNode(p.id);
			if (override) {
				const vals = (override.properties as Record<string, unknown>)?.lookupValues;
				merged[p.id] = Array.isArray(vals) ? (vals as string[]) : structuredClone(staticLookups[p.id] ?? []);
			} else {
				merged[p.id] = structuredClone(staticLookups[p.id] ?? []);
			}
		}
		return merged;
	});

	let localDictValues = $derived.by<Record<string, Record<string, string>>>(() => {
		const merged: Record<string, Record<string, string>> = {};
		for (const p of localPatterns) {
			const override = getOverrideNode(p.id);
			if (override) {
				const descs = (override.properties as Record<string, unknown>)?.valueDescriptions;
				merged[p.id] =
					descs && typeof descs === 'object' ? (descs as Record<string, string>) : structuredClone(staticDictionary.values[p.id] ?? {});
			} else {
				merged[p.id] = structuredClone(staticDictionary.values[p.id] ?? {});
			}
		}
		return merged;
	});

	let localPatternDescs = $derived.by<Record<string, string>>(() => {
		const merged: Record<string, string> = {};
		for (const p of localPatterns) {
			const override = getOverrideNode(p.id);
			if (override) {
				const desc = (override.properties as Record<string, unknown>)?.patternDescription;
				merged[p.id] = typeof desc === 'string' ? desc : (staticDictionary.patterns[p.id] ?? '');
			} else {
				merged[p.id] = staticDictionary.patterns[p.id] ?? '';
			}
		}
		return merged;
	});

	let currentValues = $derived(localLookups[selectedPattern] ?? []);
	let currentDescriptions = $derived(localDictValues[selectedPattern] ?? {});

	type SearchResult = { value: string; patternId: string; description: string };
	let globalSearchResults = $derived<SearchResult[]>(
		search
			? localPatterns.flatMap((p) => {
					const q = search.toLowerCase();
					const vals = localLookups[p.id] ?? [];
					const descs = localDictValues[p.id] ?? {};
					return vals
						.filter((v) => v.toLowerCase().includes(q) || (descs[v] ?? '').toLowerCase().includes(q))
						.map((v) => ({ value: v, patternId: p.id, description: descs[v] ?? '' }));
				})
			: []
	);

	// ─── Helpers ─────────────────────────────────────────────
	function patternName(id: string): string {
		return localPatterns.find((p) => p.id === id)?.name ?? id;
	}

	function toKebabCase(str: string): string {
		return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	function navigateToValue(patternId: string, value: string) {
		selectedPattern = patternId;
		search = '';
		highlightValue = value;
		requestAnimationFrame(() => {
			const el = document.querySelector(`[data-value="${CSS.escape(value)}"]`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				setTimeout(() => {
					highlightValue = null;
				}, 2000);
			}
		});
	}

	function handleClickOutsideSwitcher(e: MouseEvent) {
		if (switcherOpen && !(e.target as HTMLElement)?.closest('[data-pattern-switcher]')) {
			switcherOpen = false;
		}
	}

	// ─── Persistence via DataAdapter ─────────────────────────
	async function findOrCreateOverrideNode(patternId: string): Promise<ContextNode> {
		const existing = getOverrideNode(patternId);
		if (existing) return existing;

		const node = await adapter.createNode({
			label: 'contract_pattern',
			name: patternName(patternId),
			description: staticDictionary.patterns[patternId] ?? '',
			properties: {
				patternId,
				lookupValues: structuredClone(staticLookups[patternId] ?? []),
				valueDescriptions: structuredClone(staticDictionary.values[patternId] ?? {}),
				patternDescription: staticDictionary.patterns[patternId] ?? ''
			}
		});

		if (selectedContractId) {
			await adapter.createLink({
				source_id: selectedContractId,
				destination_id: node.id,
				label: 'has_pattern_override'
			});
		}

		return node;
	}

	async function persistPatternOverride(
		patternId: string,
		lookupValues: string[],
		valueDescriptions: Record<string, string>,
		patternDescription: string
	) {
		const node = await findOrCreateOverrideNode(patternId);
		await adapter.updateNode(node.id, {
			properties: {
				...(node.properties as Record<string, unknown>),
				patternId,
				lookupValues,
				valueDescriptions,
				patternDescription
			}
		});
	}

	async function saveCurrentPattern() {
		if (!selectedContractId) return;
		await persistPatternOverride(
			selectedPattern,
			localLookups[selectedPattern] ?? [],
			localDictValues[selectedPattern] ?? {},
			localPatternDescs[selectedPattern] ?? ''
		);
	}

	async function addValue() {
		const trimmed = newValue.trim();
		if (!trimmed || currentValues.includes(trimmed)) return;

		const vals = [...(localLookups[selectedPattern] ?? []), trimmed].sort((a, b) =>
			a.localeCompare(b)
		);
		const descs = { ...(localDictValues[selectedPattern] ?? {}), [trimmed]: newDescription.trim() || 'TBD' };
		const desc = localPatternDescs[selectedPattern] ?? '';

		await persistPatternOverride(selectedPattern, vals, descs, desc);
		newValue = '';
		newDescription = '';
	}

	async function removeValue(value: string) {
		if (!selectedContractId) return;
		editingValue = null;
		editDescription = '';
		if (!confirm(`Delete value "${value}" from ${patternName(selectedPattern)}?`)) return;
		try {
			const vals = (localLookups[selectedPattern] ?? []).filter((v) => v !== value);
			const descs = { ...(localDictValues[selectedPattern] ?? {}) };
			delete descs[value];
			const desc = localPatternDescs[selectedPattern] ?? '';

			let override = nodes.find(
				(n) =>
					getNodeLabels(n).includes('contract_pattern') &&
					(n.properties as Record<string, unknown>)?.patternId === selectedPattern &&
					links.some(
						(l) =>
							l.label === 'has_pattern_override' &&
							l.source_id === selectedContractId &&
							l.destination_id === n.id
					)
			);
			if (!override) {
				override = await adapter.createNode({
					label: 'contract_pattern',
					name: patternName(selectedPattern),
					description: staticDictionary.patterns[selectedPattern] ?? '',
					properties: {
						patternId: selectedPattern,
						lookupValues: vals,
						valueDescriptions: descs,
						patternDescription: desc
					}
				});
				await adapter.createLink({
					source_id: selectedContractId,
					destination_id: override.id,
					label: 'has_pattern_override'
				});
				return;
			}

			await adapter.updateNode(override.id, {
				properties: {
					...(override.properties as Record<string, unknown>),
					patternId: selectedPattern,
					lookupValues: vals,
					valueDescriptions: descs,
					patternDescription: desc
				}
			});
		} catch (err) {
			alert(`Failed to delete value: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	function startEdit(value: string) {
		editingValue = value;
		editDescription = currentDescriptions[value] ?? '';
	}

	let savingEdit = false;
	async function saveEdit() {
		if (!editingValue || savingEdit) return;
		if (!selectedContractId) { editingValue = null; editDescription = ''; return; }
		savingEdit = true;
		try {
			const descs = { ...(localDictValues[selectedPattern] ?? {}), [editingValue]: editDescription };
			const vals = localLookups[selectedPattern] ?? [];
			const desc = localPatternDescs[selectedPattern] ?? '';

			let override = nodes.find(
				(n) =>
					getNodeLabels(n).includes('contract_pattern') &&
					(n.properties as Record<string, unknown>)?.patternId === selectedPattern &&
					links.some(
						(l) =>
							l.label === 'has_pattern_override' &&
							l.source_id === selectedContractId &&
							l.destination_id === n.id
					)
			);
			if (!override) {
				override = await adapter.createNode({
					label: 'contract_pattern',
					name: patternName(selectedPattern),
					description: staticDictionary.patterns[selectedPattern] ?? '',
					properties: {
						patternId: selectedPattern,
						lookupValues: vals,
						valueDescriptions: descs,
						patternDescription: desc
					}
				});
				await adapter.createLink({
					source_id: selectedContractId,
					destination_id: override.id,
					label: 'has_pattern_override'
				});
			} else {
				await adapter.updateNode(override.id, {
					properties: {
						...(override.properties as Record<string, unknown>),
						patternId: selectedPattern,
						lookupValues: vals,
						valueDescriptions: descs,
						patternDescription: desc
					}
				});
			}
		} catch (err) {
			alert(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			editingValue = null;
			editDescription = '';
			savingEdit = false;
		}
	}

	function cancelEdit() {
		editingValue = null;
		editDescription = '';
	}

	async function savePatternDesc() {
		const vals = localLookups[selectedPattern] ?? [];
		const descs = localDictValues[selectedPattern] ?? {};
		await persistPatternOverride(selectedPattern, vals, descs, editPatternDescValue.trim());
		editingPatternDesc = false;
	}

	async function resetToDefaults() {
		if (!confirm('Reset all pattern overrides and pattern types on this contract to built-in defaults?')) return;
		if (!selectedContractId) return;

		const linksToDelete = [...overrideLinks];
		for (const link of linksToDelete) {
			const node = nodes.find((n) => n.id === link.destination_id);
			if (node) {
				await adapter.deleteLink(link.id);
				await adapter.deleteNode(node.id);
			}
		}
		await updateConfigProperties({ patternTypes: [...staticPatterns] });
		for (const p of staticPatterns) {
			const node = await adapter.createNode({
				label: 'contract_pattern',
				name: patternName(p.id),
				description: staticDictionary.patterns[p.id] ?? '',
				properties: {
					patternId: p.id,
					lookupValues: structuredClone(staticLookups[p.id] ?? []),
					valueDescriptions: structuredClone(staticDictionary.values[p.id] ?? {}),
					patternDescription: staticDictionary.patterns[p.id] ?? ''
				}
			});
			await adapter.createLink({
				source_id: selectedContractId,
				destination_id: node.id,
				label: 'has_pattern_override'
			});
		}
		selectedPattern = staticPatterns[0]?.id ?? '';
	}

	// ─── Config node helpers (for pattern types) ───────────
	async function getOrCreateConfigNode(): Promise<ContextNode> {
		if (configNode) return configNode;
		if (!selectedContractId) throw new Error('No contract selected');
		const newConfig = await adapter.createNode({
			label: 'contract_config',
			name: 'Contract Config',
			description: 'Pattern types + per-contract config storage',
			properties: {
				patternTypes: [...staticPatterns]
			}
		});
		await adapter.createLink({
			source_id: selectedContractId,
			destination_id: newConfig.id,
			label: 'has_contract_config'
		});
		return newConfig;
	}

	async function updateConfigProperties(updates: Record<string, unknown>) {
		const cfg = await getOrCreateConfigNode();
		const currentProps = cfg.properties ?? {};
		await adapter.updateNode(cfg.id, {
			properties: { ...currentProps, ...updates }
		});
	}

	// ─── Pattern Type management ────────────────────────────
	async function addPatternType() {
		const name = newPatternName.trim();
		if (!name) return;
		const id = toKebabCase(name);
		if (localPatterns.some((p) => p.id === id)) {
			alert(`A pattern type with ID "${id}" already exists.`);
			return;
		}
		const order = localPatterns.length + 1;
		const updatedPatterns = [...localPatterns, { id, name, order, multiSelect: newPatternMultiSelect }];
		await updateConfigProperties({ patternTypes: updatedPatterns });
		await persistPatternOverride(id, [], {}, '');
		newPatternName = '';
		newPatternMultiSelect = true;
	}

	/**
	 * Toggle whether a pattern type shows on this contract's canvas. Reversible —
	 * the entry stays in the catalog with `enabled: false`, and the canvas-side
	 * filter (`p.enabled !== false`) hides it. Preferred to delete because the
	 * user can undo with one click.
	 */
	async function togglePatternType(id: string) {
		const updatedPatterns = localPatterns.map((p) =>
			p.id === id ? { ...p, enabled: p.enabled === false ? true : false } : p
		);
		await updateConfigProperties({ patternTypes: updatedPatterns });
	}

	/**
	 * Permanently delete a pattern type from this contract — removes it from the
	 * catalog AND deletes any override data. Use the toggle above for a
	 * reversible hide. The pattern can still be re-added via "Add Pattern Type"
	 * because per-contract scope means there's no risk of losing it forever
	 * (Reset to Defaults restores the full catalog).
	 */
	async function deletePatternType(id: string) {
		if (!confirm(`Permanently delete pattern type "${patternName(id)}" from this contract? This removes it from the catalog and deletes its override data. Use the toggle to hide instead.`)) return;
		let updatedPatterns = localPatterns.filter((p) => p.id !== id);
		updatedPatterns = updatedPatterns.map((p, i) => ({ ...p, order: i + 1 }));
		await updateConfigProperties({ patternTypes: updatedPatterns });
		const overrideNode = getOverrideNode(id);
		if (overrideNode) {
			const link = overrideLinks.find((l) => l.destination_id === overrideNode.id);
			if (link) await adapter.deleteLink(link.id);
			await adapter.deleteNode(overrideNode.id);
		}
		if (selectedPattern === id) {
			selectedPattern = updatedPatterns[0]?.id ?? '';
		}
	}

	function startEditPatternType(p: Pattern) {
		editingPatternTypeId = p.id;
		editPatternTypeName = p.name;
		editPatternTypeMultiSelect = p.multiSelect;
	}

	async function saveEditPatternType() {
		if (!editingPatternTypeId) return;
		const name = editPatternTypeName.trim();
		if (!name) return;
		const updatedPatterns = localPatterns.map((p) =>
			p.id === editingPatternTypeId ? { ...p, name, multiSelect: editPatternTypeMultiSelect } : p
		);
		await updateConfigProperties({ patternTypes: updatedPatterns });
		editingPatternTypeId = null;
	}

	function cancelEditPatternType() {
		editingPatternTypeId = null;
	}

	// ─── Export / Import ─────────────────────────────────────
	//
	// Two bundle shapes:
	//
	//   ALL-bundle (plural `patternTypes`)
	//     { patternTypes: Pattern[],
	//       lookups: Record<patternId, string[]>,
	//       dictionary: { patterns: Record<id,string>, values: Record<id,Record<value,string>> } }
	//
	//   SINGLE-bundle (singular `patternType`)
	//     { patternType: Pattern,
	//       values: string[],
	//       description: string,
	//       valueDescriptions: Record<value,string> }
	//
	// `importAll()` auto-detects which shape the file is and routes accordingly.
	// `exportAll()` writes the plural form. `exportPatternType(id)` writes the
	// singular form, scoped to one pattern only.

	function exportAll() {
		const bundle = {
			patternTypes: localPatterns,
			lookups: localLookups,
			dictionary: { patterns: localPatternDescs, values: localDictValues }
		};
		const slug = slugifyName(selectedContractName);
		download(JSON.stringify(bundle, null, 2), `${slug}-contract-patterns-${exportTimestamp()}.json`, 'application/json');
	}

	/**
	 * Export a single pattern type (definition + values + descriptions) to a
	 * portable JSON file. Lets the user share, back up, or migrate one specific
	 * pattern without bundling everything else.
	 */
	function exportPatternType(patternId: string) {
		const p = localPatterns.find((x) => x.id === patternId);
		if (!p) {
			alert(`Pattern "${patternId}" not found.`);
			return;
		}
		const bundle = {
			patternType: p,
			values: localLookups[patternId] ?? [],
			description: localPatternDescs[patternId] ?? '',
			valueDescriptions: localDictValues[patternId] ?? {}
		};
		const slug = slugifyName(selectedContractName);
		download(
			JSON.stringify(bundle, null, 2),
			`${slug}-pattern-${patternId}-${exportTimestamp()}.json`,
			'application/json'
		);
	}

	function importAll() {
		importFile('.json', async (text) => {
			let data: Record<string, unknown>;
			try {
				data = JSON.parse(text);
			} catch {
				alert('Could not parse JSON file');
				return;
			}

			// SINGLE-bundle shape (one pattern)
			if (data.patternType && typeof (data.patternType as Pattern).id === 'string') {
				await importSingleBundle(data);
				return;
			}

			// ALL-bundle shape
			if (!data.lookups || !(data.dictionary as { values?: unknown })?.values) {
				alert('Invalid bundle file — expected { patternType, values, ... } for single pattern OR { patternTypes, lookups, dictionary } for all patterns.');
				return;
			}
			try {
				if (Array.isArray(data.patternTypes)) {
					await updateConfigProperties({ patternTypes: data.patternTypes });
				}
				const patternsToImport = Array.isArray(data.patternTypes) ? (data.patternTypes as Pattern[]) : localPatterns;
				const lookupsIn = data.lookups as PatternLookups;
				const dictIn = data.dictionary as PatternDictionary;
				let count = 0;
				for (const p of patternsToImport) {
					await persistPatternOverride(
						p.id,
						lookupsIn[p.id] ?? staticLookups[p.id] ?? [],
						dictIn.values?.[p.id] ?? staticDictionary.values[p.id] ?? {},
						dictIn.patterns?.[p.id] ?? staticDictionary.patterns[p.id] ?? ''
					);
					count++;
				}
				alert(`Imported ${count} pattern${count !== 1 ? 's' : ''} successfully.`);
			} catch (err) {
				alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
	}

	/**
	 * Apply a SINGLE-bundle import. If a pattern with the same id already exists
	 * on this contract, the user is prompted to confirm replacement; otherwise
	 * the pattern is added as a new chip.
	 */
	async function importSingleBundle(data: Record<string, unknown>) {
		const incoming = data.patternType as Pattern;
		const incomingId = incoming.id;
		const existing = localPatterns.find((p) => p.id === incomingId);
		const action = existing ? 'replace' : 'add';

		if (existing) {
			if (!confirm(`A pattern type with ID "${incomingId}" already exists ("${existing.name}"). Replace it with the imported one?`)) return;
		}

		try {
			let updatedPatterns: Pattern[];
			if (existing) {
				updatedPatterns = localPatterns.map((p) =>
					p.id === incomingId ? { ...p, ...incoming } : p
				);
			} else {
				const order = localPatterns.length + 1;
				updatedPatterns = [...localPatterns, { ...incoming, order }];
			}
			await updateConfigProperties({ patternTypes: updatedPatterns });
			await persistPatternOverride(
				incomingId,
				Array.isArray(data.values) ? (data.values as string[]) : [],
				typeof data.valueDescriptions === 'object' && data.valueDescriptions !== null ? (data.valueDescriptions as Record<string, string>) : {},
				typeof data.description === 'string' ? data.description : ''
			);
			selectedPattern = incomingId;
			alert(`Pattern "${incoming.name}" ${action === 'replace' ? 'replaced' : 'added'} successfully.`);
		} catch (err) {
			alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	function importFile(accept: string, onLoad: (text: string) => void) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const text = await file.text();
			onLoad(text);
		};
		input.click();
	}

	function download(content: string, filename: string, type: string) {
		const blob = new Blob([content], { type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:window onclick={handleClickOutsideSwitcher} />

<div class="admin">
	<div class="flex flex-wrap items-center justify-between gap-3 mb-4 rounded-lg px-4 py-3 bg-slate-50 border border-slate-200">
		<div class="flex items-center gap-2 flex-wrap">
			<div class="relative" data-pattern-switcher>
				<button type="button" class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
					onclick={() => { switcherOpen = !switcherOpen; }}>
					<div class="text-left">
						<div class="text-sm font-semibold text-slate-800 leading-tight">{patternName(selectedPattern)}</div>
						<div class="text-[10px] text-slate-400 leading-tight">Switch Pattern Type</div>
					</div>
					<svg class="w-4 h-4 text-slate-400 transition-transform {switcherOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if switcherOpen}
					<div class="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1 min-w-[250px] max-h-[400px] overflow-y-auto">
						{#each localPatterns as p}
							<button type="button" class="w-full text-left px-4 py-2 text-sm transition-colors {selectedPattern === p.id ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-600 hover:bg-slate-50'}"
								onclick={() => { selectedPattern = p.id; search = ''; switcherOpen = false; }}>
								{p.name}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<input type="text" placeholder="Search values..." bind:value={search} class="text-sm px-3 py-1.5 border border-slate-300 rounded-lg bg-white min-w-[150px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
			<button type="button" class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-cyan-700 border border-cyan-300 hover:bg-cyan-50 transition-colors" onclick={saveCurrentPattern}>Save</button>
			<button
				type="button"
				class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
				onclick={() => exportPatternType(selectedPattern)}
				title="Export just the currently-selected pattern type (use Import Patterns to bring it back into any contract)"
			>Export this Pattern Type</button>
			<button type="button" class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-red-500 border border-red-300 hover:bg-red-50 transition-colors" onclick={resetToDefaults}>Reset to Defaults</button>
		</div>
		<div class="flex items-center gap-2 flex-wrap">
			<button type="button" class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors" onclick={() => (showPatternTypes = !showPatternTypes)}>
				{showPatternTypes ? 'Hide' : 'Manage'} Pattern Types
			</button>
			<button
				type="button"
				class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
				onclick={exportAll}
				title="Export every pattern type, its values and descriptions to a single JSON file"
			>Export all Pattern Types</button>
			<button
				type="button"
				class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
				onclick={importAll}
				title="Import a JSON file. Auto-detects whether it's an all-patterns bundle or a single-pattern bundle."
			>Import Patterns</button>
		</div>
		<div class="w-full border-t border-slate-200 pt-2 -mb-1">
			{#if editingPatternDesc}
				<textarea
					bind:value={editPatternDescValue}
					rows="2"
					class="w-full text-sm text-slate-600 px-2 py-1 border border-blue-400 rounded outline-none resize-none"
					onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); savePatternDesc(); } if (e.key === 'Escape') { editingPatternDesc = false; } }}
					onblur={() => { savePatternDesc(); }}
				></textarea>
			{:else}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<p
					class="text-sm text-slate-500 cursor-pointer hover:text-slate-700 transition-colors"
					onclick={() => { editPatternDescValue = localPatternDescs[selectedPattern] ?? ''; editingPatternDesc = true; }}
					title="Click to edit description"
				>{localPatternDescs[selectedPattern] || 'Click to add a description'}</p>
			{/if}
		</div>
	</div>

	{#if showPatternTypes}
		<div class="pattern-types-section">
			<h3>Pattern Types</h3>
			<div class="pt-chip-list">
				{#each localPatterns as p}
					{#if editingPatternTypeId === p.id}
						<div class="pt-edit-inline">
							<input type="text" bind:value={editPatternTypeName} class="pt-edit-input"
								onkeydown={(e) => { if (e.key === 'Enter') saveEditPatternType(); if (e.key === 'Escape') cancelEditPatternType(); }} />
							<label class="pt-multi-label">
								<input type="checkbox" bind:checked={editPatternTypeMultiSelect} />
								<span>Multi</span>
							</label>
							<button type="button" class="pt-edit-save" onclick={saveEditPatternType}>✓</button>
							<button type="button" class="pt-edit-cancel" onclick={cancelEditPatternType}>✕</button>
						</div>
					{:else}
						{@const isEnabled = p.enabled !== false}
						<span
							class="pt-chip {isEnabled ? '' : 'pt-chip-disabled'}"
							title="{p.id} · {p.multiSelect ? 'Multi-select' : 'Single-select'}{isEnabled ? '' : ' · Hidden from canvas'}"
						>
							{p.name}
							<span class="pt-chip-badge">{p.multiSelect ? 'M' : 'S'}</span>
							<button
								type="button"
								class="pt-chip-edit"
								onclick={() => startEditPatternType(p)}
								aria-label="Edit pattern type"
							>✎</button>
							<button
								type="button"
								class="pt-chip-trash"
								onclick={() => deletePatternType(p.id)}
								aria-label="Delete pattern type permanently"
								title="Delete permanently (use the toggle to hide instead)"
							>
								<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
									<path d="M10 11v6" />
									<path d="M14 11v6" />
									<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
								</svg>
							</button>
							<button
								type="button"
								role="switch"
								aria-checked={isEnabled}
								aria-label="Show on canvas"
								class="relative inline-flex items-center shrink-0 pl-1 pr-1 py-0.5 rounded-md hover:bg-slate-50 transition-colors"
								onclick={() => togglePatternType(p.id)}
								title={isEnabled ? 'Hide from canvas (reversible)' : 'Show on canvas'}
							>
								<span class="relative inline-block h-4 w-7 rounded-full transition-colors {isEnabled ? 'bg-blue-600' : 'bg-slate-300'}">
									<span class="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform {isEnabled ? 'translate-x-3' : 'translate-x-0'}"></span>
								</span>
							</button>
						</span>
					{/if}
				{/each}
			</div>
			<div class="pt-add">
				<input
					type="text"
					placeholder="New pattern type..."
					bind:value={newPatternName}
					onkeydown={(e) => e.key === 'Enter' && addPatternType()}
				/>
				<label class="pt-multi-label">
					<input type="checkbox" bind:checked={newPatternMultiSelect} />
					<span>Multi-select</span>
				</label>
				<button type="button" onclick={addPatternType}>Add</button>
			</div>
		</div>
	{/if}

	<div class="flex flex-col gap-6">
		<div class="values-section">
			{#if search}
				<h3>Search results for "{search}" <span class="text-sm font-normal text-slate-400">({globalSearchResults.length} match{globalSearchResults.length !== 1 ? 'es' : ''})</span></h3>

				<div class="values-list">
					{#each globalSearchResults as result}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="value-row cursor-pointer hover:bg-slate-50" onclick={() => navigateToValue(result.patternId, result.value)}>
							<div class="value-display">
								<span class="value-name">{result.value}</span>
								<span class="value-desc">{result.description || 'No description'}</span>
							</div>
							<span class="text-xs text-slate-400 whitespace-nowrap">{patternName(result.patternId)}</span>
						</div>
					{/each}
					{#if globalSearchResults.length === 0}
						<p class="empty">No matching values across any pattern type.</p>
					{/if}
				</div>
			{:else}
				<h3>Values for "{patternName(selectedPattern)}"</h3>

				<div class="add-form">
					<input
						type="text"
						placeholder="New value name"
						bind:value={newValue}
						onkeydown={(e) => e.key === 'Enter' && addValue()}
					/>
					<input
						type="text"
						placeholder="Description"
						bind:value={newDescription}
						onkeydown={(e) => e.key === 'Enter' && addValue()}
						class="desc-field"
					/>
					<button type="button" onclick={addValue}>Add</button>
				</div>

				<div class="values-list">
					{#each currentValues as value}
						<div class="value-row {highlightValue === value ? 'highlight' : ''}" data-value={value}>
							<div class="value-display">
								<span class="value-name">{value}</span>
								{#if editingValue === value}
									<textarea
										bind:value={editDescription}
										rows="2"
										onblur={saveEdit}
										onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { cancelEdit(); } }}
										class="value-desc-input"
									></textarea>
								{:else}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span
										class="value-desc clickable {currentDescriptions[value] ? '' : 'italic'}"
										onclick={() => startEdit(value)}
										title="Click to edit description"
									>{currentDescriptions[value] || 'Click to add a description'}</span>
								{/if}
							</div>
							<div class="value-actions">
								<button type="button" class="small danger" onclick={() => removeValue(value)}>Delete</button>
							</div>
						</div>
					{/each}
					{#if currentValues.length === 0}
						<p class="empty">No values defined for this pattern.</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if !selectedContractId}
		<div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
			No contract selected. Please select a contract to manage pattern overrides.
		</div>
	{/if}
</div>

<style>
	.admin {
		max-width: 100%;
		padding: 0 1rem;
	}

	.values-section h3 {
		font-size: 1rem;
		margin-bottom: 0.75rem;
	}

	.add-form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.add-form input {
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.375rem 0.5rem;
		border: 1px solid #dee2e6;
		border-radius: 4px;
	}

	.add-form input:first-child {
		width: 200px;
	}

	.add-form .desc-field {
		flex: 1;
		min-width: 200px;
	}

	.add-form button {
		padding: 0.375rem 1rem;
		font-size: 0.8125rem;
		border: 1px solid #0891b2;
		border-radius: 4px;
		background: #0891b2;
		color: white;
		cursor: pointer;
		font-family: inherit;
	}

	.values-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.value-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		transition: background-color 0.3s ease;
		padding: 0.625rem 0.75rem;
		border: 1px solid #dee2e6;
		border-bottom: none;
	}

	.value-row:first-child {
		border-radius: 6px 6px 0 0;
	}

	.value-row:last-child {
		border-bottom: 1px solid #dee2e6;
		border-radius: 0 0 6px 6px;
	}

	.value-row:only-child {
		border-radius: 6px;
		border-bottom: 1px solid #dee2e6;
	}

	.value-row.highlight {
		background-color: #eff6ff;
		border-color: #93c5fd;
	}

	.value-display {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
		min-width: 0;
	}

	.value-name {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.value-desc {
		color: #6c757d;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.value-desc.clickable {
		cursor: pointer;
		transition: color 0.15s;
	}

	.value-desc.clickable:hover {
		color: #334155;
	}

	.value-desc.italic {
		font-style: italic;
	}

	.value-desc-input {
		font: inherit;
		font-size: 0.75rem;
		line-height: 1.4;
		color: #6c757d;
		padding: 0.25rem 0.375rem;
		border: 1px solid #60a5fa;
		border-radius: 4px;
		resize: vertical;
		width: 100%;
		outline: none;
	}

	.value-actions {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	button.small {
		padding: 0.25rem 0.5rem;
		font-size: 0.6875rem;
		border: 1px solid #dee2e6;
		border-radius: 4px;
		background: white;
		cursor: pointer;
		font-family: inherit;
	}

	button.small:hover {
		background: #f8fafc;
	}

	button.small.danger:hover {
		background: #fee;
		border-color: #c00;
		color: #c00;
	}

	.empty {
		color: #6c757d;
		font-size: 0.8125rem;
		font-style: italic;
		padding: 1rem;
	}

	/* ── Manage Pattern Types ── */
	.pattern-types-section {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: #f8fafc;
		border-radius: 8px;
		border: 1px solid #dee2e6;
	}

	.pattern-types-section h3 {
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.pt-chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.pt-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		background: white;
		border: 1px solid #dee2e6;
		border-radius: 12px;
	}

	.pt-chip-badge {
		font-size: 0.5625rem;
		font-weight: 600;
		color: #6c757d;
		background: #f8fafc;
		border: 1px solid #dee2e6;
		border-radius: 3px;
		padding: 0 0.25rem;
		line-height: 1.4;
	}

	.pt-chip-edit {
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.75rem;
		color: #6c757d;
		padding: 0;
		line-height: 1;
	}

	.pt-chip-edit:hover {
		color: #0891b2;
	}

	.pt-chip-remove {
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.875rem;
		color: #6c757d;
		padding: 0;
		line-height: 1;
	}

	.pt-chip-remove:hover {
		color: #c00;
	}

	.pt-chip-disabled {
		opacity: 0.5;
	}

	.pt-chip-disabled .pt-chip-badge {
		background: transparent;
	}

	.pt-chip-trash {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0.125rem;
		color: #94a3b8; /* slate-400 */
		line-height: 1;
		border-radius: 4px;
		transition: color 0.15s, background-color 0.15s;
	}

	.pt-chip-trash:hover {
		color: #ef4444; /* red-500 */
		background: #fef2f2; /* red-50 */
	}

	.pt-edit-inline {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0.5rem;
		background: white;
		border: 1px solid #93c5fd;
		border-radius: 12px;
	}

	.pt-edit-input {
		font: inherit;
		font-size: 0.75rem;
		padding: 0.125rem 0.25rem;
		border: 1px solid #dee2e6;
		border-radius: 4px;
		width: 140px;
	}

	.pt-edit-save {
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.75rem;
		color: #0891b2;
		padding: 0;
		font-weight: 600;
	}

	.pt-edit-cancel {
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.75rem;
		color: #6c757d;
		padding: 0;
	}

	.pt-edit-cancel:hover {
		color: #c00;
	}

	.pt-add {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.pt-add input[type="text"] {
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid #dee2e6;
		border-radius: 4px;
		width: 180px;
	}

	.pt-add button {
		padding: 0.3rem 0.75rem;
		font-size: 0.8125rem;
		border: 1px solid #0891b2;
		border-radius: 4px;
		background: #0891b2;
		color: white;
		cursor: pointer;
		font-family: inherit;
	}

	.pt-multi-label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: #6c757d;
		cursor: pointer;
		white-space: nowrap;
	}

	.pt-multi-label input[type="checkbox"] {
		cursor: pointer;
	}
</style>
