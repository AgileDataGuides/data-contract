<script lang="ts">
	import CanvasSection from '$lib/components/canvas/CanvasSection.svelte';
	import CanvasAreaShell from '$lib/components/canvas/CanvasAreaShell.svelte';
	import ContractAgreementView from './ContractAgreementView.svelte';
	import ContractExampleDataView from './ContractExampleDataView.svelte';
	import ContractPatternsTab from './ContractPatternsTab.svelte';
	import PatternValueDropdown from './PatternValueDropdown.svelte';
	import type { ContextNode, ContextLink } from '$lib/cp-shared';
	import type { DataAdapter } from '$lib/cp-shared';
	import type { ExampleDataRow } from '../../types';
	import { getNodeLabels } from '$lib/cp-shared';
	import { listDeliveryTypeLabels } from '$lib/shared-data/delivery-types';
	import { getPattern, getPatternValues } from '$lib/shared-data/patterns';
	import { getContext, type Snippet } from 'svelte';

	// Predefined labels for the Delivery / Infrastructure CanvasSection's
	// "+ Add" datalist. When the user picks one, the label becomes the new
	// delivery type's name; the store resolves it back to a catalog key via
	// getDeliveryTypeByLabel() and stores `typeKey` on the node properties.
	const deliveryTypeLabels = listDeliveryTypeLabels();

	let {
		nodes,
		links = [],
		onSelectNode,
		onAddNode,
		onAddExisting,
		onExportJson,
		onImportJson,
		onExportOdcs,
		onExportOms,
		onExportRtf,
		onExportWord,
		onExportPdf,
		onMetadataUpdate,
		showSwitcher = true,
		showToolbar = true,
		showTabs = true,
		controlledModelId,
		onModelListChange,
		activeTab = 'contract',
		onTabChange,
		tabs = [{ id: 'contract', label: 'Contract' }],
		contentSlots
	}: {
		nodes: ContextNode[];
		links?: ContextLink[];
		onSelectNode: (id: string) => void;
		onAddNode: (entityLabel: string, name: string) => void;
		onAddExisting?: (entityLabel: string) => void;
		onExportJson?: (contractName: string) => void;
		onImportJson?: () => Promise<void>;
		onExportOdcs?: (contractName: string) => void;
		onExportOms?: (contractName: string) => void;
		onExportRtf?: (contractName: string) => void;
		onExportWord?: (contractName: string) => void;
		onExportPdf?: (contractName: string) => void;
		onMetadataUpdate?: (updates: {
			status?: string[];
			domain?: string;
			informationProduct?: string;
			tags?: string[];
			changeDetection?: string[];
			retentionPeriod?: string[];
			historyWindow?: string[];
			exampleData?: ExampleDataRow[];
		}) => void;
		showSwitcher?: boolean;
		showToolbar?: boolean;
		showTabs?: boolean;
		controlledModelId?: string | null;
		onModelListChange?: (models: { id: string; name: string }[], selectedId: string | null) => void;
		activeTab?: string;
		onTabChange?: (tab: string) => void;
		tabs?: Array<{ id: string; label: string }>;
		/**
		 * Optional per-tab content overrides. ContractLayout natively handles
		 * the `contract` and `agreement` tabs; any other tab id is rendered
		 * from a matching snippet here. Keeps cross-package dependencies out
		 * of this file (e.g. the `dictionary` tab's view is passed in from CP).
		 */
		contentSlots?: Record<string, Snippet>;
	} = $props();

	let importing = $state(false);

	const adapter = getContext<DataAdapter>('dataAdapter');

	// ── Derived: contract model nodes ──
	const contractNodes = $derived(nodes.filter((n) => getNodeLabels(n).includes('contract_model')));
	let selectedContractId = $state<string | null>(null);

	// Auto-select first contract (or controlled ID)
	$effect(() => {
		if (controlledModelId !== undefined && controlledModelId !== null) {
			selectedContractId = controlledModelId;
		} else if (contractNodes.length > 0 && (!selectedContractId || !contractNodes.find((n) => n.id === selectedContractId))) {
			selectedContractId = contractNodes[0].id;
		}
	});

	// Notify parent of model list changes
	$effect(() => {
		if (onModelListChange) {
			const models = contractNodes.map((n) => ({ id: n.id, name: n.name }));
			onModelListChange(models, selectedContractId);
		}
	});

	const selectedContract = $derived(contractNodes.find((n) => n.id === selectedContractId) ?? null);

	// Get nodes linked FROM the selected contract via relationship links
	const contractLinks = $derived(
		selectedContractId
			? links.filter((l) => l.source_id === selectedContractId)
			: []
	);
	const contractLinkedIds = $derived(new Set(contractLinks.map((l) => l.destination_id)));

	// All nodes grouped by label
	const byLabel = $derived.by(() => {
		const map: Record<string, ContextNode[]> = {};
		for (const node of nodes) {
			for (const label of getNodeLabels(node)) {
				if (!map[label]) map[label] = [];
				map[label].push(node);
			}
		}
		return map;
	});

	const get = (label: string) => byLabel[label] || [];

	// Scoped nodes: only those linked from the selected contract
	function getScoped(label: string): ContextNode[] {
		const all = get(label);
		if (contractNodes.length === 0) return all;
		return all.filter((n) => contractLinkedIds.has(n.id));
	}

	// Linked-entity metadata — each of these is resolved from a singular contract →
	// X relationship. Render via CanvasSection with maxItems={1}, matching the IPC
	// Name / Product Owner / T-Shirt Size pattern.
	const assetNode = $derived.by(() => {
		const assetLink = contractLinks.find((l) => l.label === 'has_data_asset');
		return assetLink ? nodes.find((n) => n.id === assetLink.destination_id) : null;
	});
	const domainNode = $derived.by(() => {
		const domainLink = contractLinks.find((l) => l.label === 'has_domain');
		return domainLink ? nodes.find((n) => n.id === domainLink.destination_id) : null;
	});
	const informationProductNode = $derived.by(() => {
		const ipLink = contractLinks.find((l) => l.label === 'has_information_product');
		return ipLink ? nodes.find((n) => n.id === ipLink.destination_id) : null;
	});

	const lineageNodes = $derived.by(() => {
		if (!assetNode) return [];
		// Includes legacy labels (sourced_from / enriched_by / feeds_into) + PROV-O
		// predicates (was_derived_from / was_generated_by / used / was_informed_by /
		// was_associated_with / was_attributed_to). Any node connected to the
		// contract's data asset via one of these shows up in the Lineage section.
		const lineageLabels = new Set([
			'sourced_from', 'enriched_by', 'feeds_into',
			'was_derived_from', 'was_generated_by', 'used',
			'was_informed_by', 'was_associated_with', 'was_attributed_to'
		]);
		const lineageNodeIds = new Set<string>();
		for (const link of links) {
			if (lineageLabels.has(link.label)) {
				if (link.source_id === assetNode.id) lineageNodeIds.add(link.destination_id);
				if (link.destination_id === assetNode.id) lineageNodeIds.add(link.source_id);
			}
		}
		return nodes.filter((n) => lineageNodeIds.has(n.id));
	});

	// ── Switcher state ──
	let showSwitcherDropdown = $state(false);
	let showNew = $state(false);
	let newContractName = $state('');

	function handleClickOutsideSwitcher(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-model-switcher]')) showSwitcherDropdown = false;
	}

	async function handleNew() {
		const name = newContractName.trim();
		if (!name) return;
		onAddNode('contract_model', name);
		newContractName = '';
		showNew = false;
	}

	async function handleDelete() {
		if (!selectedContract) return;
		if (!confirm(`Delete "${selectedContract.name}"?`)) return;
		if (adapter) await adapter.deleteNode(selectedContract.id);
	}

	async function handleExport() {
		if (onExportJson && selectedContract) {
			onExportJson(selectedContract.name);
		}
	}

	async function handleImport() {
		if (onImportJson) {
			importing = true;
			try { await onImportJson(); } finally { importing = false; }
		}
	}

	// Editable name/description
	let editingName = $state(false);
	let editingDesc = $state(false);
	let editName = $state('');
	let editDesc = $state('');

	function startEditName() {
		if (!selectedContract) return;
		editName = selectedContract.name;
		editingName = true;
	}

	async function saveName() {
		if (!selectedContract || !editName.trim()) { editingName = false; return; }
		await adapter.updateNode(selectedContract.id, { name: editName.trim() });
		editingName = false;
	}

	function startEditDesc() {
		if (!selectedContract) return;
		editDesc = selectedContract.description || '';
		editingDesc = true;
	}

	async function saveDesc() {
		if (!selectedContract) { editingDesc = false; return; }
		await adapter.updateNode(selectedContract.id, { description: editDesc.trim() });
		editingDesc = false;
	}

	// Data Asset area behaves like IPC's Name area — a standard CanvasSection
	// with maxItems={1}. The `+` button creates a new asset (parent auto-creates
	// the `has_data_asset` link via CONTRACT_RELATIONSHIPS in CP or via addItem's
	// singular mapping in SA); `onAddExisting` opens the existing-node picker.
	// To swap, remove the current asset (X on its card) then add or pick a new
	// one. The assetNode derivation above is still used by the lineage grid.

	// ── Status — pattern-driven dropdown ──
	// Status was a hardcoded 7-stage cycling chip with progression-coloured
	// stages. It is now driven by the shared `status` pattern (Title Case
	// labels) using the same PatternValueDropdown UX as the other pattern-
	// linked fields. Progression colours are no longer chip-specific — the
	// deterministic 8-way palette in PatternValueDropdown handles every value
	// uniformly. To recolour by stage, customise the values via the Manage
	// Patterns tab; the new chip colour follows the value name.
	const STATUS_PATTERN_ID = 'status';

	// Domain and Information Product are now linked graph nodes (global_domain /
	// global_info_product) via has_domain / has_information_product — handled by
	// the CanvasSection + domainNode / informationProductNode derivations above.
	// Tags state removed from the canvas UI — the `tags` property remains on the
	// ContractModel type + converter + RTF/Word exports for backward compat, but
	// the canvas no longer exposes a tag editor.

	// ── Pattern-driven dropdown areas (Change Detection / Retention Period / History Window) ──
	// All three use the same PatternValueDropdown component — a Tailwind port of the
	// Checklist's CellDropdown, with the same selection process: click the trigger to
	// open a panel with a search input + options listing each value's label + description
	// (from the shared patterns dictionary). `multiSelect: true` patterns render
	// checkboxes; `multiSelect: false` renders radios that close the panel on pick.
	// See DESIGN_SYSTEM.md § Pattern-Driven Chip.
	const CHANGE_DETECTION_PATTERN_ID = 'change-detection';
	const RETENTION_PERIOD_PATTERN_ID = 'default-retention-period';
	const HISTORY_WINDOW_PATTERN_ID = 'history-window';

	/**
	 * Resolved values for a pattern, scoped to the selected contract:
	 *   1. If there's a `has_pattern_override → contract_pattern` node for this patternId
	 *      with a non-empty `lookupValues`, use those.
	 *   2. Otherwise fall back to the shared catalog default from getPatternValues().
	 */
	function patternValuesFor(patternId: string): string[] {
		if (!selectedContract) return getPatternValues(patternId);
		const overrideLinks = links.filter(
			(l) => l.label === 'has_pattern_override' && l.source_id === selectedContract.id
		);
		const overrideIds = new Set(overrideLinks.map((l) => l.destination_id));
		const override = nodes.find(
			(n) =>
				overrideIds.has(n.id) &&
				getNodeLabels(n).includes('contract_pattern') &&
				(n.properties as Record<string, unknown>)?.patternId === patternId
		);
		const vals = (override?.properties as Record<string, unknown> | undefined)?.lookupValues;
		if (Array.isArray(vals) && vals.length > 0) return vals as string[];
		return getPatternValues(patternId);
	}

	function patternMultiSelect(patternId: string): boolean {
		return getPattern(patternId)?.multiSelect ?? false;
	}

	// Current-value derivations (sourced from the contract_model node's properties).
	// All three are string arrays — empty array means "not set".
	function toStringArray(raw: unknown): string[] {
		if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
		if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
		return [];
	}
	const selectedStatus = $derived(toStringArray(selectedContract?.properties?.status));
	const selectedChangeDetection = $derived(
		toStringArray(selectedContract?.properties?.changeDetection)
	);
	const selectedRetentionPeriod = $derived(
		toStringArray(selectedContract?.properties?.retentionPeriod)
	);
	const selectedHistoryWindow = $derived(
		toStringArray(selectedContract?.properties?.historyWindow)
	);

	async function handleExportOdcs() {
		if (onExportOdcs && selectedContract) {
			onExportOdcs(selectedContract.name);
		}
	}

	async function handleExportOms() {
		if (onExportOms && selectedContract) {
			onExportOms(selectedContract.name);
		}
	}

	async function handleExportRtf() {
		if (onExportRtf && selectedContract) {
			onExportRtf(selectedContract.name);
		}
	}

	async function handleExportWord() {
		if (onExportWord && selectedContract) {
			onExportWord(selectedContract.name);
		}
	}

	async function handleExportPdf() {
		if (onExportPdf && selectedContract) {
			onExportPdf(selectedContract.name);
		}
	}

	// Section colors — aligned to entity type colors from DESIGN_SYSTEM.md § 7
	// Cyan-600 for assets (data asset)
	// Orange-500 for detail (personas, delivery, team)
	// Blue-600 for schema (columns)
	// Green-600 for glossary terms
	// Violet-600 for governance (Trust Rules, Data Sync)
	// Indigo-500 for lineage
	const COLORS = {
		dataAsset: '#0891b2',
		// Metadata-row areas (see § Contract Metadata Row in DESIGN_SYSTEM.md):
		// Linked-entity metadata keeps its own entity colour (Data Asset = cyan-600,
		// Information Product = sky-500). Property-only metadata uses a neutral slate
		// so the chip / value inside carries the visual meaning (e.g. the Status chip
		// already uses the 7-stage OMS lifecycle palette — the card frame stays calm).
		informationProduct: '#0ea5e9',
		metadata: '#64748b',
		team: '#f97316',
		personas: '#f97316',
		columns: '#2563eb',
		glossaryTerms: '#16a34a',
		deliveryTypes: '#f97316',
		dataSyncs: '#7c3aed',
		trustRules: '#7c3aed',
		lineage: '#6366f1'
	};
</script>

<svelte:window onclick={handleClickOutsideSwitcher} />

<div class="flex flex-col h-full">
	<!-- Tier 1: Contract Switcher -->
	{#if showSwitcher}
		<div class="bg-slate-900 text-white px-6 py-3 shrink-0">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-lg font-bold tracking-tight">Data Contract</h1>
					<p class="text-xs text-slate-400 mt-0.5">Define data contracts for your data assets</p>
				</div>
				<div class="flex items-center gap-2" data-model-switcher>
					<div class="relative">
						<button
							onclick={() => (showSwitcherDropdown = !showSwitcherDropdown)}
							class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-800 text-sm"
						>
							<span class="text-slate-300">{selectedContract?.name ?? 'No contract'}</span>
							<svg class="w-3.5 h-3.5 text-slate-400 transition-transform {showSwitcherDropdown ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						{#if showSwitcherDropdown}
							<div class="absolute top-full right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1 min-w-[200px]">
								{#each contractNodes as item}
									<button
										onclick={() => { selectedContractId = item.id; showSwitcherDropdown = false; }}
										class="w-full text-left px-4 py-2 text-sm transition-colors {item.id === selectedContractId ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-600 hover:bg-slate-50'}"
									>{item.name}</button>
								{/each}
							</div>
						{/if}
					</div>
					{#if showNew}
						<input type="text" placeholder="Contract name..." bind:value={newContractName} onkeydown={(e) => e.key === 'Enter' && handleNew()} class="px-3 py-1.5 border border-slate-600 bg-slate-800 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-40 placeholder-slate-500" />
						<button onclick={handleNew} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors">Create</button>
						<button onclick={() => { showNew = false; newContractName = ''; }} class="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
					{:else}
						<button onclick={() => (showNew = true)} class="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-300 border border-slate-600 hover:bg-slate-800 transition-colors">New Contract</button>
					{/if}
					<button onclick={handleDelete} class="px-3 py-1.5 text-sm font-medium rounded-lg text-red-400 border border-slate-600 hover:bg-slate-800 transition-colors">Delete</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tier 2: Name/Description + Export/Import (§ Tier 2 — card pattern, click-to-edit) -->
	{#if selectedContract && showToolbar}
		<div class="px-4 pt-3 shrink-0">
			<div class="bg-white border border-slate-200 rounded-lg">
				<div class="flex items-center justify-between px-4 py-2.5">
					<div class="flex items-center gap-3 min-w-0">
						<div class="min-w-0">
							{#if editingName}
								<input type="text" bind:value={editName} onblur={saveName} onkeydown={(e) => e.key === 'Enter' && saveName()} class="text-sm font-semibold text-slate-800 px-1 border border-blue-400 rounded outline-none w-64" />
							{:else}
								<button class="text-sm font-semibold text-slate-800 leading-tight cursor-pointer hover:text-slate-600 transition-colors text-left truncate max-w-md" onclick={startEditName} title="Click to edit name">{selectedContract.name}</button>
							{/if}
							{#if editingDesc}
								<input type="text" bind:value={editDesc} onblur={saveDesc} onkeydown={(e) => e.key === 'Enter' && saveDesc()} placeholder="Add a description..." class="text-[10px] text-slate-500 px-1 border border-blue-400 rounded outline-none w-full mt-0.5" />
							{:else}
								<button class="block text-[10px] leading-tight mt-0.5 truncate max-w-md text-left cursor-pointer transition-colors {selectedContract.description ? 'text-slate-400 hover:text-slate-600' : 'text-slate-300 italic hover:text-slate-500'}" onclick={startEditDesc} title="Click to edit description">{selectedContract.description || 'Click to add a description'}</button>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2 shrink-0">
						<button onclick={handleExport} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors">Export JSON</button>
						{#if onExportOdcs}
							<button onclick={handleExportOdcs} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-teal-600 border border-teal-300 hover:bg-teal-50 transition-colors">Export ODCS</button>
						{/if}
						{#if onExportOms}
							<button onclick={handleExportOms} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-teal-600 border border-teal-300 hover:bg-teal-50 transition-colors" title="Export as OpenMetadata JSON-LD">Export OMS</button>
						{/if}
						{#if onExportRtf}
							<button onclick={handleExportRtf} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-teal-600 border border-teal-300 hover:bg-teal-50 transition-colors" title="Export as RTF (opens in Word / Pages / TextEdit)">Export RTF</button>
						{/if}
						{#if onExportWord}
							<button onclick={handleExportWord} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-teal-600 border border-teal-300 hover:bg-teal-50 transition-colors" title="Export as Word document (.doc)">Export Word</button>
						{/if}
						{#if onExportPdf}
							<button onclick={handleExportPdf} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-teal-600 border border-teal-300 hover:bg-teal-50 transition-colors" title="Export as PDF (opens browser print dialog — pick Save as PDF)">Export PDF</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tier 3: Tabs (§ Tier 3 — blue-600 active, slate-400 inactive).
	     Rendered BEFORE Tier 2b so the user's mental model is: "which tab am
	     I on?" first, then "what's the state of this contract?" right next
	     to the content they're about to edit. No `mb-3` — the strip below
	     provides the visual separation from content. -->
	{#if showTabs}
		<div class="flex gap-0 px-4 border-b border-slate-200">
			{#each tabs as tab}
				<button
					class="flex items-center px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors {activeTab === tab.id ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}"
					onclick={() => onTabChange?.(tab.id)}
				>{tab.label}</button>
			{/each}
		</div>
	{/if}

	<!-- Content: based on activeTab.
	     Native tabs: `contract` (2x4 grid), `agreement` (ContractAgreementView),
	     `example-data` (ContractExampleDataView), `patterns` (ContractPatternsTab
	     — same design grammar as the Checklist's Manage Patterns tab).
	     Any other tab id is rendered from `contentSlots[tabId]` if supplied —
	     that's how CP wires in the Dictionary tab without ContractLayout needing
	     to import from the data-dictionary package (horizontal-dep-free).
	     The contract's single data asset is surfaced in the Tier 2 subtitle
	     ("Data Asset: <name>") above, so it is no longer a grid section. -->
	{#if selectedContract && activeTab && activeTab !== 'contract' && activeTab !== 'agreement' && activeTab !== 'example-data' && activeTab !== 'patterns' && contentSlots?.[activeTab]}
		{@render contentSlots[activeTab]()}
	{:else if selectedContract && activeTab === 'agreement'}
		<ContractAgreementView {nodes} {links} />
	{:else if selectedContract && activeTab === 'example-data'}
		<ContractExampleDataView
			{nodes}
			{links}
			onUpdate={(next) => onMetadataUpdate?.({ exampleData: next })}
		/>
	{:else if selectedContract && activeTab === 'patterns'}
		<div class="flex-1 overflow-auto py-4">
			<ContractPatternsTab {nodes} links={links ?? []} selectedContractId={selectedContract.id} />
		</div>
	{:else if selectedContract}
		<div class="flex-1 overflow-auto p-4">
			<!-- 4-column grid. Rows 0-1 = Contract Metadata areas (auto height);
			     Rows 2-3 = main Contract grid (1fr each). Metadata lives as
			     first-class canvas areas — matches the IPC treatment of
			     Name / Product Owner / T-Shirt Size. Linked-entity metadata
			     (Data Asset, Information Product) carries its own entity
			     colour; property-only metadata (Status, Domain, Load Type,
			     Data Window, Tags) uses the neutral metadata slate so the
			     chip inside carries the visual meaning. -->
			<div class="grid grid-cols-4 gap-4 h-full" style="grid-template-rows: minmax(90px,auto) minmax(90px,auto) minmax(200px,1fr) minmax(200px,1fr);">

				<!-- Row 0 Metadata: Data Asset | Status | Domain | Information Product -->
				<!-- Data Asset — behaves exactly like IPC's Name area: a CanvasSection
				     with maxItems={1}. Clicking `+` lets users add a new Data Asset (the
				     parent auto-creates the `has_data_asset` link); `onAddExisting` lets
				     them pick an existing asset from anywhere in the Business Model. To
				     swap the current asset, click X on its card to remove, then add or
				     pick a new one. Same UX as Name / Product Owner / T-Shirt Size on IPC. -->
				<CanvasSection title="Data Asset" entityLabel="global_data_asset" nodes={assetNode ? [assetNode] : []} color={COLORS.dataAsset} maxItems={1} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />

				<!-- Status — pattern-driven dropdown sourced from the shared `status` pattern.
				     Same selection UX as the three Row 1 chips (Change Detection / Retention
				     Period / History Window). multiSelect: false → radio + auto-close. -->
				<CanvasAreaShell title="Status" color={COLORS.metadata}>
					{#if onMetadataUpdate}
						<PatternValueDropdown
							patternId={STATUS_PATTERN_ID}
							options={patternValuesFor(STATUS_PATTERN_ID)}
							selected={selectedStatus}
							multiSelect={patternMultiSelect(STATUS_PATTERN_ID)}
							onchange={(values) => onMetadataUpdate?.({ status: values })}
						/>
					{/if}
				</CanvasAreaShell>

				<!-- Domain — linked global_domain node (cross-canvas with Concept Model).
				     CanvasSection + maxItems={1}, IPC-style UX. Parent wires the
				     has_domain link via CONTRACT_RELATIONSHIPS (CP) / singular
				     LABEL_TO_FIELD (SA). -->
				<CanvasSection title="Domain" entityLabel="global_domain" nodes={domainNode ? [domainNode] : []} color={COLORS.metadata} maxItems={1} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />

				<!-- Information Product — linked global_info_product node (cross-canvas
				     with IPC). CanvasSection + maxItems={1}. Parent wires the
				     has_information_product link. -->
				<CanvasSection title="Information Product" entityLabel="global_info_product" nodes={informationProductNode ? [informationProductNode] : []} color={COLORS.informationProduct} maxItems={1} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />

				<!-- Row 1 Metadata: 3 pattern-driven dropdown areas. Same selection UX as
				     the Checklist's pattern cells — click opens a panel with filter input +
				     checkbox (multiSelect) or radio (single-select) options, each showing
				     label + description from the shared patterns dictionary. Values come
				     from the corresponding shared pattern (change-detection /
				     default-retention-period / history-window), with per-contract overrides
				     via the Manage Patterns tab.
				     Layout: Change Detection (col-span-1) | Retention Period (col-span-2)
				     | History Window (col-span-1) — Retention Period gets the extra width
				     for its long labels. -->
				<CanvasAreaShell title="Change Detection" color={COLORS.metadata}>
					{#if onMetadataUpdate}
						<PatternValueDropdown
							patternId={CHANGE_DETECTION_PATTERN_ID}
							options={patternValuesFor(CHANGE_DETECTION_PATTERN_ID)}
							selected={selectedChangeDetection}
							multiSelect={patternMultiSelect(CHANGE_DETECTION_PATTERN_ID)}
							onchange={(values) => onMetadataUpdate?.({ changeDetection: values })}
						/>
					{/if}
				</CanvasAreaShell>

				<div class="col-span-2">
					<CanvasAreaShell title="Retention Period" color={COLORS.metadata}>
						{#if onMetadataUpdate}
							<PatternValueDropdown
								patternId={RETENTION_PERIOD_PATTERN_ID}
								options={patternValuesFor(RETENTION_PERIOD_PATTERN_ID)}
								selected={selectedRetentionPeriod}
								multiSelect={patternMultiSelect(RETENTION_PERIOD_PATTERN_ID)}
								onchange={(values) => onMetadataUpdate?.({ retentionPeriod: values })}
							/>
						{/if}
					</CanvasAreaShell>
				</div>

				<CanvasAreaShell title="History Window" color={COLORS.metadata}>
					{#if onMetadataUpdate}
						<PatternValueDropdown
							patternId={HISTORY_WINDOW_PATTERN_ID}
							options={patternValuesFor(HISTORY_WINDOW_PATTERN_ID)}
							selected={selectedHistoryWindow}
							multiSelect={patternMultiSelect(HISTORY_WINDOW_PATTERN_ID)}
							onchange={(values) => onMetadataUpdate?.({ historyWindow: values })}
						/>
					{/if}
				</CanvasAreaShell>

				<!-- Row 2 Main: Schema / Columns | Trust Rules | Data Sync | Glossary Terms -->
				<!-- Schema / Columns — cards intentionally name-only (hideBadges). Full column
				     metadata (data type, PK/UNIQUE/REQ/classification) is surfaced in the detail
				     popup and in the Agreement view, keeping the Contract grid uncluttered. -->
				<CanvasSection title="Schema / Columns" entityLabel="dict_column" nodes={getScoped('dict_column')} color={COLORS.columns} hideBadges {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
				<CanvasSection title="Trust Rules" entityLabel="global_policy" nodes={getScoped('global_policy')} color={COLORS.trustRules} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
				<CanvasSection title="Data Sync" entityLabel="global_data_sync" nodes={getScoped('global_data_sync')} color={COLORS.dataSyncs} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
				<CanvasSection title="Glossary Terms" entityLabel="global_glossary_term" nodes={getScoped('global_glossary_term')} color={COLORS.glossaryTerms} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />

				<!-- Row 3 Main: Team | Personas | Delivery / Infrastructure | Lineage -->
				<CanvasSection title="Team" entityLabel="global_publisher" nodes={getScoped('global_publisher')} color={COLORS.team} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
				<CanvasSection title="Personas" entityLabel="global_persona" nodes={getScoped('global_persona')} color={COLORS.personas} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
				<!-- Delivery / Infrastructure — catalog-driven (packages/shared/data/delivery-types.json).
				     The "+" input shows a datalist of predefined last-mile tools / warehouses /
				     object stores / streaming platforms / protocols. Users can pick one or type
				     their own; the store resolves the label to a catalog typeKey for round-tripping
				     through the Bitol (ODCS) language. -->
				<CanvasSection title="Delivery / Infrastructure" entityLabel="global_delivery_type" nodes={getScoped('global_delivery_type')} color={COLORS.deliveryTypes} addSuggestions={deliveryTypeLabels} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
				<CanvasSection title="Lineage" entityLabel="global_data_asset" nodes={lineageNodes} color={COLORS.lineage} {onSelectNode} {onAddNode} onAddExisting={onAddExisting} />
			</div>
		</div>
	{:else}
		<div class="flex-1 flex items-center justify-center text-slate-400 text-sm">
			{contractNodes.length === 0 ? 'Create a data contract to get started' : 'Select a data contract'}
		</div>
	{/if}
</div>
