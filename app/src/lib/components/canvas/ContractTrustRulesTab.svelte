<script lang="ts">
	/**
	 * ContractTrustRulesTab — full CRUD UI for the contract's Trust Rule catalog.
	 *
	 * Direct parallel to ChecklistPoliciesTab on the Layered Data Architecture
	 * Checklist. Trust Rules are the AgileData term for what Bitol/ODCS calls a
	 * "quality" rule and what OpenMetadata calls a "quality expectation".
	 *
	 * Storage: rules live on `store.model.trustRules` (catalog). Per-column
	 * attachment lives on `store.model.columnTrustRules` (column id → rule
	 * ids[]) — managed via the TrustRuleBadge on the Dictionary tab, not here.
	 *
	 * Design system: Tailwind throughout, same chip/card/button vocabulary as
	 * ContractPatternsTab. Click-to-edit on rows; click-outside to commit.
	 */
	import { TRUST_RULE_CATEGORIES } from '$lib/types';
	import { store, upsertTrustRule, deleteTrustRule } from '$lib/stores/contract.svelte';
	import type { TrustRule } from '$lib/types';

	// New-rule form state
	let newName = $state('');
	let newCategory = $state('');
	let newRule = $state('');
	let newDescription = $state('');

	// Filter state
	let filterCategory = $state<string>('');
	let search = $state('');

	// Inline-edit state (one row at a time)
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editCategory = $state('');
	let editRule = $state('');
	let editDescription = $state('');

	// Categories — start from the static catalog plus any custom categories
	// already on a rule (so legacy data with non-standard categories doesn't
	// disappear from the filter row).
	const categories = $derived.by<string[]>(() => {
		const fromRules = store.model.trustRules.map((r) => r.category).filter(Boolean);
		const merged = new Set<string>([...TRUST_RULE_CATEGORIES, ...fromRules]);
		return Array.from(merged);
	});

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return store.model.trustRules.filter((r) => {
			if (filterCategory && r.category !== filterCategory) return false;
			if (!q) return true;
			return (
				r.name.toLowerCase().includes(q) ||
				r.category.toLowerCase().includes(q) ||
				(r.rule || '').toLowerCase().includes(q) ||
				(r.description || '').toLowerCase().includes(q)
			);
		});
	});

	// Count of rules attached to at least one column — gives the user a sense
	// of which catalog entries are actually wired up vs. orphaned.
	function attachedColumnCount(ruleId: string): number {
		const map = store.model.columnTrustRules ?? {};
		let n = 0;
		for (const colId of Object.keys(map)) {
			if (map[colId].includes(ruleId)) n++;
		}
		return n;
	}

	function generateId(): string {
		return `tr-${Math.random().toString(36).slice(2, 8)}`;
	}

	function handleAdd() {
		const name = newName.trim();
		if (!name) return;
		upsertTrustRule({
			id: generateId(),
			name,
			description: newDescription.trim(),
			category: newCategory || 'Custom',
			rule: newRule.trim()
		});
		newName = '';
		newCategory = '';
		newRule = '';
		newDescription = '';
	}

	function startEdit(rule: TrustRule) {
		editingId = rule.id;
		editName = rule.name;
		editCategory = rule.category;
		editRule = rule.rule || '';
		editDescription = rule.description || '';
	}

	function saveEdit() {
		if (!editingId) return;
		const existing = store.model.trustRules.find((r) => r.id === editingId);
		if (!existing) return;
		upsertTrustRule({
			...existing,
			name: editName.trim() || existing.name,
			category: editCategory,
			rule: editRule.trim(),
			description: editDescription.trim()
		});
		editingId = null;
	}

	function cancelEdit() {
		editingId = null;
	}

	function handleDelete(id: string) {
		const r = store.model.trustRules.find((x) => x.id === id);
		if (!r) return;
		const attached = attachedColumnCount(id);
		const msg =
			attached > 0
				? `Delete "${r.name}"?\n\nIt's attached to ${attached} column${attached === 1 ? '' : 's'} — those attachments will be removed too.`
				: `Delete "${r.name}"?`;
		if (!confirm(msg)) return;
		deleteTrustRule(id);
	}
</script>

<div class="px-6 py-4 max-w-5xl mx-auto">
	<!-- Header -->
	<div class="mb-4">
		<h2 class="text-lg font-semibold text-slate-800 mb-1">Trust Rules</h2>
		<p class="text-sm text-slate-500">
			Data-quality expectations for this contract. Manage the catalog here, then attach rules to columns from the Dictionary tab.
		</p>
	</div>

	<!-- Filter + search row -->
	<div class="flex flex-wrap items-center gap-2 mb-4 rounded-lg px-4 py-3 bg-slate-50 border border-slate-200">
		<input
			type="text"
			placeholder="Search rules..."
			bind:value={search}
			class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none flex-1 min-w-[200px]"
		/>
		<button
			type="button"
			onclick={() => (filterCategory = '')}
			class="px-3 py-1.5 text-xs rounded-lg transition-colors {filterCategory === '' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}"
		>All</button>
		{#each categories as cat}
			<button
				type="button"
				onclick={() => (filterCategory = cat)}
				class="px-3 py-1.5 text-xs rounded-lg transition-colors {filterCategory === cat ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}"
			>{cat}</button>
		{/each}
	</div>

	<!-- Add new rule -->
	<div class="mb-6 rounded-lg p-4 bg-white border border-slate-200">
		<h3 class="text-sm font-semibold text-slate-700 mb-3">Add Trust Rule</h3>
		<div class="space-y-2">
			<div class="flex gap-2">
				<input
					type="text"
					placeholder="Rule name (e.g. order_id completeness)"
					bind:value={newName}
					class="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
				/>
				<select
					bind:value={newCategory}
					class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
				>
					<option value="">Category...</option>
					{#each categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
				</select>
			</div>
			<textarea
				placeholder="Description..."
				bind:value={newDescription}
				rows="2"
				class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
			></textarea>
			<textarea
				placeholder="Rule statement (e.g. order_id is non-null on at least 99.5% of rows)"
				bind:value={newRule}
				rows="2"
				class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
			></textarea>
			<button
				type="button"
				onclick={handleAdd}
				disabled={!newName.trim()}
				class="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
			>Add Trust Rule</button>
		</div>
	</div>

	<!-- Rules list -->
	<div>
		<h3 class="text-sm font-semibold text-slate-700 mb-3">
			Rules ({filtered.length})
		</h3>
		{#each filtered as rule (rule.id)}
			<div class="mb-2 rounded-lg p-4 bg-white border border-slate-200">
				{#if editingId === rule.id}
					<div class="space-y-2">
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={editName}
								class="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
							/>
							<select
								bind:value={editCategory}
								class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
							>
								{#each categories as cat}
									<option value={cat}>{cat}</option>
								{/each}
							</select>
						</div>
						<textarea
							bind:value={editDescription}
							rows="2"
							placeholder="Description..."
							class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
						></textarea>
						<textarea
							bind:value={editRule}
							rows="2"
							placeholder="Rule statement..."
							class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
						></textarea>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={saveEdit}
								class="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
							>Save</button>
							<button
								type="button"
								onclick={cancelEdit}
								class="px-3 py-1.5 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
							>Cancel</button>
						</div>
					</div>
				{:else}
					<div class="flex items-start justify-between gap-3">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-sm font-medium text-slate-800">{rule.name}</span>
								<span class="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200">{rule.category}</span>
								{#if attachedColumnCount(rule.id) > 0}
									<span class="px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title="Attached columns">
										{attachedColumnCount(rule.id)} column{attachedColumnCount(rule.id) === 1 ? '' : 's'}
									</span>
								{:else}
									<span class="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200" title="Not attached to any column">unattached</span>
								{/if}
							</div>
							{#if rule.description}
								<p class="text-xs text-slate-500 mb-1">{rule.description}</p>
							{/if}
							{#if rule.rule}
								<p class="text-xs font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">{rule.rule}</p>
							{/if}
						</div>
						<div class="flex gap-1 flex-shrink-0">
							<button
								type="button"
								onclick={() => startEdit(rule)}
								class="px-2 py-1 text-xs rounded bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
							>Edit</button>
							<button
								type="button"
								onclick={() => handleDelete(rule.id)}
								class="px-2 py-1 text-xs rounded bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
							>Delete</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
		{#if filtered.length === 0}
			<p class="text-sm text-slate-400 italic px-4 py-3">
				{#if search || filterCategory}
					No rules match the current filter.
				{:else}
					No trust rules yet. Add one above to get started.
				{/if}
			</p>
		{/if}
	</div>
</div>
