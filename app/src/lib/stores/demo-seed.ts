// Demo-mode seed for the standalone GitHub Pages build.
//
// This file imports the example contract JSONs via the `$data` Vite alias
// (defined in `apps/data-contract/app/vite.config.ts`). It is therefore
// only safe to import from the standalone app's own entrypoints (e.g.
// `+page.svelte`). The Context Plane frontend transitively imports
// `contract.svelte.ts` through the data-contract package's converter
// exports, but does NOT import this file — keeping the `$data`-resolved
// imports out of CP's build graph.
//
// The version-aware overlay logic lives in `@context-plane/shared/demo-seed`.
// This file just declares the bundled JSONs + seed version.
//
// To roll out updated examples to existing visitors, bump SEED_VERSION
// to today's date and re-publish.

import { applyDemoSeeds } from '$lib/cp-shared-demo-seed';
import type { ContractModel } from '../types';
import { migrateModel } from './contract.svelte';

import stripeCustomersSeed from '$data/stripe-customers-contract.json';
import stripeSubscriptionsSeed from '$data/stripe-subscriptions-contract.json';
import stripeInvoicesSeed from '$data/stripe-invoices-contract.json';

const LS_KEY = 'data-contract-demo-models';
const SEED_VERSION_KEY = 'data-contract-demo-seed-version';

/** Bump when bundled JSONs change. ISO date format. */
const SEED_VERSION = '2026-05-05';

const SEEDS: ContractModel[] = [
	stripeCustomersSeed as unknown as ContractModel,
	stripeSubscriptionsSeed as unknown as ContractModel,
	stripeInvoicesSeed as unknown as ContractModel
];

/**
 * Apply demo seeds. Call from `+page.svelte` `onMount` BEFORE `initStore()`,
 * gated by `VITE_DEMO_MODE === 'true'`.
 */
export function applyDemoSeedsContract(): void {
	applyDemoSeeds<ContractModel>({
		lsKey: LS_KEY,
		seedVersionKey: SEED_VERSION_KEY,
		seedVersion: SEED_VERSION,
		seeds: SEEDS,
		migrate: (m) => migrateModel(m)
	});
}

/** Backward-compat alias — same name the old +page.svelte imports. */
export const seedDemoIfEmpty = applyDemoSeedsContract;
