/**
 * Shared patterns catalog — the 27 Data Architecture pattern types from the
 * Layered Data Architecture Checklist, reused by the Data Contract's
 * "Manage Patterns" tab and any future canvas that consumes patterns.
 *
 * Source of truth is the JSON under `packages/shared/data/patterns/`.
 *
 * Each SA app gets a filtered copy of these JSONs in its own `data/lookups/`
 * via `scripts/sync-patterns.sh`, scoped to the canvases that SA app hosts.
 * Inside the Context Plane, the canvas that's rendering filters via
 * `getPatternsForCanvas(canvasId)`.
 *
 * A pattern has:
 *   - `id` (kebab-case slug, e.g. `change-detection`)
 *   - `name` (human label)
 *   - `order` (display order on the Patterns tab)
 *   - `multiSelect` (does the cell allow multiple values?)
 *   - `appliesTo` (array of canvas IDs the pattern is relevant on, e.g.
 *     `["canvas_checklist", "canvas_data_contract"]`. If the field is
 *     missing or empty the pattern is treated as applying to every canvas
 *     — that's the back-compat default for older pattern files.)
 *
 * The lookup + dictionary files add, for every pattern:
 *   - `lookups[id]: string[]` — the valid values
 *   - `dictionary.patterns[id]: string` — description of the pattern itself
 *   - `dictionary.values[id]: Record<value, description>` — description of each value
 *
 * Per-architecture / per-contract overrides are stored as graph nodes with
 * `patternId` + `lookupValues` + `valueDescriptions` + `patternDescription`
 * properties. Apps merge static + overrides to produce the final list.
 */
import patternsJson from './patterns/patterns.json';
import lookupsJson from './patterns/lookups.json';
import dictionaryJson from './patterns/dictionary.json';

export interface Pattern {
	id: string;
	name: string;
	order: number;
	multiSelect: boolean;
	/**
	 * Array of canvas IDs this pattern is relevant on. Missing / empty =
	 * applies everywhere (back-compat default for older files).
	 */
	appliesTo?: string[];
}

export type PatternLookups = Record<string, string[]>;
export interface PatternDictionary {
	patterns: Record<string, string>;
	values: Record<string, Record<string, string>>;
}

const patterns: Pattern[] = (patternsJson as { patterns: Pattern[] }).patterns;
const lookups: PatternLookups = lookupsJson as PatternLookups;
const dictionary: PatternDictionary = dictionaryJson as PatternDictionary;

/** Predicate: does this pattern apply on the given canvas? */
function appliesToCanvas(p: Pattern, canvasId: string): boolean {
	// Missing / empty `appliesTo` → applies everywhere (back-compat).
	if (!p.appliesTo || p.appliesTo.length === 0) return true;
	return p.appliesTo.includes(canvasId);
}

/** Return a fresh copy of every pattern sorted by `order`. */
export function listPatterns(): Pattern[] {
	return [...patterns].sort((a, b) => a.order - b.order);
}

/**
 * Return the patterns that apply to a specific canvas, sorted by `order`.
 * The primary filter every canvas should use — the Checklist passes
 * `'canvas_checklist'`; the Data Contract passes `'canvas_data_contract'`.
 *
 * Patterns with no `appliesTo` are treated as applying everywhere, so older
 * pattern files (or community-contributed patterns that didn't tag) keep
 * working without explicit migration.
 */
export function getPatternsForCanvas(canvasId: string): Pattern[] {
	return patterns
		.filter((p) => appliesToCanvas(p, canvasId))
		.sort((a, b) => a.order - b.order);
}

/** Find a pattern by id (kebab-case). Returns `undefined` if unknown. */
export function getPattern(id: string): Pattern | undefined {
	return patterns.find((p) => p.id === id);
}

/** Valid values for a pattern. Returns `[]` for unknown ids. */
export function getPatternValues(id: string): string[] {
	return [...(lookups[id] ?? [])];
}

/** Description of a pattern. Returns `''` for unknown ids. */
export function getPatternDescription(id: string): string {
	return dictionary.patterns[id] ?? '';
}

/** Description of a single value within a pattern. Returns `''` if missing. */
export function getValueDescription(patternId: string, value: string): string {
	return dictionary.values[patternId]?.[value] ?? '';
}

/** Full value → description map for a pattern. Returns empty object if unknown. */
export function getValueDescriptions(patternId: string): Record<string, string> {
	return { ...(dictionary.values[patternId] ?? {}) };
}

// Raw exports for apps that want to clone the full objects (used by the
// Checklist + Data Contract Patterns tabs to seed override nodes).
export const rawPatterns = patterns;
export const rawLookups = lookups;
export const rawDictionary = dictionary;
