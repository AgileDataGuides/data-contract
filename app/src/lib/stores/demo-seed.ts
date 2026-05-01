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
// `seedDemoIfEmpty()` runs once at SA app startup when
// `VITE_DEMO_MODE=true`. It checks localStorage; if the demo store is
// empty, it migrates and writes each example contract under the same
// localStorage key the store uses.

import type { ContractModel } from '../types';
import { migrateModel } from './contract.svelte';

import stripeCustomersSeed from '$data/stripe-customers-contract.json';
import stripeSubscriptionsSeed from '$data/stripe-subscriptions-contract.json';
import stripeInvoicesSeed from '$data/stripe-invoices-contract.json';

const LS_KEY = 'data-contract-demo-models';

const SEEDS: ContractModel[] = [
	stripeCustomersSeed as unknown as ContractModel,
	stripeSubscriptionsSeed as unknown as ContractModel,
	stripeInvoicesSeed as unknown as ContractModel
];

/**
 * Seed the demo localStorage with the bundled example contracts when empty.
 * Call this from the standalone `+page.svelte` `onMount` BEFORE `initStore()`,
 * gated by `VITE_DEMO_MODE === 'true'`. No-op if localStorage already has
 * any contracts (so user-modified state wins after the first visit).
 */
export function seedDemoIfEmpty(): void {
	if (typeof window === 'undefined') return;
	let existing: Record<string, unknown> = {};
	try {
		const raw = localStorage.getItem(LS_KEY);
		existing = raw ? JSON.parse(raw) : {};
	} catch {
		existing = {};
	}
	if (Object.keys(existing).length > 0) return;
	const seeded: Record<string, ContractModel> = {};
	for (const m of SEEDS) {
		const migrated = migrateModel(JSON.parse(JSON.stringify(m)) as Record<string, unknown>);
		seeded[migrated.id] = migrated;
	}
	localStorage.setItem(LS_KEY, JSON.stringify(seeded));
}
