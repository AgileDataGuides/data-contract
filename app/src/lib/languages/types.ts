/**
 * Language framework — translation layer between the Context Plane's native
 * vocabulary and external standards (Bitol ODCS, OWL, RDF, Snowflake Semantic, etc.).
 *
 * Each Language module defines:
 *   - entity/relationship/property translations
 *   - export(): CP graph → language format string (YAML/Turtle/JSON/etc.)
 *   - import(): language format string → CP graph
 *   - optional validate()
 *
 * Adding a new standard = adding one file in packages/shared/src/languages/
 * and registering it in index.ts. No core schema changes required.
 */

import type { ContextNode, ContextLink } from '$lib/cp-shared';

export interface GraphData {
	nodes: ContextNode[];
	links: ContextLink[];
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

export interface Language {
	/** Stable identifier, e.g. 'bitol', 'owl', 'rdf' */
	id: string;

	/** Human-readable name, e.g. 'Bitol ODCS' */
	name: string;

	/** Version of the language standard, e.g. '3.0.2' */
	version: string;

	/** File extension for exports, e.g. 'yaml', 'ttl', 'json' */
	fileExtension: string;

	/** MIME type for content-type headers */
	mimeType: string;

	/** Optional — which CP entity labels this language can represent */
	supportedEntities?: string[];

	/**
	 * Entity label → language-specific term (for documentation / UI display).
	 * Actual export logic is inside export().
	 */
	entityMap?: Record<string, string>;

	/**
	 * Relationship label → language-specific term.
	 */
	relationshipMap?: Record<string, string>;

	/**
	 * Per-entity property mapping: CP property name → language property name.
	 */
	propertyMap?: Record<string, Record<string, string>>;

	/**
	 * Serialise CP graph data to the language format.
	 * @param data The graph to export.
	 * @param rootNodeId Optional — scope export to one root node (e.g. a specific contract_model).
	 * @returns Language-formatted string (YAML/Turtle/JSON/etc.)
	 */
	export(data: GraphData, rootNodeId?: string): string;

	/**
	 * Parse a language-format string into CP graph data.
	 * @param content The language-formatted string.
	 * @returns { nodes, links } representing the parsed content.
	 */
	import(content: string): GraphData;

	/**
	 * Optional: validate a language-format string.
	 */
	validate?(content: string): ValidationResult;
}
