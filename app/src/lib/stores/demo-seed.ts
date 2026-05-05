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
// `applyDemoSeeds()` runs once at SA app startup when
// `VITE_DEMO_MODE=true`. It uses a version-aware overlay strategy:
//
//   - First visit (empty localStorage):
//       Seeds every example contract.
//   - Returning visitor with stored version === SEED_VERSION:
//       No-op. User-edited state wins.
//   - Returning visitor with stored version < SEED_VERSION (or no version):
//       Overlays the seed contracts BY ID — overwrites any existing
//       contract whose ID matches a seed (user edits to bundled examples
//       are lost; this is intentional, that's how a "we shipped new
//       examples" announcement reaches existing users). Contracts the
//       user CREATED with new IDs are left untouched.
//
// To roll out updated examples to existing visitors, bump SEED_VERSION
// to today's date and re-publish. Each release that changes any of
// the bundled JSONs MUST bump this constant.

import type { ContractModel } from '../types';
import { migrateModel } from './contract.svelte';

import stripeCustomersSeed from '$data/stripe-customers-contract.json';
import stripeSubscriptionsSeed from '$data/stripe-subscriptions-contract.json';
import stripeInvoicesSeed from '$data/stripe-invoices-contract.json';

const LS_KEY = 'data-contract-demo-models';
const SEED_VERSION_KEY = 'data-contract-demo-seed-version';

/**
 * Bump this when the bundled example JSONs change. ISO date format keeps
 * comparisons trivial (`!==`) and self-documents when the change shipped.
 */
const SEED_VERSION = '2026-05-05';

const SEEDS: ContractModel[] = [
	stripeCustomersSeed as unknown as ContractModel,
	stripeSubscriptionsSeed as unknown as ContractModel,
	stripeInvoicesSeed as unknown as ContractModel
];

/**
 * Seed the demo localStorage with the bundled example contracts. Call this
 * from the standalone `+page.svelte` `onMount` BEFORE `initStore()`, gated
 * by `VITE_DEMO_MODE === 'true'`.
 *
 * Behaviour:
 *  - Empty localStorage → seed every example.
 *  - Stored seed version matches → no-op.
 *  - Stored seed version is older / missing → overlay (overwrite by ID,
 *    leave user-created contracts untouched).
 */
export function applyDemoSeeds(): void {
	if (typeof window === 'undefined') return;

	let existing: Record<string, ContractModel> = {};
	try {
		const raw = localStorage.getItem(LS_KEY);
		existing = raw ? JSON.parse(raw) : {};
	} catch {
		existing = {};
	}

	const storedVersion = localStorage.getItem(SEED_VERSION_KEY);
	const isFresh = Object.keys(existing).length === 0;
	const seedVersionStale = storedVersion !== SEED_VERSION;

	if (!isFresh && !seedVersionStale) return;

	const merged: Record<string, ContractModel> = { ...existing };
	for (const m of SEEDS) {
		const migrated = migrateModel(JSON.parse(JSON.stringify(m)) as Record<string, unknown>);
		merged[migrated.id] = migrated;
	}
	localStorage.setItem(LS_KEY, JSON.stringify(merged));
	localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
}

/**
 * Backward-compat alias. The old name was accurate when the function only
 * ran on empty localStorage; now it also runs on version changes. Kept so
 * existing call sites don't break, but new code should use `applyDemoSeeds`.
 */
export const seedDemoIfEmpty = applyDemoSeeds;
