/**
 * Typed helper for the shared Delivery Types catalog.
 *
 * The catalog lives as JSON at `packages/shared/data/delivery-types.json`
 * so non-TypeScript tooling (Claude skills, MCP servers, validation
 * scripts, external tools) can read it. This helper gives the UI a
 * typed API.
 *
 * Philosophy: every core AgileData object type that has a finite set
 * of predefined values (Delivery Type, future: Role, Stakeholder Type,
 * Support Channel Type) gets a catalog file under `packages/shared/data/`
 * and a helper under `packages/shared/src/data/`. External standards
 * (ODCS, OpenMetadata) are Languages — they translate catalog keys to
 * their own enums but never drive catalog design.
 */
import rawCatalog from './delivery-types.json';

export interface DeliveryTypeDef {
	key: string;
	label: string;
	category: string;
	description: string;
}

interface DeliveryTypesCatalog {
	types: Record<string, Omit<DeliveryTypeDef, 'key'>>;
	categoryOrder: string[];
	categoryLabels: Record<string, string>;
}

const catalog = rawCatalog as unknown as DeliveryTypesCatalog;

/** Every registered delivery type, ordered by category (catalog order) then label. */
export function listDeliveryTypes(): DeliveryTypeDef[] {
	const categoryIdx = new Map(catalog.categoryOrder.map((c, i) => [c, i]));
	return Object.entries(catalog.types)
		.map(([key, def]) => ({ key, ...def }))
		.sort((a, b) => {
			const ca = categoryIdx.get(a.category) ?? 999;
			const cb = categoryIdx.get(b.category) ?? 999;
			if (ca !== cb) return ca - cb;
			return a.label.localeCompare(b.label);
		});
}

/** Every delivery-type label in catalog order — handy for UI suggestion lists. */
export function listDeliveryTypeLabels(): string[] {
	return listDeliveryTypes().map((d) => d.label);
}

/** Lookup a single delivery type by key. */
export function getDeliveryType(key: string): DeliveryTypeDef | undefined {
	const def = catalog.types[key];
	return def ? { key, ...def } : undefined;
}

/** Lookup by label (case-insensitive). Falls back to 'custom' key on miss. */
export function getDeliveryTypeByLabel(label: string): DeliveryTypeDef | undefined {
	const lower = label.trim().toLowerCase();
	for (const [key, def] of Object.entries(catalog.types)) {
		if (def.label.toLowerCase() === lower) return { key, ...def };
	}
	return undefined;
}

/** Category keys in display order. */
export function listCategories(): string[] {
	return [...catalog.categoryOrder];
}

/** Human-readable label for a category key. */
export function getCategoryLabel(category: string): string {
	return catalog.categoryLabels[category] ?? category;
}
