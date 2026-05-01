<script lang="ts">
	/**
	 * PatternValueDropdown — the chip-trigger dropdown used on the Data Contract's
	 * pattern-driven metadata areas (Change Detection / Retention Period / History
	 * Window). Same selection process as the Checklist's CellDropdown: click the
	 * trigger to open a panel with a filter field + per-option checkbox (for
	 * `multiSelect: true` patterns) or radio (for `multiSelect: false`); each option
	 * renders its label + description (pulled from the shared patterns dictionary).
	 *
	 * Stored value is always `string[]` — single-select patterns just enforce
	 * length <= 1. Empty state renders as a dashed-slate "Select..." chip matching
	 * the rest of the empty-metadata conventions.
	 *
	 * Chip colours for selected values come from the same 8-way deterministic
	 * palette rotation used by the cycling chips (see
	 * DESIGN_SYSTEM.md § Pattern-Driven Chip + tokens.md § pattern_chip_palette).
	 */
	import { getValueDescriptions } from '$lib/shared-data/patterns';

	let {
		patternId,
		options,
		selected,
		multiSelect,
		placeholder = 'Select...',
		onchange
	}: {
		patternId: string;
		options: string[];
		selected: string[];
		multiSelect: boolean;
		placeholder?: string;
		onchange: (values: string[]) => void;
	} = $props();

	let open = $state(false);
	let search = $state('');

	// Panel positioning. The dropdown trigger lives inside CanvasAreaShell which
	// has `overflow-hidden`, so an `absolute` panel gets clipped. We render the
	// panel with `position: fixed` and compute coordinates from the trigger's
	// bounding rect on open. Closes on scroll / resize so coords don't go stale.
	let triggerEl = $state<HTMLElement | null>(null);
	let panelTop = $state(0);
	let panelLeft = $state(0);
	const PANEL_WIDTH = 288; // matches w-72
	const PANEL_GAP = 4;

	function openDropdown() {
		if (triggerEl) {
			const rect = triggerEl.getBoundingClientRect();
			panelTop = rect.bottom + PANEL_GAP;
			panelLeft = rect.left;
			// If the panel would overflow the right edge, anchor to the right side instead
			if (panelLeft + PANEL_WIDTH > window.innerWidth - 8) {
				panelLeft = Math.max(8, window.innerWidth - PANEL_WIDTH - 8);
			}
		}
		open = true;
	}

	function closeDropdown() {
		open = false;
	}

	function handleScrollOrResize() {
		if (open) closeDropdown();
	}

	const descriptions = $derived(getValueDescriptions(patternId));

	const filtered = $derived(
		search
			? options.filter(
					(o) =>
						o.toLowerCase().includes(search.toLowerCase()) ||
						(descriptions[o] ?? '').toLowerCase().includes(search.toLowerCase())
				)
			: options
	);

	function toggle(value: string) {
		let next: string[];
		if (multiSelect) {
			next = selected.includes(value)
				? selected.filter((v) => v !== value)
				: [...selected, value];
		} else {
			next = selected.includes(value) ? [] : [value];
			// For single-select, close the dropdown immediately once the user picks
			// something — matches native <select> behaviour.
			open = false;
		}
		onchange(next);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeDropdown();
	}

	// Same 8-way palette + empty state used by the cycling chip helper in
	// ContractLayout. Documented in tokens.md § pattern_chip_palette.
	const PALETTES: string[] = [
		'bg-slate-50 text-slate-600 border border-slate-200',
		'bg-blue-50 text-blue-700 border border-blue-200',
		'bg-violet-50 text-violet-700 border border-violet-200',
		'bg-teal-50 text-teal-700 border border-teal-200',
		'bg-amber-50 text-amber-700 border border-amber-200',
		'bg-emerald-50 text-emerald-700 border border-emerald-200',
		'bg-orange-50 text-orange-700 border border-orange-200',
		'bg-cyan-50 text-cyan-700 border border-cyan-200'
	];

	function chipClasses(value: string): string {
		let hash = 0;
		for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
		return PALETTES[hash % PALETTES.length];
	}
</script>

<svelte:window onkeydown={handleKeydown} onscroll={handleScrollOrResize} onresize={handleScrollOrResize} />

<div class="inline-block">
	{#if selected.length === 0}
		<button
			bind:this={triggerEl}
			onclick={openDropdown}
			class="px-2 py-0.5 text-xs rounded bg-slate-50 text-slate-400 italic border border-dashed border-slate-300 hover:border-slate-400 hover:text-slate-600 transition-colors"
			title="Click to select {multiSelect ? 'one or more values' : 'a value'}"
		>
			{placeholder}
		</button>
	{:else}
		<button
			bind:this={triggerEl}
			onclick={openDropdown}
			class="inline-flex flex-wrap items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
			title={multiSelect ? 'Click to edit selection' : 'Click to change'}
		>
			{#each selected as value (value)}
				<span class="px-2 py-0.5 text-xs font-medium rounded {chipClasses(value)}">{value}</span>
			{/each}
		</button>
	{/if}
</div>

<!-- Panel rendered at top-level (sibling of the inline trigger wrapper) using
     `position: fixed` with computed coordinates so it escapes any
     `overflow-hidden` ancestor (CanvasAreaShell) and floats above the canvas.
     Backdrop button + scroll/resize listeners close the panel to keep coords
     fresh. -->
{#if open}
	<!-- svelte-ignore a11y_consider_explicit_label -->
	<button
		class="fixed inset-0 z-40 cursor-default"
		onclick={closeDropdown}
		aria-label="Close dropdown"
	></button>

	<div
		class="fixed w-72 max-h-80 bg-white rounded-lg border border-slate-200 shadow-xl z-50 flex flex-col overflow-hidden"
		style="top: {panelTop}px; left: {panelLeft}px;"
	>
		<input
			type="text"
			bind:value={search}
			placeholder="Filter..."
			class="px-3 py-2 text-xs border-b border-slate-200 outline-none"
		/>
		<div class="overflow-y-auto flex-1">
			{#each filtered as option (option)}
				{@const isSelected = selected.includes(option)}
				<label
					class="flex items-start gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 border-b border-slate-100 {isSelected
						? 'bg-blue-50'
						: ''}"
				>
					<input
						type={multiSelect ? 'checkbox' : 'radio'}
						checked={isSelected}
						onchange={() => toggle(option)}
						class="mt-0.5 shrink-0"
					/>
					<div class="flex flex-col gap-0.5 min-w-0">
						<span class="font-medium text-slate-800">{option}</span>
						{#if descriptions[option]}
							<span class="text-[11px] text-slate-500 leading-snug">{descriptions[option]}</span>
						{/if}
					</div>
				</label>
			{/each}
			{#if filtered.length === 0}
				<div class="px-3 py-2 text-[11px] text-slate-400 italic">No matches</div>
			{/if}
		</div>
	</div>
{/if}
