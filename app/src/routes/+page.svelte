<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import {
		store,
		initStore,
		addItem,
		removeItem,
		updateItemName,
		updateItemProperties,
		updateMetadata,
		saveModel,
		newModel,
		deleteModel,
		renameModel,
		updateDescription,
		switchTo,
		importJSON,
		migrateModel,
		setPatternTypes,
		setPatternOverride,
		deletePatternOverride
	} from '$lib/stores/contract.svelte';
	import { contractToContextPlane, contextPlaneToContract } from '$lib/converters/context-plane';
	import { contractToRtf } from '$lib/converters/rtf';
	import { contractToHtml } from '$lib/converters/word';
	import { createStandaloneAdapter } from '$lib/adapters/standalone-adapter';
	import { getLanguage } from '$lib/languages';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import ContractLayout from '$lib/components/canvas/ContractLayout.svelte';
	import ContractAgreementView from '$lib/components/canvas/ContractAgreementView.svelte';
	import ContractExampleDataView from '$lib/components/canvas/ContractExampleDataView.svelte';
	import ContractPatternsTab from '$lib/components/canvas/ContractPatternsTab.svelte';
	import DictionaryTableView from '$lib/components/canvas/DictionaryTableView.svelte';

	let activeTab = $state<string>('contract');

	// Model management (Tier 1 — dark App Header)
	let showSwitcher = $state(false);
	let showNew = $state(false);
	let newModelName = $state('');

	function handleClickOutsideSwitcher(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-model-switcher]')) showSwitcher = false;
	}

	async function handleNew() {
		const name = newModelName.trim();
		if (!name) return;
		await newModel(name);
		newModelName = '';
		showNew = false;
	}

	async function handleDelete() {
		if (!confirm(`Delete "${store.model.name}"?`)) return;
		await deleteModel(store.model.id);
	}

	let orderSaveTimer: ReturnType<typeof setTimeout>;

	const adapter = createStandaloneAdapter({
		getModel: () => store.model,
		getSavedList: () => store.savedList,
		onUpdateNode: (id, updates) => {
			if (updates.name) {
				updateItemName(id, updates.name);
				// Persist the rename — without this, the model is dirty in
				// memory but never written to disk, so the change reverts on
				// page reload.
				clearTimeout(orderSaveTimer);
				orderSaveTimer = setTimeout(() => saveModel(), 300);
			}
			if (updates.properties && typeof updates.properties.order === 'number') {
				clearTimeout(orderSaveTimer);
				orderSaveTimer = setTimeout(() => saveModel(), 300);
			}
		},
		onCreateContract: async (name) => { await newModel(name); },
		onDeleteContract: async (id) => { await deleteModel(id); },
		onRenameContract: (name) => { renameModel(name); },
		onUpdateDescription: (desc) => { updateDescription(desc); },
		onAddItem: (entityLabel, name) => { addItem(entityLabel, name); },
		onRemoveItem: (entityLabel, itemId) => { removeItem(entityLabel, itemId); },
		onSwitchTo: async (id) => { await switchTo(id); },
		onUpdateItemProperties: (sourceId, updates) => {
			updateItemProperties(sourceId, updates);
			clearTimeout(orderSaveTimer);
			orderSaveTimer = setTimeout(() => saveModel(), 300);
		},
		onUpdateMetadata: (updates) => {
			updateMetadata(updates);
			clearTimeout(orderSaveTimer);
			orderSaveTimer = setTimeout(() => saveModel(), 300);
		},
		onSetPatternTypes: (types) => {
			setPatternTypes(types);
			clearTimeout(orderSaveTimer);
			orderSaveTimer = setTimeout(() => saveModel(), 300);
		},
		onSetPatternOverride: (patternId, override) => {
			setPatternOverride(patternId, override);
			clearTimeout(orderSaveTimer);
			orderSaveTimer = setTimeout(() => saveModel(), 300);
		},
		onDeletePatternOverride: (patternId) => {
			deletePatternOverride(patternId);
			clearTimeout(orderSaveTimer);
			orderSaveTimer = setTimeout(() => saveModel(), 300);
		}
	});
	setContext('dataAdapter', adapter);

	onMount(() => {
		initStore();
	});

	const snapshot = $derived(contractToContextPlane(store.model));

	// Scoped subgraph for the Dictionary tab — synthesise a global_data_asset node
	// from the contract's data asset and emit `contains_column` links so the
	// shared DictionaryTableView groups the contract's columns under a single
	// dataset row. Mirrors the approach CP uses in its model page for the
	// same tab so both versions render identically.
	const dictionarySubgraph = $derived.by(() => {
		const rootNode = snapshot.nodes.find((n) => n.label.includes('contract_model'));
		if (!rootNode) return { nodes: [] as typeof snapshot.nodes, links: [] as typeof snapshot.links };
		const assetLink = snapshot.links.find((l) => l.source_id === rootNode.id && l.label === 'has_data_asset');
		const assetNode = assetLink ? snapshot.nodes.find((n) => n.id === assetLink.destination_id) : null;
		const columnLinks = snapshot.links.filter((l) => l.source_id === rootNode.id && l.label === 'has_column');
		const columnIds = new Set(columnLinks.map((l) => l.destination_id));
		const columnNodes = snapshot.nodes.filter((n) => columnIds.has(n.id));
		if (!assetNode) return { nodes: columnNodes, links: [] as typeof snapshot.links };
		const synthDatasetId = `synth-contract-dataset-${assetNode.id}`;
		const synthDataset = { ...assetNode, id: synthDatasetId, label: 'global_data_asset' };
		const synthLinks = columnNodes.map((col) => ({
			id: `synth-contains-column-${col.id}`,
			model_id: assetNode.model_id,
			source_id: synthDatasetId,
			destination_id: col.id,
			label: 'contains_column',
			properties: null,
			created_at: '',
			updated_at: ''
		}));
		return { nodes: [synthDataset, ...columnNodes], links: synthLinks };
	});

	function handleSelectNode(_id: string) {
		// No-op in SA mode (no detail panel in this iteration)
	}

	function handleAddNode(entityLabel: string, name: string) {
		if (entityLabel === 'contract_model') newModel(name);
		else addItem(entityLabel, name);
	}

	function handleMetadataUpdate(updates: {
		status?: string;
		domain?: string;
		informationProduct?: string;
		tags?: string[];
		loadType?: string;
		dataWindow?: { type: 'rolling' | 'all'; value?: number; unit?: 'days' | 'weeks' | 'months' | 'years' };
	}) {
		updateMetadata(updates as Parameters<typeof updateMetadata>[0]);
		clearTimeout(orderSaveTimer);
		orderSaveTimer = setTimeout(() => saveModel(), 300);
	}

	function slugifyName(name: string): string {
		return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'export';
	}

	function exportTimestamp(): string {
		const d = new Date();
		const pad = (n: number) => n.toString().padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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

	function handleExportJson(contractName: string) {
		download(
			JSON.stringify(store.model, null, 2),
			`${slugifyName(contractName)}-data-contract-${exportTimestamp()}.json`,
			'application/json'
		);
	}

	function handleExportOdcs(contractName: string) {
		const bitol = getLanguage('bitol');
		if (!bitol) { alert('Bitol language module not found'); return; }
		try {
			// Build CP graph snapshot scoped to the current contract model
			const { nodes, links } = contractToContextPlane(store.model);
			const rootNode = nodes.find((n) => n.label.includes('contract_model'));
			const yaml = bitol.export({ nodes, links }, rootNode?.id);
			download(
				yaml,
				`${slugifyName(contractName)}-data-contract-${exportTimestamp()}.odcs.yaml`,
				'application/yaml'
			);
		} catch (e) {
			alert('ODCS export failed: ' + (e as Error).message);
		}
	}

	function handleExportRtf(contractName: string) {
		try {
			const rtf = contractToRtf(store.model);
			download(
				rtf,
				`${slugifyName(contractName)}-data-contract-${exportTimestamp()}.rtf`,
				'application/rtf'
			);
		} catch (e) {
			alert('RTF export failed: ' + (e as Error).message);
		}
	}

	function handleExportWord(contractName: string) {
		try {
			const html = contractToHtml(store.model);
			// Word opens .doc files that are actually HTML and renders them
			// with full inline styling. Using application/msword MIME so
			// Word is the default open-with handler on desktop.
			download(
				html,
				`${slugifyName(contractName)}-data-contract-${exportTimestamp()}.doc`,
				'application/msword'
			);
		} catch (e) {
			alert('Word export failed: ' + (e as Error).message);
		}
	}

	function handleExportPdf(contractName: string) {
		try {
			const html = contractToHtml(store.model);
			// Open in a new window and invoke print — user picks "Save as PDF"
			// in the browser print dialog. Zero runtime dep, uses the browser's
			// native PDF renderer which matches on-screen fidelity closely.
			const w = window.open('', '_blank', 'width=900,height=1100');
			if (!w) {
				alert('PDF export: could not open print window (pop-ups blocked?).');
				return;
			}
			w.document.open();
			w.document.write(html);
			w.document.close();
			// Give the browser a tick to lay out before printing
			const title = `${slugifyName(contractName)}-data-contract-${exportTimestamp()}`;
			w.document.title = title;
			setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 250);
		} catch (e) {
			alert('PDF export failed: ' + (e as Error).message);
		}
	}

	function handleExportOpenMetadata(contractName: string) {
		const om = getLanguage('openmetadata');
		if (!om) { alert('OpenMetadata language module not found'); return; }
		try {
			const { nodes, links } = contractToContextPlane(store.model);
			const rootNode = nodes.find((n) => n.label.includes('contract_model'));
			const jsonld = om.export({ nodes, links }, rootNode?.id);
			download(
				jsonld,
				`${slugifyName(contractName)}-data-contract-${exportTimestamp()}.openmetadata.jsonld`,
				'application/ld+json'
			);
		} catch (e) {
			alert('OpenMetadata export failed: ' + (e as Error).message);
		}
	}

	async function handleImport(): Promise<void> {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,.jsonld,.yaml,.yml';
		return new Promise<void>((resolve) => {
			input.onchange = async () => {
				const file = input.files?.[0];
				if (!file) { resolve(); return; }
				try {
					const text = await file.text();
					const lower = file.name.toLowerCase();
					const isYaml = lower.endsWith('.yaml') || lower.endsWith('.yml') || /^\s*apiVersion\s*:/.test(text);
					const isOpenMetadata = lower.endsWith('.jsonld') || lower.endsWith('.openmetadata.json') ||
						(text.includes('"@context"') && text.includes('"@type": "DataContract"'));

					if (isYaml) {
						const bitol = getLanguage('bitol');
						if (!bitol) throw new Error('Bitol language not registered');
						const graph = bitol.import(text);
						const nativeModel = contextPlaneToContract(graph);
						await importJSON(JSON.stringify(nativeModel));
					} else if (isOpenMetadata) {
						const om = getLanguage('openmetadata');
						if (!om) throw new Error('OpenMetadata language not registered');
						const graph = om.import(text);
						const nativeModel = contextPlaneToContract(graph);
						await importJSON(JSON.stringify(nativeModel));
					} else {
						// Native JSON or CP graph JSON
						const parsed = JSON.parse(text);
						if (parsed.nodes && parsed.links) {
							// CP graph format → convert to native
							const nativeModel = contextPlaneToContract(parsed);
							await importJSON(JSON.stringify(nativeModel));
						} else if (parsed.id && parsed.name) {
							// Native format (any version) — migration handles v1.0 → v2.0
							await importJSON(JSON.stringify(migrateModel(parsed)));
						} else {
							throw new Error('Unrecognised JSON structure');
						}
					}
				} catch (e) {
					alert('Could not import file: ' + (e as Error).message);
				}
				resolve();
			};
			input.click();
		});
	}
</script>

<svelte:window onclick={handleClickOutsideSwitcher} />

<!-- Tier 1: Dark App Header (§ Three-Tier Header Pattern) -->
<header class="bg-slate-900 text-white px-6 py-3 shrink-0">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-lg font-bold tracking-tight">Data Contract</h1>
			<p class="text-xs text-slate-400 mt-0.5">Define data contracts for your data assets</p>
		</div>
		<div class="flex items-center gap-2" data-model-switcher>
			<div class="relative">
				<button
					onclick={() => (showSwitcher = !showSwitcher)}
					class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-800 text-sm"
				>
					<span class="text-slate-300">{store.model.name}</span>
					<svg class="w-3.5 h-3.5 text-slate-400 transition-transform {showSwitcher ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if showSwitcher}
					<div class="absolute top-full right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1 min-w-[200px]">
						{#each store.savedList as item}
							<button
								onclick={() => { switchTo(item.id); showSwitcher = false; }}
								class="w-full text-left px-4 py-2 text-sm transition-colors {item.id === store.model.id ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-600 hover:bg-slate-50'}"
							>{item.name}</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if showNew}
				<input type="text" placeholder="Contract name..." bind:value={newModelName} onkeydown={(e) => e.key === 'Enter' && handleNew()} class="px-3 py-1.5 border border-slate-600 bg-slate-800 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-40 placeholder-slate-500" />
				<button onclick={handleNew} class="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors">Create</button>
				<button onclick={() => { showNew = false; newModelName = ''; }} class="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
			{:else}
				<button onclick={() => (showNew = true)} class="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-300 border border-slate-600 hover:bg-slate-800 transition-colors">New Contract</button>
				<!-- Import sits next to New Contract because Import IS a creation
				     action — it always lands as a brand-new contract alongside
				     the existing ones, never overwriting the current model.
				     The existing store.importJSON() handles this: it slugifies
				     the imported name against existing IDs (collisions append
				     "-2", "-3"…) and calls apiCreateModel, not an update. -->
				<button
					onclick={handleImport}
					class="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-300 border border-slate-600 hover:bg-slate-800 transition-colors"
					title="Import a JSON / YAML / JSON-LD contract file as a new contract"
				>Import</button>
			{/if}
			<button onclick={handleDelete} class="px-3 py-1.5 text-sm font-medium rounded-lg text-red-400 border border-slate-600 hover:bg-slate-800 transition-colors">Delete</button>
		</div>
	</div>
</header>

{#if store.loaded}
	<!-- Tier 2 + Tier 3 via Toolbar component (§ SA Standalone Toolbar) -->
	<div class="px-6 py-3 border-b border-slate-200 bg-white shrink-0">
		<Toolbar
			bind:activeTab
			onExportOdcs={() => handleExportOdcs(store.model.name)}
			onExportRtf={() => handleExportRtf(store.model.name)}
			onExportWord={() => handleExportWord(store.model.name)}
			onExportPdf={() => handleExportPdf(store.model.name)}
			onExportOpenMetadata={() => handleExportOpenMetadata(store.model.name)}
		/>
	</div>
	<!-- Canvas content: ContractLayout (contract tab), ContractAgreementView (agreement tab),
	     or ContractExampleDataView (example-data tab). SA routes tabs from its external
	     Toolbar component; ContractLayout is hidden behind showTabs={false} in SA mode. -->
	<div class="flex-1 overflow-hidden flex flex-col">
		{#if activeTab === 'agreement'}
			<ContractAgreementView nodes={snapshot.nodes} links={snapshot.links} />
		{:else if activeTab === 'dictionary'}
			<DictionaryTableView nodes={dictionarySubgraph.nodes} links={dictionarySubgraph.links} editable />
		{:else if activeTab === 'example-data'}
			<ContractExampleDataView
				nodes={snapshot.nodes}
				links={snapshot.links}
				onUpdate={(next) => { updateMetadata({ exampleData: next }); clearTimeout(orderSaveTimer); orderSaveTimer = setTimeout(() => saveModel(), 300); }}
			/>
		{:else if activeTab === 'patterns'}
			<div class="flex-1 overflow-auto py-4">
				<ContractPatternsTab
					nodes={snapshot.nodes}
					links={snapshot.links}
					selectedContractId={snapshot.nodes.find((n) => n.label.includes('contract_model'))?.id ?? null}
				/>
			</div>
		{:else}
			<ContractLayout
				nodes={snapshot.nodes}
				links={snapshot.links}
				onSelectNode={handleSelectNode}
				onAddNode={handleAddNode}
				onMetadataUpdate={handleMetadataUpdate}
				showSwitcher={false}
				showToolbar={false}
				showTabs={false}
			/>
		{/if}
	</div>
{:else}
	<div class="flex items-center justify-center h-64 text-slate-400 text-sm">Loading models...</div>
{/if}
