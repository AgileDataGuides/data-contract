<script lang="ts">
	// The 12 Steps tab: the Data Contract filled in one step at a time. A rail
	// of steps on the left, the selected step's panel on the right, Back and
	// Next under the panel. A checklist, never a wizard: every step is
	// reachable at any time and no step blocks another. Each row's status line
	// reads off the contract, so the 12 Steps tab and the Canvas grid are two
	// views of the same cards.
	import CanvasAreaShell from '$lib/components/canvas/CanvasAreaShell.svelte';
	import type { ContextLink, ContextNode } from '$lib/cp-shared';
	import type { ExampleDataRow } from '../../types';
	import {
		CHECK,
		METADATA_COLOR,
		NEEDS_DATA_ASSET,
		PATTERN_AREAS,
		SECTIONS,
		STEPS,
		stepLabel,
		type PatternAreaCanon,
		type SectionCanon,
		type StepCanon
	} from '../../canon/steps';
	import { CARD, CARD_LIST_DIVIDER, HINT, ROW_ACTION, STEP_NAV, STEP_PANEL, STEP_RAIL, TYPE } from '../../ui/tokens';
	import StepSection from './steps/StepSection.svelte';
	import PatternValueDropdown from './PatternValueDropdown.svelte';
	import ContractExampleDataView from './ContractExampleDataView.svelte';

	type MetadataField = PatternAreaCanon['field'];

	let {
		nodes,
		links,
		contractId,
		sectionNodes,
		pattern,
		exampleRowCount,
		onSelectNode,
		onAddNode,
		onMetadataUpdate,
		selected = $bindable()
	}: {
		/** The whole graph, for the Example Data table. */
		nodes: ContextNode[];
		links: ContextLink[];
		/** The selected contract, so the Example Data table shows its rows. */
		contractId: string;
		/** The cards in an area, already scoped to the selected contract. */
		sectionNodes: (label: string) => ContextNode[];
		/** A pattern area's values and choices for the selected contract. */
		pattern: (area: PatternAreaCanon) => { options: string[]; selected: string[]; multiSelect: boolean };
		/** The rows in the selected contract's Example Data. */
		exampleRowCount: number;
		onSelectNode: (id: string) => void;
		onAddNode: (entityLabel: string, name: string) => void;
		/** Saves a pattern area or the Example Data. Without it, those steps are read only. */
		onMetadataUpdate?: (updates: Partial<Record<MetadataField, string[]>> & { exampleData?: ExampleDataRow[] }) => void;
		/** The selected step. A host can bind it; an unknown value falls back to the remembered step. */
		selected?: string;
	} = $props();

	// Without a step from the host, the selected step is a per-viewer convenience, remembered in this browser
	const STORAGE_KEY = 'dc-active-step';

	function isStep(value: string | null | undefined): value is string {
		return STEPS.some((s) => s.id === value);
	}

	function remembered(): string {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (isStep(saved)) return saved;
		} catch {
			// no storage: start at Step 1
		}
		return STEPS[0].id;
	}

	if (!isStep(selected)) selected = remembered();
	const stepIndex = $derived(Math.max(0, STEPS.findIndex((s) => s.id === selected)));
	const step = $derived(STEPS[stepIndex]);

	function select(target: StepCanon) {
		selected = target.id;
		try {
			localStorage.setItem(STORAGE_KEY, target.id);
		} catch {
			// no storage: the choice lasts until reload
		}
	}

	// Back and Next: the steps either side of this one
	const previous = $derived(stepIndex > 0 ? STEPS[stepIndex - 1] : undefined);
	const next = $derived(stepIndex < STEPS.length - 1 ? STEPS[stepIndex + 1] : undefined);

	// A step opens at its top, whether it was picked on the rail or with Back and Next
	let scroller = $state<HTMLElement>();
	$effect(() => {
		void step;
		scroller?.scrollTo({ top: 0 });
	});

	const hasDataAsset = $derived(sectionNodes('global_data_asset').length > 0);

	/** "3 Personas", "No Personas yet", "Data Asset: landing.stripe.subscriptions" */
	function sectionStatus(section: SectionCanon): string {
		const cards = sectionNodes(section.label);
		const [one, many] = section.noun;
		if (section.maxItems === 1) return cards[0] ? `${one}: ${cards[0].name}` : `No ${one} yet`;
		if (cards.length === 0) return `No ${many} yet`;
		return `${cards.length} ${cards.length === 1 ? one : many}`;
	}

	/** "History Window: All history", "No History Window yet" */
	function patternStatus(area: PatternAreaCanon): string {
		const values = pattern(area).selected;
		return values.length > 0 ? `${area.title}: ${values.join(', ')}` : `No ${area.title} yet`;
	}

	function exampleStatus(): string {
		if (exampleRowCount === 0) return 'No example rows yet';
		return `${exampleRowCount} example ${exampleRowCount === 1 ? 'row' : 'rows'}`;
	}

	/** Something is in the step's own areas. The check step counts its Status only. */
	function stepStarted(s: StepCanon): boolean {
		if (s.special === 'example-data') return exampleRowCount > 0;
		return (
			s.sections.some((label) => sectionNodes(label).length > 0) ||
			s.patterns.some((id) => pattern(PATTERN_AREAS[id]).selected.length > 0)
		);
	}

	function stepStatus(s: StepCanon): string {
		if (s.special === 'example-data') return exampleStatus();
		const parts = [
			...s.sections.map((label) => sectionStatus(SECTIONS[label])),
			...s.patterns.map((id) => patternStatus(PATTERN_AREAS[id]))
		];
		if (s.special === 'check') {
			const empty = emptySteps.length;
			parts.push(empty === 0 ? 'every step has something' : `${empty} ${empty === 1 ? 'step' : 'steps'} with nothing in ${empty === 1 ? 'it' : 'them'}`);
		}
		return parts.join(', ');
	}

	// The check step lists every other step with nothing in it yet
	const emptySteps = $derived(STEPS.filter((s) => s.special !== 'check' && !stepStarted(s)));
</script>

<div class="flex h-full min-h-0">
	<nav class={STEP_RAIL.container} aria-label="The steps">
		<ul class="py-2">
			{#each STEPS as s (s.id)}
				{@const active = s.id === step.id}
				<li>
					<button
						type="button"
						aria-current={active ? 'step' : undefined}
						class="{STEP_RAIL.row} {active ? STEP_RAIL.rowActive : STEP_RAIL.rowInactive}"
						onclick={() => select(s)}
					>
						<span class={stepStarted(s) ? STEP_RAIL.dotStarted : STEP_RAIL.dotEmpty}></span>
						<span class="min-w-0">
							<span class="block {active ? STEP_RAIL.labelActive : STEP_RAIL.labelInactive}">{stepLabel(s)}</span>
							<span class="block {STEP_RAIL.status}">{stepStatus(s)}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</nav>

	<section class="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-50">
		<div bind:this={scroller} class="flex-1 overflow-y-auto {STEP_PANEL.body}">
			<header class="space-y-1 pb-3 mb-4 border-b border-slate-200">
				<p class={STEP_PANEL.label}>{stepLabel(step)}</p>
				<h2 class={STEP_PANEL.question}>{step.question}</h2>
				<p class={STEP_PANEL.description}>{step.description}</p>
				{#if step.guide}
					<p class={STEP_PANEL.guide}>{step.guide}</p>
				{/if}
				<p class={HINT.quiet}>
					<svg class={HINT.icon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
					</svg>
					<span>Example from the Stripe Subscriptions contract: {step.example}</span>
				</p>
			</header>

			{#if step.special === 'example-data'}
				<ContractExampleDataView {nodes} {links} {contractId} embedded onUpdate={(rows) => onMetadataUpdate?.({ exampleData: rows })} />
			{:else}
				<div class="max-w-2xl space-y-6">
					{#each step.patterns as id (id)}
						{@const area = PATTERN_AREAS[id]}
						{@const values = pattern(area)}
						<CanvasAreaShell title={area.title} color={METADATA_COLOR}>
							{#if onMetadataUpdate}
								<PatternValueDropdown
									patternId={area.patternId}
									options={values.options}
									selected={values.selected}
									multiSelect={values.multiSelect}
									onchange={(picked) => onMetadataUpdate?.({ [area.field]: picked } as Partial<Record<MetadataField, string[]>>)}
								/>
							{:else}
								<span class="text-xs text-slate-600">{values.selected.join(', ') || 'Not set'}</span>
							{/if}
						</CanvasAreaShell>
					{/each}

					{#each step.sections as label (label)}
						{@const section = SECTIONS[label] as SectionCanon}
						{#if section.needsDataAsset && !hasDataAsset}
							<p class={HINT.quiet}>
								<svg class={HINT.icon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
								</svg>
								<span>{NEEDS_DATA_ASSET} <button type="button" class={ROW_ACTION} onclick={() => select(STEPS[0])}>{CHECK.goTo} {stepLabel(STEPS[0])}</button></span>
							</p>
						{:else}
							<StepSection {section} nodes={sectionNodes(label)} {onSelectNode} {onAddNode} />
						{/if}
					{/each}

					{#if step.special === 'check'}
						<section class="space-y-2">
							<h3 class={TYPE.sectionHeader}>{CHECK.heading}</h3>
							{#if emptySteps.length === 0}
								<p class={TYPE.body}>{CHECK.none}</p>
							{:else}
								<ul class="{CARD} {CARD_LIST_DIVIDER}">
									{#each emptySteps as s (s.id)}
										<li class="flex items-center justify-between gap-3 px-3 py-2">
											<span class="min-w-0">
												<span class="block {TYPE.cardTitle}">{stepLabel(s)}</span>
												<span class="block {STEP_PANEL.description}">{s.question}</span>
											</span>
											<button type="button" class="{ROW_ACTION} shrink-0" onclick={() => select(s)}>{CHECK.goTo}</button>
										</li>
									{/each}
								</ul>
							{/if}
						</section>
					{/if}
				</div>
			{/if}
		</div>

		<nav class={STEP_NAV.bar} aria-label="Move between steps">
			{#if previous}
				{@const to = previous}
				<button type="button" class={STEP_NAV.button} title="Back: {stepLabel(to)}" onclick={() => select(to)}>
					<svg class={STEP_NAV.icon} fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
					</svg>
					<span class={STEP_NAV.label}>Back: {stepLabel(to)}</span>
				</button>
			{:else}
				<span></span>
			{/if}
			{#if next}
				{@const to = next}
				<button type="button" class={STEP_NAV.button} title="Next: {stepLabel(to)}" onclick={() => select(to)}>
					<span class={STEP_NAV.label}>Next: {stepLabel(to)}</span>
					<svg class={STEP_NAV.icon} fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
					</svg>
				</button>
			{/if}
		</nav>
	</section>
</div>
