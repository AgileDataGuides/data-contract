<script lang="ts">
	import type { ContextNode, ContextLink } from '$lib/types/shared';
	import { contextPlaneToContract } from '../../converters/context-plane';
	import type { ExampleDataRow } from '../../types';

	let {
		nodes,
		links,
		onUpdate
	}: {
		nodes: ContextNode[];
		links: ContextLink[];
		/**
		 * Callback fired every time any cell value, row-add, or row-remove
		 * lands. Consumers replace the full exampleData array — keeps the
		 * contract betwen SA (which persists via the store) and CP (which
		 * persists via graphStore.updateNodeData) identical.
		 */
		onUpdate: (next: ExampleDataRow[]) => void;
	} = $props();

	// Materialise the model from the graph so the column list stays in sync
	// with the Schema tab without us manually reading every column node.
	const model = $derived(contextPlaneToContract({ nodes, links }));
	const columns = $derived(model.columns);
	const rows = $derived(model.exampleData);

	let editingKey = $state<string | null>(null);
	let editingValue = $state('');

	function startEdit(key: string, current: string) {
		editingKey = key;
		editingValue = current;
	}

	function commitEdit(rowIdx: number, columnName: string) {
		const next = rows.map((r, i) => {
			if (i !== rowIdx) return { ...r };
			return { ...r, [columnName]: editingValue };
		});
		editingKey = null;
		editingValue = '';
		onUpdate(next);
	}

	function cancelEdit() {
		editingKey = null;
		editingValue = '';
	}

	function addRow() {
		const blank: ExampleDataRow = {};
		for (const c of columns) blank[c.name] = '';
		onUpdate([...rows, blank]);
	}

	function removeRow(idx: number) {
		onUpdate(rows.filter((_, i) => i !== idx));
	}
</script>

<div class="flex-1 overflow-auto p-4 bg-slate-50">
	<!-- Header strip — title + row counter + Add Row button (§ Canvas Action Buttons — Add) -->
	<div class="flex items-center justify-between mb-3">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-slate-700">Example Data</h2>
			<span class="text-[10px] text-slate-400">
				{rows.length} {rows.length === 1 ? 'row' : 'rows'} · {columns.length} {columns.length === 1 ? 'column' : 'columns'}
			</span>
		</div>
		<button
			onclick={addRow}
			disabled={columns.length === 0}
			class="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			title={columns.length === 0 ? 'Add columns to the schema first' : 'Append an empty row'}
		>+ Add Row</button>
	</div>

	{#if columns.length === 0}
		<!-- Empty state — no schema, so no table to build -->
		<div class="bg-white rounded-lg border border-slate-200 p-8 text-center">
			<p class="text-sm text-slate-500 mb-2">No columns defined yet.</p>
			<p class="text-xs text-slate-400">Add columns to the contract's schema in the Contract tab, then return here to enter example values.</p>
		</div>
	{:else}
		<!-- overflow-x-auto lets wide schemas (many columns) scroll horizontally;
		     table min-w-full + per-th min-w-[140px] means the table sizes to its
		     content, growing past the container so the scrollbar engages. -->
		<div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
			<table class="min-w-full text-sm">
				<thead>
					<tr class="border-b border-slate-200 bg-slate-50">
						<th class="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-10">#</th>
						{#each columns as col (col.id)}
							<th class="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 align-bottom min-w-[140px]">
								<div class="flex flex-col gap-0.5">
									<span>{col.name}</span>
									{#if col.dataType}
										<span class="text-[10px] font-mono font-normal normal-case tracking-normal text-orange-600">{col.dataType}</span>
									{:else}
										<span class="text-[10px] font-normal normal-case tracking-normal text-slate-300 italic">—</span>
									{/if}
								</div>
							</th>
						{/each}
						<th class="w-8"></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row, rowIdx (rowIdx)}
						<tr class="border-b border-slate-100 hover:bg-blue-50/30 transition-colors group">
							<td class="px-3 py-2 text-[11px] text-slate-400 font-mono">{rowIdx + 1}</td>
							{#each columns as col (col.id)}
								{@const key = `${rowIdx}:${col.name}`}
								{@const cellValue = row[col.name] ?? ''}
								<td class="px-2 py-1 text-slate-700">
									{#if editingKey === key}
										<input
											type="text"
											value={editingValue}
											oninput={(e) => (editingValue = e.currentTarget.value)}
											onblur={() => commitEdit(rowIdx, col.name)}
											onkeydown={(e) => {
												if (e.key === 'Enter') { e.preventDefault(); commitEdit(rowIdx, col.name); }
												else if (e.key === 'Escape') cancelEdit();
											}}
											class="w-full px-1 py-0.5 text-sm border border-blue-400 rounded outline-none"
											autofocus
										/>
									{:else}
										<button
											class="block w-full text-left px-1 py-0.5 cursor-text rounded hover:bg-slate-50 transition-colors {cellValue ? 'text-slate-700' : 'text-slate-300 italic'}"
											onclick={() => startEdit(key, cellValue)}
											title="Click to edit cell"
										>{cellValue || '—'}</button>
									{/if}
								</td>
							{/each}
							<td class="px-2 py-1 text-right">
								<button
									onclick={() => removeRow(rowIdx)}
									class="w-5 h-5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
									title="Remove row"
									aria-label="Remove row {rowIdx + 1}"
								>×</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan={columns.length + 2} class="px-3 py-8 text-center text-slate-400 text-sm">
								No example data yet. Click <span class="font-medium text-emerald-700">+ Add Row</span> to get started.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
