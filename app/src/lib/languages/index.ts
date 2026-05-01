/**
 * Language registry — maps language IDs to Language implementations.
 *
 * Usage:
 *   import { getLanguage, listLanguages } from '$lib/languages';
 *   const bitol = getLanguage('bitol');
 *   const yaml = bitol?.export(graphData, rootNodeId);
 */

import type { Language } from './types.js';
import { bitol } from './bitol.js';
import { osi } from './osi.js';
import { dbtMetricflow } from './dbt-metricflow.js';
import { malloy } from './malloy.js';
import { openmetadata } from './openmetadata.js';

export type { Language, GraphData, ValidationResult } from './types.js';

const registry: Record<string, Language> = {
	bitol,
	osi,
	'dbt-metricflow': dbtMetricflow,
	malloy,
	openmetadata
};

/** Look up a language by ID. Returns undefined if not registered. */
export function getLanguage(id: string): Language | undefined {
	return registry[id];
}

/** List all registered languages. */
export function listLanguages(): Language[] {
	return Object.values(registry);
}

/** Re-export individual languages for direct import if preferred. */
export { bitol, osi, dbtMetricflow, malloy, openmetadata };
