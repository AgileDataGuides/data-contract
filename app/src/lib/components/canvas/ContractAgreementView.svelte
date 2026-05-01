<script lang="ts">
	import type { ContextNode, ContextLink } from '$lib/cp-shared';
	import { contextPlaneToContract } from '../../converters/context-plane';

	let {
		nodes,
		links
	}: {
		nodes: ContextNode[];
		links: ContextLink[];
	} = $props();

	const model = $derived(contextPlaneToContract({ nodes, links }));
	const today = new Date().toISOString().slice(0, 10);

	// Change Detection / Retention Period / History Window are now plain strings
	// sourced from the shared patterns (change-detection, default-retention-period,
	// history-window). The Agreement view just renders them verbatim — the
	// Manage Patterns tab controls what values exist in the first place.
</script>

<div class="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-8">
	<!-- Paper container — centred, max-w-4xl, white background, shadow to evoke a physical document -->
	<article class="max-w-4xl mx-auto bg-white shadow-sm border border-slate-200 rounded-lg p-8 md:p-12 space-y-8 text-slate-800">

		<!-- Title block -->
		<header class="text-center border-b-2 border-slate-900 pb-6">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Data Contract Agreement</p>
			<h1 class="text-2xl font-bold text-slate-900">{model.name || 'Untitled Contract'}</h1>
			{#if model.description}
				<p class="text-sm text-slate-600 mt-2 italic">{model.description}</p>
			{/if}
		</header>

		<!-- Contract Identification Block -->
		<section>
			<table class="w-full text-sm">
				<tbody>
					<tr class="border-b border-slate-200">
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-40">Contract ID</td>
						<td class="py-2 font-mono text-slate-800">{model.id}</td>
					</tr>
					<tr class="border-b border-slate-200">
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Version</td>
						<td class="py-2 text-slate-800">{model.version}</td>
					</tr>
					<tr class="border-b border-slate-200">
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</td>
						<td class="py-2 text-slate-800">{model.status.length > 0 ? model.status.join(', ') : '—'}</td>
					</tr>
					{#if model.domain}
						<tr class="border-b border-slate-200">
							<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Domain</td>
							<td class="py-2 text-slate-800">{model.domain.name}</td>
						</tr>
					{/if}
					{#if model.informationProduct}
						<tr class="border-b border-slate-200">
							<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Information Product</td>
							<td class="py-2 text-slate-800">{model.informationProduct.name}</td>
						</tr>
					{/if}
					{#if model.tags.length > 0}
						<tr class="border-b border-slate-200">
							<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Tags</td>
							<td class="py-2">
								<div class="flex gap-1 flex-wrap">
									{#each model.tags as tag}
										<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-600">{tag}</span>
									{/each}
								</div>
							</td>
						</tr>
					{/if}
					<tr>
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Issued</td>
						<td class="py-2 text-slate-800">{today}</td>
					</tr>
				</tbody>
			</table>
		</section>

		<!-- Preamble -->
		<section class="text-sm text-slate-700 leading-relaxed">
			<p class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Preamble</p>
			<p>
				This Data Contract Agreement (the &ldquo;<strong>Agreement</strong>&rdquo;) establishes the terms under which
				the Producer named herein shall make available the Data Asset described below to the Consumers listed in this Agreement.
				The parties agree to the schema, Trust Rules, Data Sync commitments, and delivery mechanisms
				set forth in the clauses that follow. All definitions appearing in <strong>bold</strong> shall have the
				meanings assigned in Clause 6 (Glossary Terms).
			</p>
		</section>

		<!-- 1. Parties -->
		<section class="space-y-3">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">1. Parties</h2>

			<div>
				<h3 class="text-sm font-semibold text-slate-800 mb-1">1.1 Producer (Data Publisher)</h3>
				{#if model.team.length === 0}
					<p class="text-sm text-slate-400 italic ml-4">No producer parties declared.</p>
				{:else}
					<p class="text-sm text-slate-700 mb-2">The following parties are responsible for producing and maintaining the Data Asset:</p>
					<ol class="list-[lower-alpha] list-outside ml-8 space-y-1.5 text-sm text-slate-700">
						{#each model.team as member}
							<li>
								<span class="font-medium text-slate-900">{member.name}</span>
								{#if (member as { role?: string }).role}
									<span class="text-slate-500"> — Role: {(member as { role?: string }).role}</span>
								{/if}
								{#if member.description}
									<div class="text-xs text-slate-600 mt-0.5">{member.description}</div>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</div>

			<div>
				<h3 class="text-sm font-semibold text-slate-800 mb-1">1.2 Consumer (Data Subscribers)</h3>
				{#if model.personas.length === 0}
					<p class="text-sm text-slate-400 italic ml-4">No consumer personas declared.</p>
				{:else}
					<p class="text-sm text-slate-700 mb-2">The following personas are authorised to consume the Data Asset:</p>
					<ol class="list-[lower-alpha] list-outside ml-8 space-y-1.5 text-sm text-slate-700">
						{#each model.personas as persona}
							<li>
								<span class="font-medium text-slate-900">{persona.name}</span>
								{#if persona.description}
									<span class="text-slate-500"> — {persona.description}</span>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</section>

		<!-- 2. Data Asset -->
		<section class="space-y-2">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">2. Data Asset</h2>
			<p class="text-sm text-slate-700">2.1 The Producer agrees to make available the following Data Asset to the Consumer(s):</p>
			{#if model.dataAsset}
				<div class="ml-4 pl-4 border-l-2 border-slate-300">
					<p class="text-sm"><span class="font-semibold text-slate-900">{model.dataAsset.name}</span></p>
					{#if model.dataAsset.description}
						<p class="text-sm text-slate-600 mt-1">{model.dataAsset.description}</p>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-slate-400 italic ml-4">No Data Asset has been specified in this Agreement.</p>
			{/if}

			<p class="text-sm text-slate-700 pt-2">2.2 Each delivered file or table shall carry data of the following shape and temporal window:</p>
			<table class="w-full text-sm ml-4" style="max-width: calc(100% - 1rem);">
				<tbody>
					<tr class="border-b border-slate-200">
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500 w-40">Change Detection</td>
						<td class="py-2 text-slate-800">{model.changeDetection.length > 0 ? model.changeDetection.join(', ') : '—'}</td>
					</tr>
					<tr class="border-b border-slate-200">
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Retention Period</td>
						<td class="py-2 text-slate-800">{model.retentionPeriod.length > 0 ? model.retentionPeriod.join(', ') : '—'}</td>
					</tr>
					<tr class="border-b border-slate-200">
						<td class="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">History Window</td>
						<td class="py-2 text-slate-800">{model.historyWindow.length > 0 ? model.historyWindow.join(', ') : '—'}</td>
					</tr>
				</tbody>
			</table>
		</section>

		<!-- 3. Schema -->
		<section class="space-y-2">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">3. Schema</h2>
			<p class="text-sm text-slate-700">
				3.1 The Data Asset shall conform to the following schema. Each column is described with its logical type,
				constraints, and data classification.
			</p>
			{#if model.columns.length === 0}
				<p class="text-sm text-slate-400 italic ml-4">No columns declared.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-xs border border-slate-300">
						<thead class="bg-slate-50">
							<tr>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-300 w-10">#</th>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-300">Column</th>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-300">Type</th>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-300">Required</th>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-300">Unique</th>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-300">PK</th>
								<th class="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-300">Classification</th>
							</tr>
						</thead>
						<tbody>
							{#each model.columns as col, i}
								<tr class="hover:bg-slate-50">
									<td class="px-3 py-2 border-b border-r border-slate-200 text-slate-500">{i + 1}</td>
									<td class="px-3 py-2 border-b border-r border-slate-200">
										<div class="font-mono text-slate-900">{col.name}</div>
										{#if col.description}<div class="text-[11px] text-slate-500 mt-0.5">{col.description}</div>{/if}
									</td>
									<td class="px-3 py-2 border-b border-r border-slate-200 font-mono text-slate-700">{col.dataType}</td>
									<td class="px-3 py-2 border-b border-r border-slate-200 text-slate-700">{col.required ? 'yes' : 'no'}</td>
									<td class="px-3 py-2 border-b border-r border-slate-200 text-slate-700">{col.unique ? 'yes' : 'no'}</td>
									<td class="px-3 py-2 border-b border-r border-slate-200 text-slate-700">{col.primaryKey ? 'yes' : 'no'}</td>
									<td class="px-3 py-2 border-b border-slate-200 text-slate-700">{col.classification}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- 4. Trust Rules -->
		<section class="space-y-2">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">4. Trust Rules</h2>
			<p class="text-sm text-slate-700">
				4.1 The Producer commits to the following Trust Rules for the Data Asset. Each rule shall be
				evaluated on each delivery.
			</p>
			{#if model.trustRules.length === 0}
				<p class="text-sm text-slate-400 italic ml-4">No Trust Rules declared.</p>
			{:else}
				<ol class="ml-4 space-y-3 text-sm text-slate-700">
					{#each model.trustRules as rule, i}
						<li>
							<p><span class="font-semibold text-slate-900">4.1.{i + 1} {rule.name}</span></p>
							<div class="ml-4 mt-1 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
								<span class="font-semibold uppercase tracking-wider text-slate-500">Category</span>
								<span class="text-slate-700">{rule.category}</span>
								<span class="font-semibold uppercase tracking-wider text-slate-500">Target field</span>
								<span class="font-mono text-slate-700">{rule.column === '*' ? 'ALL (table-level)' : rule.column}</span>
								<span class="font-semibold uppercase tracking-wider text-slate-500">Rule</span>
								<span class="text-slate-700">{rule.rule || '(rule statement not provided)'}</span>
								{#if rule.description}
									<span class="font-semibold uppercase tracking-wider text-slate-500">Notes</span>
									<span class="text-slate-600 italic">{rule.description}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<!-- 5. Data Sync -->
		<section class="space-y-2">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">5. Data Sync</h2>
			<p class="text-sm text-slate-700">5.1 The Producer shall meet the following <strong>Data Sync</strong> commitments for the Data Asset:</p>
			{#if model.dataSyncs.length === 0}
				<p class="text-sm text-slate-400 italic ml-4">No Data Sync commitments declared.</p>
			{:else}
				<ol class="ml-4 space-y-3 text-sm text-slate-700">
					{#each model.dataSyncs as sync, i}
						<li>
							<p><span class="font-semibold text-slate-900">5.1.{i + 1} {sync.name}</span></p>
							<div class="ml-4 mt-1 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
								<span class="font-semibold uppercase tracking-wider text-slate-500">Property</span>
								<span class="text-slate-700">{sync.property || '(unspecified)'}</span>
								<span class="font-semibold uppercase tracking-wider text-slate-500">Commitment</span>
								<span class="text-slate-700">{sync.value || '—'}{sync.unit ? ' ' + sync.unit : ''}</span>
								{#if sync.description}
									<span class="font-semibold uppercase tracking-wider text-slate-500">Description</span>
									<span class="text-slate-600 italic">{sync.description}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<!-- 6. Glossary Terms -->
		<section class="space-y-2">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">6. Glossary Terms</h2>
			<p class="text-sm text-slate-700">6.1 The following Glossary Terms used in this Agreement have the meanings assigned below:</p>
			{#if model.glossaryTerms.length === 0}
				<p class="text-sm text-slate-400 italic ml-4">No Glossary Terms defined.</p>
			{:else}
				<dl class="ml-4 space-y-1.5 text-sm">
					{#each model.glossaryTerms as term}
						<div class="flex gap-2">
							<dt class="font-semibold text-slate-900 whitespace-nowrap">&ldquo;{term.name}&rdquo;</dt>
							<dd class="text-slate-700">— {term.description || '(no definition)'}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</section>

		<!-- 7. Delivery -->
		<section class="space-y-2">
			<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">7. Delivery &amp; Infrastructure</h2>
			<p class="text-sm text-slate-700">7.1 The Data Asset shall be delivered via the following channels:</p>
			{#if model.deliveryTypes.length === 0}
				<p class="text-sm text-slate-400 italic ml-4">No delivery channels declared.</p>
			{:else}
				<ol class="list-[lower-alpha] list-outside ml-8 space-y-1.5 text-sm text-slate-700">
					{#each model.deliveryTypes as dt}
						<li>
							<span class="font-medium text-slate-900">{dt.name}</span>
							{#if dt.description}
								<span class="text-slate-500"> — {dt.description}</span>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}

		</section>

		<!-- 8. Lineage (if present) -->
		{#if model.lineage.length > 0}
			<section class="space-y-2">
				<h2 class="text-lg font-bold text-slate-900 border-b border-slate-300 pb-1">8. Data Lineage</h2>
				<p class="text-sm text-slate-700">8.1 The Data Asset has the following lineage relationships:</p>
				<ul class="list-disc list-outside ml-8 space-y-1.5 text-sm text-slate-700">
					{#each model.lineage as lin}
						<li>
							<span class="font-medium text-slate-900">{lin.name}</span>
							{#if lin.description}
								<span class="text-slate-500"> — {lin.description}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Signatures -->
		<section class="pt-6 mt-6 border-t-2 border-slate-900">
			<h2 class="text-lg font-bold text-slate-900 mb-4">Signatures</h2>
			<p class="text-sm text-slate-700 mb-8">
				Executed by the Parties effective as of the date below. Each signatory represents that they have authority
				to bind their respective organisation to the terms of this Agreement.
			</p>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
				<div class="space-y-6">
					<p class="text-xs font-semibold uppercase tracking-wider text-slate-500">For the Producer</p>
					<div class="border-b border-slate-400 h-8"></div>
					<div class="space-y-0.5">
						<p class="text-slate-700 text-xs">Name (print)</p>
						{#if model.team[0]}
							<p class="text-slate-900 font-medium">{model.team[0].name}{model.team[0].role ? ` — ${model.team[0].role}` : ''}</p>
						{/if}
					</div>
					<div class="border-b border-slate-400 h-8"></div>
					<p class="text-slate-700 text-xs">Date</p>
				</div>

				<div class="space-y-6">
					<p class="text-xs font-semibold uppercase tracking-wider text-slate-500">For the Consumer</p>
					<div class="border-b border-slate-400 h-8"></div>
					<div class="space-y-0.5">
						<p class="text-slate-700 text-xs">Name (print)</p>
					</div>
					<div class="border-b border-slate-400 h-8"></div>
					<p class="text-slate-700 text-xs">Date</p>
				</div>
			</div>
		</section>

		<!-- Footer -->
		<footer class="text-center text-[11px] text-slate-400 pt-4 border-t border-slate-200">
			End of Data Contract Agreement · Contract {model.id} · v{model.version}
		</footer>
	</article>
</div>
