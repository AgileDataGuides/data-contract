/**
 * Concept Models as RDF: the Turtle and RDF/XML languages.
 *
 * A Concept Model maps onto OWL 2 and SKOS (decision 20261006-01):
 *
 *   Concept Model        owl:Ontology, skos:ConceptScheme, cm:ConceptModel
 *   Concept              owl:Class and skos:Concept. Its Definition is
 *                        skos:definition (part one), skos:example (part two)
 *                        and skos:scopeNote (part three). Aliases are
 *                        skos:altLabel.
 *   Relationship         an owl:ObjectProperty from the source Concept to the
 *                        target, labelled with the verb, and an inverse
 *                        property (owl:inverseOf) labelled with the inverse
 *                        verb. Its Relationship Rule is OWL qualified
 *                        cardinality restrictions on each Concept, and the
 *                        rule words as cm:rule.
 *   Domain               skos:Collection (cm:Domain), its Concepts skos:member
 *   Core Business Event  cm:CoreBusinessEvent: cm:involves, cm:sitsOn,
 *                        cm:isAlsoConcept
 *
 * Everything with no OWL or SKOS term (the Blue Book working data, Map
 * positions, the 7W, the Definition status) uses the cm: vocabulary, so a
 * file round-trips. The Model's own terms sit under urn:concept-model:<slug>:
 * so a file never claims a web address nobody hosts.
 *
 * Export reads either Concept Model graph: the Concept Model app's (`cm_model`,
 * `has_core_event`, Blue Book fields as properties) or the Context Plane's
 * (`concept_model`, `has_event`, `cardinality` strings). Import writes the
 * Concept Model app's graph, which its converter reads into native JSON and
 * the Context Plane's `exportConceptModelJson` reads too.
 *
 * Import also reads RDF this app never wrote: owl:Class, rdfs:Class and
 * skos:Concept become Concepts; an object property whose domain and range are
 * Concepts becomes a Relationship, its rule read from cardinality
 * restrictions; rdfs:subClassOf, skos:broader and skos:related between
 * Concepts become Relationships too.
 */

import type { ContextLink, ContextNode } from '$lib/cp-shared';
import { getNodeLabels } from '$lib/cp-shared';
import type { GraphData, Language, ValidationResult } from './types.js';
import {
	type BlankNode,
	type Literal,
	type NamedNode,
	type Subject,
	type Term,
	type Triple,
	DC,
	DCTERMS,
	OWL,
	RDF,
	RDFS,
	RDF_TYPE,
	SKOS,
	TripleIndex,
	XSD,
	XSD_BOOLEAN,
	XSD_DECIMAL,
	XSD_DOUBLE,
	XSD_INTEGER,
	XSD_NON_NEGATIVE_INTEGER,
	blankNodeFactory,
	iriLocalName,
	literal,
	namedNode,
	termKey,
	triple
} from './rdf.js';
import { parseTurtle, writeTurtle } from './rdf-turtle.js';
import { parseRdfXml, writeRdfXml } from './rdf-xml.js';

/** The Concept Model vocabulary: what OWL and SKOS have no term for. */
export const CM = 'https://agiledataguides.github.io/concept-model/ns#';
const MODEL_IRI_PREFIX = 'urn:concept-model:';

// ── The native shapes this module reads and writes (mirrors apps/concept-model/app/src/lib/types.ts) ──

type Min = 'zero' | 'one';
type Max = 'one' | 'many';

interface RuleEnd {
	min: Min;
	max: Max;
}

interface Rule {
	forward?: RuleEnd;
	inverse?: RuleEnd;
}

interface Point {
	x: number;
	y: number;
}

// The code lists. A value outside its list is dropped on import.
const SEVEN_WS = ['who', 'what', 'when', 'where', 'why', 'how', 'how many'];
const DEFINITION_STATUSES = ['draft', 'agreed', 'flagged', 'disagreement'];
const SCOPE_SLICES = ['business-process', 'value-chain', 'organisational-design', 'business-capability', 'other'];
const PARTICIPANT_ROLES = ['subject-matter-expert', 'facilitator', 'data-team', 'stakeholder'];
const STORY_KINDS = ['happy-path', 'variation'];
const WALK_RESULTS = ['holds', 'stuck'];
const WALK_RESOLUTIONS = ['drawn', 'out-of-scope', 'parked'];
const PARKED_KINDS = ['attribute', 'measurement', 'out-of-scope', 'future-map', 'other'];
const STEP_IDS = [
	'scope',
	'subject-matter-expert',
	'stories',
	'concepts',
	'definitions',
	'relationships',
	'relationship-rules',
	// No longer a step (the Core Business Events have their own tab), kept so an older model's note on it round-trips
	'events',
	'map',
	'questions',
	'walk'
];

/** The Blue Book's Step 7 words for a rule end. A Map, so a file's "__proto__" or "constructor" finds nothing. */
const RULE_WORDS = new Map<string, RuleEnd>([
	['zero or one', { min: 'zero', max: 'one' }],
	['one', { min: 'one', max: 'one' }],
	['zero or many', { min: 'zero', max: 'many' }],
	['one or many', { min: 'one', max: 'many' }]
]);

function ruleWords(end: RuleEnd): string {
	if (end.max === 'one') return end.min === 'zero' ? 'zero or one' : 'one';
	return end.min === 'zero' ? 'zero or many' : 'one or many';
}

/** UML end strings, as the legacy `cardinality` property writes them ("1 : 1..*", source end first). A Map, like RULE_WORDS. */
const UML_ENDS = new Map<string, RuleEnd>([
	['1', { min: 'one', max: 'one' }],
	['1..1', { min: 'one', max: 'one' }],
	['0..1', { min: 'zero', max: 'one' }],
	['1..*', { min: 'one', max: 'many' }],
	['0..*', { min: 'zero', max: 'many' }],
	['*', { min: 'zero', max: 'many' }]
]);

function umlEnd(token: string | undefined): RuleEnd | undefined {
	if (!token) return undefined;
	const end = UML_ENDS.get(token.trim().toLowerCase().replace(/\s+/g, '').replace(/\.\.n$/, '..*'));
	return end ? { ...end } : undefined;
}

function endToUml(end: RuleEnd): string {
	if (end.max === 'one') return end.min === 'zero' ? '0..1' : '1';
	return end.min === 'zero' ? '0..*' : '1..*';
}

// ── Graph labels ────────────────────────────────────────────────────────

const ROOT_LABELS = ['cm_model', 'concept_model'];
const EVENT_LINKS = ['has_core_event', 'has_event'];
const PROCESS_LINKS = ['has_core_process', 'has_process'];
/** Links between member Concepts that are not Relationships. */
const STRUCTURAL = new Set([
	'has_concept',
	'has_core_event',
	'has_event',
	'has_core_process',
	'has_process',
	'has_domain',
	'answers',
	'event_involves_concept'
]);

/** Link labels that mean "related" with no verb: the app's fallback, and the Context Plane's generic link. */
const NO_VERB = new Set(['relates_to', 'related_to']);

/** Graph ids, as the Concept Model app's converter writes them. */
const graphId = {
	model: (id: string) => `cm_model_${id}`,
	concept: (id: string) => `cm_concept_${id}`,
	event: (id: string) => `cm_event_${id}`,
	process: (id: string) => `cm_process_${id}`,
	domain: (id: string) => `cm_domain_${id}`,
	question: (id: string) => `cm_question_${id}`,
	relationship: (id: string) => `link_rel_${id}`
};

// ── Small readers for untyped graph properties ──────────────────────────

function str(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function strList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [];
}

function num(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.map(record).filter((r): r is Record<string, unknown> => !!r) : [];
}

function oneOf(value: unknown, list: string[]): string | undefined {
	return typeof value === 'string' && list.includes(value) ? value : undefined;
}

function point(value: unknown): Point | undefined {
	const p = record(value);
	const x = num(p?.x);
	const y = num(p?.y);
	return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function ruleEnd(value: unknown): RuleEnd | undefined {
	const end = record(value);
	const min = oneOf(end?.min, ['zero', 'one']) as Min | undefined;
	const max = oneOf(end?.max, ['one', 'many']) as Max | undefined;
	return min && max ? { min, max } : undefined;
}

// ── Names ───────────────────────────────────────────────────────────────

/** Letters and digits only, accents folded: "Whānau Ora" → ["Whanau", "Ora"]. */
function words(text: string): string[] {
	return text
		.normalize('NFD')
		.replace(/[\u{300}-\u{36F}]/gu, '')
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
}

function upperCamel(text: string): string {
	return words(text)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join('');
}

function lowerCamel(text: string): string {
	const name = upperCamel(text);
	return name ? name[0].toLowerCase() + name.slice(1) : '';
}

function slug(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u{300}-\u{36F}]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** A native id the Concept Model app would mint: lowercase words joined by hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "SalesOrder", "sales_order" or "sales-order" as words: "Sales Order". */
function humanise(localName: string, capitalise: boolean): string {
	const spaced = localName
		.replace(/\.(owl|ttl|rdf|xml)$/i, '')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	if (!capitalise) return spaced.toLowerCase();
	return spaced.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Unique names within one space, with a counter on a clash. Each prefix (a
 * name and its joiner) keeps its own next counter, so a file with thousands of
 * Concepts of one name mints their ids in linear time, not quadratic. Keyed by
 * the prefix, the counter only skips names that are taken, so it mints the
 * same names as counting up from 2 each time.
 */
class NameSpace {
	private readonly used = new Set<string>();
	private readonly next = new Map<string, number>();

	take(name: string, joiner: string): string {
		let unique = name;
		if (this.used.has(unique)) {
			const prefix = `${name}${joiner}`;
			let i = this.next.get(prefix) ?? 2;
			while (this.used.has(`${prefix}${i}`)) i++;
			this.next.set(prefix, i + 1);
			unique = `${prefix}${i}`;
		}
		this.used.add(unique);
		return unique;
	}
}

// ── Export: graph → triples ─────────────────────────────────────────────

/** The triples for one Concept Model, with what a writer needs to lay them out. */
export interface ConceptModelRdf {
	triples: Triple[];
	prefixes: Record<string, string>;
	header: string[];
	sections: Map<string, string>;
}

interface Member {
	node: ContextNode;
	link: ContextLink;
}

/** Members in their order: `order` when set, else as linked. */
function inOrder(members: Member[]): Member[] {
	return members
		.map((m, i) => ({ m, i, at: num(m.node.properties?.order) ?? i + 1 }))
		.sort((a, b) => a.at - b.at || a.i - b.i)
		.map((x) => x.m);
}

/**
 * Translate one Concept Model in a graph into RDF triples. `rootNodeId`
 * picks the model when the graph holds several, otherwise the first is used.
 * Throws when the graph holds no Concept Model.
 */
export function conceptModelToRdf(data: GraphData, rootNodeId?: string): ConceptModelRdf {
	const { nodes, links } = data;
	const roots = nodes.filter((n) => getNodeLabels(n).some((l) => ROOT_LABELS.includes(l)));
	const root = rootNodeId ? roots.find((n) => n.id === rootNodeId) : roots[0];
	if (!root) throw new Error('There is no Concept Model to export.');

	const nodeById = new Map(nodes.map((n) => [n.id, n]));
	const membersOf = (linkLabels: string[], entity: string): Member[] => {
		const seen = new Set<string>();
		const found: Member[] = [];
		for (const link of links) {
			if (link.source_id !== root.id || !linkLabels.includes(link.label) || seen.has(link.destination_id)) continue;
			const node = nodeById.get(link.destination_id);
			if (!node || !getNodeLabels(node).includes(entity)) continue;
			seen.add(node.id);
			found.push({ node, link });
		}
		return inOrder(found);
	};

	const concepts = membersOf(['has_concept'], 'global_concept');
	const events = membersOf(EVENT_LINKS, 'global_core_business_event');
	const processes = membersOf(PROCESS_LINKS, 'global_core_business_process');
	const domains = membersOf(['has_domain'], 'global_domain');
	const questions = membersOf(['answers'], 'global_business_question');
	const props = root.properties ?? {};

	const sourceId = str(props.sourceId);
	const modelSlug = (sourceId && SLUG.test(sourceId) ? sourceId : slug(root.name)) || 'concept-model';
	const modelIri = `${MODEL_IRI_PREFIX}${modelSlug}`;
	const base = `${modelIri}:`;

	const triples: Triple[] = [];
	const sections = new Map<string, string>();
	const bnodes = blankNodeFactory('e');
	const names = new NameSpace();
	const add = (s: Subject, p: string, o: Term) => triples.push(triple(s, p, o));
	const addText = (s: Subject, p: string, value: unknown) => {
		if (typeof value === 'string' && value.trim() !== '') add(s, p, literal(value));
	};
	const addInteger = (s: Subject, p: string, value: unknown) => {
		if (typeof value === 'number' && Number.isInteger(value)) add(s, p, literal(String(value), XSD_INTEGER));
	};
	const addNumber = (s: Subject, p: string, value: number) => {
		if (Number.isInteger(value)) add(s, p, literal(String(value), XSD_INTEGER));
		else add(s, p, literal(String(value), /e/i.test(String(value)) ? XSD_DOUBLE : XSD_DECIMAL));
	};
	const addPosition = (s: Subject, at: Point | undefined) => {
		if (!at) return;
		addNumber(s, `${CM}mapX`, at.x);
		addNumber(s, `${CM}mapY`, at.y);
	};
	const section = (s: Subject, title: string) => sections.set(termKey(s), title);
	/** A member's own IRI: its native id where it is a clean slug, else its name as a slug. */
	const memberIri = (id: string | undefined, name: string, fallback: string) =>
		namedNode(base + names.take((id && SLUG.test(id) ? id : slug(name)) || fallback, '-'));

	const layout = record(props.layout);
	const layoutOf = (key: 'concepts' | 'events' | 'domains', id: string) => point(record(layout?.[key])?.[id]);

	// ── The model ──
	const model = namedNode(modelIri);
	section(model, 'The Concept Model');
	add(model, RDF_TYPE, namedNode(`${OWL}Ontology`));
	add(model, RDF_TYPE, namedNode(`${SKOS}ConceptScheme`));
	add(model, RDF_TYPE, namedNode(`${CM}ConceptModel`));
	addText(model, `${RDFS}label`, root.name);
	addText(model, `${SKOS}prefLabel`, root.name);
	addText(model, `${RDFS}comment`, root.description);
	const scope = record(props.scope);
	if (scope) {
		addText(model, `${CM}scopeStatement`, scope.statement);
		addText(model, `${CM}scopeSlicedBy`, oneOf(scope.slicedBy, SCOPE_SLICES));
	}
	const stepNotes = record(props.stepNotes);
	for (const step of STEP_IDS) {
		const note = record(stepNotes?.[step]);
		if (!note || (note.skipped !== true && !str(note.note))) continue;
		const b = bnodes.fresh();
		add(model, `${CM}stepNote`, b);
		addText(b, `${CM}step`, step);
		if (note.skipped === true) add(b, `${CM}skipped`, literal('true', XSD_BOOLEAN));
		addText(b, `${CM}note`, note.note);
	}

	// ── People and stories (Steps 2 and 3) ──
	const participantIri = new Map<string, NamedNode>();
	records(props.participants).forEach((p, i) => {
		const name = str(p.name) ?? '';
		const iri = memberIri(str(p.id), name, 'participant');
		if (i === 0) section(iri, 'People (Step 2)');
		if (str(p.id)) participantIri.set(p.id as string, iri);
		add(iri, RDF_TYPE, namedNode(`${CM}Participant`));
		addText(iri, `${RDFS}label`, name);
		for (const role of strList(p.roles)) addText(iri, `${CM}role`, oneOf(role, PARTICIPANT_ROLES));
		addText(iri, `${SKOS}editorialNote`, p.notes);
	});

	const storyIri = new Map<string, NamedNode>();
	records(props.stories).forEach((s, i) => {
		const name = str(s.name) ?? '';
		const iri = memberIri(str(s.id), name, 'story');
		if (i === 0) section(iri, 'Business Stories (Step 3)');
		if (str(s.id)) storyIri.set(s.id as string, iri);
		add(iri, RDF_TYPE, namedNode(`${CM}BusinessStory`));
		addText(iri, `${RDFS}label`, name);
		addText(iri, `${CM}storyText`, s.text);
		addText(iri, `${CM}storyKind`, oneOf(s.kind, STORY_KINDS));
		const teller = participantIri.get(str(s.toldBy) ?? '');
		if (teller) add(iri, `${CM}toldBy`, teller);
		// The story's Stakeholders: the other Step 2 people it matters to, one triple each
		for (const id of strList(s.stakeholderIds)) {
			const stakeholder = participantIri.get(id);
			if (stakeholder) add(iri, `${CM}stakeholder`, stakeholder);
		}
		addInteger(iri, `${CM}order`, s.order);
	});

	// ── Domains (Step 1) ──
	const domainIri = new Map<string, NamedNode>();
	domains.forEach(({ node }, i) => {
		const iri = memberIri(str(node.properties?.sourceId), node.name, 'domain');
		if (i === 0) section(iri, 'Domains');
		domainIri.set(node.id, iri);
		const p = node.properties ?? {};
		add(iri, RDF_TYPE, namedNode(`${CM}Domain`));
		add(iri, RDF_TYPE, namedNode(`${SKOS}Collection`));
		addText(iri, `${RDFS}label`, node.name);
		addText(iri, `${SKOS}prefLabel`, node.name);
		addText(iri, `${RDFS}comment`, node.description);
		for (const alias of strList(p.aliases)) addText(iri, `${SKOS}altLabel`, alias);
		addText(iri, `${CM}owner`, p.owner);
		addInteger(iri, `${CM}order`, p.order);
		addText(iri, `${SKOS}editorialNote`, p.notes);
		addPosition(iri, layoutOf('domains', node.id));
	});

	// ── Concepts (Steps 4 and 5) ──
	const conceptIri = new Map<string, NamedNode>();
	concepts.forEach(({ node, link }, i) => {
		const iri = namedNode(base + names.take(upperCamel(node.name) || 'Concept', ''));
		if (i === 0) section(iri, 'Concepts (Steps 4 and 5)');
		conceptIri.set(node.id, iri);
		const p = node.properties ?? {};
		const placement = link.properties ?? {};
		add(iri, RDF_TYPE, namedNode(`${OWL}Class`));
		add(iri, RDF_TYPE, namedNode(`${SKOS}Concept`));
		addText(iri, `${RDFS}label`, node.name);
		addText(iri, `${SKOS}prefLabel`, node.name);
		addText(iri, `${SKOS}definition`, node.description);
		for (const alias of strList(p.aliases)) addText(iri, `${SKOS}altLabel`, alias);
		for (const example of strList(p.examples)) addText(iri, `${SKOS}example`, example);
		for (const special of strList(p.specialCases)) addText(iri, `${SKOS}scopeNote`, special);
		add(iri, `${SKOS}inScheme`, model);
		addText(iri, `${CM}definitionCategory`, p.definitionCategory);
		addText(iri, `${CM}definitionDifferentiator`, p.definitionDifferentiator);
		addText(iri, `${CM}definitionStatus`, oneOf(p.definitionStatus, DEFINITION_STATUSES));
		addText(iri, `${CM}definitionDisagreement`, p.definitionDisagreement);
		addText(iri, `${CM}sevenW`, oneOf(p.w, SEVEN_WS));
		// Only a Metric says so. The standalone Concept Model drops it on import.
		addText(iri, `${CM}conceptKind`, p.conceptKind === 'metric' ? 'metric' : undefined);
		addInteger(iri, `${CM}order`, p.order);
		addText(iri, `${SKOS}editorialNote`, p.notes);
		for (const storyId of strList(placement.storyIds)) {
			const story = storyIri.get(storyId);
			if (story) add(iri, `${CM}foundInStory`, story);
		}
		addPosition(iri, layoutOf('concepts', node.id));
		const domain = domainIri.get(str(placement.domainId) ?? '');
		if (domain) add(domain, `${SKOS}member`, iri);
	});

	// ── Relationships and their rules (Steps 6 and 7) ──
	const relationshipIri = new Map<string, NamedNode>();
	const restrict = (cls: NamedNode, property: NamedNode, filler: NamedNode, end: RuleEnd) => {
		// "Zero or many" says nothing an OWL restriction can add
		const kind =
			end.max === 'one'
				? end.min === 'one'
					? 'qualifiedCardinality'
					: 'maxQualifiedCardinality'
				: end.min === 'one'
					? 'minQualifiedCardinality'
					: undefined;
		if (!kind) return;
		const r = bnodes.fresh();
		add(cls, `${RDFS}subClassOf`, r);
		add(r, RDF_TYPE, namedNode(`${OWL}Restriction`));
		add(r, `${OWL}onProperty`, property);
		add(r, `${OWL}${kind}`, literal('1', XSD_NON_NEGATIVE_INTEGER));
		add(r, `${OWL}onClass`, filler);
	};
	let firstRelationship = true;
	for (const link of links) {
		if (STRUCTURAL.has(link.label)) continue;
		const source = conceptIri.get(link.source_id);
		const target = conceptIri.get(link.destination_id);
		if (!source || !target) continue;
		const sourceName = nodeById.get(link.source_id)!.name;
		const targetName = nodeById.get(link.destination_id)!.name;
		const p = link.properties ?? {};
		const verb = str(p.verb) ?? (NO_VERB.has(link.label) ? '' : link.label);
		const inverseVerb = str(p.inverseLabel) ?? '';
		const rule = readRule(p);

		const forwardName = names.take(lowerCamel(`${sourceName} ${verb || 'relates to'} ${targetName}`) || 'relationship', '');
		const forward = namedNode(base + forwardName);
		if (firstRelationship) section(forward, 'Relationships (Step 6) and their Relationship Rules (Step 7)');
		firstRelationship = false;
		relationshipIri.set(link.id, forward);
		// The inverse property exists when there is an inverse verb or an inverse rule to hang on it
		const inverse =
			inverseVerb || rule.inverse
				? namedNode(base + names.take((inverseVerb && lowerCamel(`${targetName} ${inverseVerb} ${sourceName}`)) || `${forwardName}Inverse`, ''))
				: undefined;
		add(forward, RDF_TYPE, namedNode(`${OWL}ObjectProperty`));
		addText(forward, `${RDFS}label`, verb);
		add(forward, `${RDFS}domain`, source);
		add(forward, `${RDFS}range`, target);
		if (inverse) add(forward, `${OWL}inverseOf`, inverse);
		if (rule.forward) addText(forward, `${CM}rule`, ruleWords(rule.forward));
		addText(forward, `${CM}cardinality`, p.cardinality);
		if (p.flagged === true) add(forward, `${CM}flagged`, literal('true', XSD_BOOLEAN));

		if (inverse) {
			add(inverse, RDF_TYPE, namedNode(`${OWL}ObjectProperty`));
			addText(inverse, `${RDFS}label`, inverseVerb);
			add(inverse, `${RDFS}domain`, target);
			add(inverse, `${RDFS}range`, source);
			if (rule.inverse) addText(inverse, `${CM}rule`, ruleWords(rule.inverse));
		}
		if (rule.forward) restrict(source, forward, target, rule.forward);
		if (rule.inverse && inverse) restrict(target, inverse, source, rule.inverse);
	}

	// ── Core Business Events (their own tab, once Step 8) ──
	events.forEach(({ node }, i) => {
		const iri = memberIri(str(node.properties?.sourceId), node.name, 'event');
		if (i === 0) section(iri, 'Core Business Events');
		const p = node.properties ?? {};
		add(iri, RDF_TYPE, namedNode(`${CM}CoreBusinessEvent`));
		addText(iri, `${RDFS}label`, node.name);
		addText(iri, `${RDFS}comment`, node.description);
		addInteger(iri, `${CM}order`, p.order);
		const involved = new Set<string>();
		for (const link of links) {
			if (link.source_id !== node.id || link.label !== 'event_involves_concept') continue;
			const concept = conceptIri.get(link.destination_id);
			if (!concept || involved.has(concept.value)) continue;
			involved.add(concept.value);
			add(iri, `${CM}involves`, concept);
		}
		const sitsOn = relationshipIri.get(str(p.relationshipId) ?? '');
		if (sitsOn) add(iri, `${CM}sitsOn`, sitsOn);
		const isAlso = conceptIri.get(str(p.conceptId) ?? '');
		if (isAlso) add(iri, `${CM}isAlsoConcept`, isAlso);
		addText(iri, `${SKOS}editorialNote`, p.notes);
		addPosition(iri, layoutOf('events', node.id));
	});

	// ── Core Business Processes (dormant, kept so files round-trip) ──
	processes.forEach(({ node }, i) => {
		const iri = memberIri(str(node.properties?.sourceId), node.name, 'process');
		if (i === 0) section(iri, 'Core Business Processes');
		add(iri, RDF_TYPE, namedNode(`${CM}CoreBusinessProcess`));
		addText(iri, `${RDFS}label`, node.name);
		addText(iri, `${RDFS}comment`, node.description);
		addInteger(iri, `${CM}order`, node.properties?.order);
		addText(iri, `${SKOS}editorialNote`, node.properties?.notes);
	});

	// ── Business Questions, walks and the parked list (Steps 9 and 10) ──
	const questionIri = new Map<string, NamedNode>();
	questions.forEach(({ node }, i) => {
		const iri = memberIri(str(node.properties?.sourceId), node.name, 'question');
		if (i === 0) section(iri, 'Business Questions (Step 9)');
		questionIri.set(node.id, iri);
		add(iri, RDF_TYPE, namedNode(`${CM}BusinessQuestion`));
		addText(iri, `${RDFS}label`, node.name);
		addText(iri, `${RDFS}comment`, node.description);
		const asker = participantIri.get(str(node.properties?.askedBy) ?? '');
		if (asker) add(iri, `${CM}askedBy`, asker);
		addInteger(iri, `${CM}order`, node.properties?.order);
	});

	let firstWalk = true;
	for (const w of records(props.walks)) {
		const subject = record(w.subject);
		const walked = subject?.type === 'story' ? storyIri.get(str(subject.id) ?? '') : questionIri.get(str(subject?.id) ?? '');
		const result = oneOf(w.result, WALK_RESULTS);
		if (!walked || !result) continue;
		const iri = memberIri(str(w.id), `walk ${iriLocalName(walked.value)}`, 'walk');
		if (firstWalk) section(iri, 'Walks (Steps 9 and 10)');
		firstWalk = false;
		add(iri, RDF_TYPE, namedNode(`${CM}Walk`));
		add(iri, `${CM}walked`, walked);
		addText(iri, `${CM}result`, result);
		addText(iri, `${CM}finding`, w.finding);
		addText(iri, `${CM}resolution`, oneOf(w.resolution, WALK_RESOLUTIONS));
	}

	records(props.parked).forEach((item, i) => {
		const text = str(item.text) ?? '';
		const iri = memberIri(str(item.id), text, 'parked');
		if (i === 0) section(iri, 'Parked');
		add(iri, RDF_TYPE, namedNode(`${CM}ParkedItem`));
		addText(iri, `${RDFS}label`, text);
		addText(iri, `${CM}parkedKind`, oneOf(item.kind, PARKED_KINDS));
		addText(iri, `${CM}parkedFrom`, item.note);
	});

	// ── Declare the cm: terms used, so OWL tools read them as annotations ──
	const classes = new Set<string>();
	const annotations = new Set<string>();
	for (const t of triples) {
		if (t.predicate.value.startsWith(CM)) annotations.add(t.predicate.value);
		if (t.predicate.value === RDF_TYPE && t.object.termType === 'NamedNode' && t.object.value.startsWith(CM)) classes.add(t.object.value);
	}
	let firstTerm = true;
	for (const [terms, kind] of [
		[classes, 'Class'],
		[annotations, 'AnnotationProperty']
	] as const) {
		for (const term of [...terms].sort()) {
			const iri = namedNode(term);
			if (firstTerm) section(iri, 'The Concept Model vocabulary used above');
			firstTerm = false;
			add(iri, RDF_TYPE, namedNode(`${OWL}${kind}`));
		}
	}

	return {
		triples,
		prefixes: { '': base, cm: CM, owl: OWL, rdf: RDF, rdfs: RDFS, skos: SKOS, xsd: XSD },
		header: [
			`Concept Model "${root.name}", as OWL 2 and SKOS.`,
			'Each Concept is an OWL class and a SKOS concept. Each Relationship is an OWL object property,',
			'and its Relationship Rule is OWL cardinality restrictions. The cm: terms hold what OWL and SKOS have no word for.',
			`The Model's own terms sit under <${base}>. Replace that namespace with your own before you publish the file.`
		],
		sections
	};
}

/** A Relationship's rule: the 2.0 `rule`, else the legacy `cardinality` string, else the Context Plane Map's end strings. */
function readRule(p: Record<string, unknown>): Rule {
	const rule = record(p.rule);
	const forward = ruleEnd(rule?.forward);
	const inverse = ruleEnd(rule?.inverse);
	if (forward || inverse) return { forward, inverse };
	const legacy = str(p.cardinality)?.split(':');
	if (legacy?.length === 2) {
		const sourceEnd = umlEnd(legacy[0]);
		const targetEnd = umlEnd(legacy[1]);
		if (sourceEnd && targetEnd) return { forward: targetEnd, inverse: sourceEnd };
	}
	return { forward: umlEnd(str(p.dstCardinality)), inverse: umlEnd(str(p.srcCardinality)) };
}

// ── Import: triples → graph ─────────────────────────────────────────────

const CONCEPT_TYPES = new Set([`${OWL}Class`, `${RDFS}Class`, `${SKOS}Concept`]);
const PROPERTY_TYPES = new Set([`${OWL}ObjectProperty`, `${RDF}Property`]);
const RESERVED = [RDF, RDFS, OWL, XSD, SKOS, CM, DCTERMS, DC];

function isReserved(iri: string): boolean {
	return RESERVED.some((ns) => iri.startsWith(ns));
}

/** Untagged literals first, then English, then any. A file with ten languages imports one. */
function preferred(terms: Term[]): Literal[] {
	const literals = terms.filter((t): t is Literal => t.termType === 'Literal');
	const plain = literals.filter((l) => !l.language);
	if (plain.length > 0) return plain;
	const english = literals.filter((l) => /^en(-|$)/i.test(l.language));
	return english.length > 0 ? english : literals;
}

/**
 * Read a Concept Model from RDF triples into the Concept Model app's graph.
 * The model node's name is empty when the file has no title, so the caller
 * can name it after the file. Throws when the file holds no Concepts and no
 * Concept Model.
 */
export function rdfToConceptModel(triples: Triple[]): GraphData {
	const index = new TripleIndex(triples);
	const ours = index.subjectsOfType(`${CM}ConceptModel`).length > 0;

	const text = (s: Term, ...predicates: string[]): string | undefined => {
		for (const p of predicates) {
			const value = preferred(index.objects(s, p))[0]?.value;
			if (value !== undefined && value !== '') return value;
		}
		return undefined;
	};
	const texts = (s: Term, p: string) => preferred(index.objects(s, p)).map((l) => l.value).filter(Boolean);
	const integer = (s: Term, p: string) => {
		const n = Number(text(s, p));
		return Number.isInteger(n) ? n : undefined;
	};
	const flag = (s: Term, p: string) => {
		const v = text(s, p);
		return v === 'true' || v === '1';
	};
	const iris = (s: Term, p: string) => index.objects(s, p).filter((o): o is NamedNode => o.termType === 'NamedNode');
	const position = (s: Term): Point | undefined => {
		const x = Number(text(s, `${CM}mapX`));
		const y = Number(text(s, `${CM}mapY`));
		return Number.isFinite(x) && Number.isFinite(y) && text(s, `${CM}mapX`) !== undefined && text(s, `${CM}mapY`) !== undefined
			? { x, y }
			: undefined;
	};
	/** Subjects typed with any of `types`, in the order the file types them. */
	const typed = (types: Set<string>, keep: (s: Subject) => boolean = () => true): Subject[] => {
		const seen = new Set<string>();
		const found: Subject[] = [];
		for (const t of triples) {
			if (t.predicate.value !== RDF_TYPE || t.object.termType !== 'NamedNode' || !types.has(t.object.value)) continue;
			const key = termKey(t.subject);
			if (seen.has(key) || !keep(t.subject)) continue;
			seen.add(key);
			found.push(t.subject);
		}
		return found;
	};
	/** A native id: the IRI's last part where it is a clean slug (this app's own files), else the name as a slug. */
	const nativeId = (ids: NameSpace, s: Subject, name: string, fallback: string) => {
		const local = s.termType === 'NamedNode' ? iriLocalName(s.value) : '';
		return ids.take((SLUG.test(local) ? local : slug(name)) || fallback, '-');
	};

	// ── The model ──
	const modelSubject =
		index.subjectsOfType(`${CM}ConceptModel`)[0] ??
		index.subjectsOfType(`${OWL}Ontology`)[0] ??
		index.subjectsOfType(`${SKOS}ConceptScheme`)[0];
	const modelName = modelSubject
		? (text(modelSubject, `${SKOS}prefLabel`, `${RDFS}label`, `${DCTERMS}title`, `${DC}title`) ??
			(modelSubject.termType === 'NamedNode' ? humanise(iriLocalName(modelSubject.value), true) : ''))
		: '';
	const modelDescription = modelSubject
		? (text(modelSubject, `${RDFS}comment`, `${DCTERMS}description`, `${SKOS}definition`, `${DC}description`) ?? '')
		: '';

	// ── Concepts ──
	const conceptSubjects = typed(CONCEPT_TYPES, (s) => s.termType === 'NamedNode' && !isReserved(s.value)) as NamedNode[];
	if (conceptSubjects.length === 0 && !ours) {
		throw new Error('The file holds no Concepts. A Concept is an owl:Class, an rdfs:Class or a skos:Concept.');
	}
	const conceptIds = new NameSpace();
	const conceptIdOf = new Map<string, string>();
	const concepts = conceptSubjects.map((s, i) => {
		const name = text(s, `${SKOS}prefLabel`, `${RDFS}label`) ?? humanise(iriLocalName(s.value), true);
		const id = conceptIds.take(slug(name) || slug(iriLocalName(s.value)) || 'concept', '-');
		conceptIdOf.set(s.value, id);
		return {
			s,
			id,
			name,
			description: text(s, `${SKOS}definition`, `${RDFS}comment`, `${DCTERMS}description`) ?? '',
			aliases: texts(s, `${SKOS}altLabel`),
			order: integer(s, `${CM}order`) ?? i + 1,
			definitionCategory: text(s, `${CM}definitionCategory`),
			definitionDifferentiator: text(s, `${CM}definitionDifferentiator`),
			examples: texts(s, `${SKOS}example`),
			specialCases: texts(s, `${SKOS}scopeNote`),
			definitionStatus: oneOf(text(s, `${CM}definitionStatus`), DEFINITION_STATUSES),
			definitionDisagreement: text(s, `${CM}definitionDisagreement`),
			w: oneOf(text(s, `${CM}sevenW`), SEVEN_WS),
			conceptKind: text(s, `${CM}conceptKind`) === 'metric' ? ('metric' as const) : undefined,
			notes: text(s, `${SKOS}editorialNote`, `${SKOS}note`),
			storyIris: iris(s, `${CM}foundInStory`).map((o) => o.value),
			at: position(s)
		};
	});
	const conceptOf = (term: Term | undefined) => (term?.termType === 'NamedNode' ? conceptIdOf.get(term.value) : undefined);

	// ── Domains ──
	const domainIds = new NameSpace();
	const domainOfConcept = new Map<string, string>();
	const domains = typed(new Set([`${CM}Domain`, `${SKOS}Collection`]), (s) => !modelSubject || termKey(s) !== termKey(modelSubject)).map(
		(s, i) => {
			const name = text(s, `${SKOS}prefLabel`, `${RDFS}label`) ?? (s.termType === 'NamedNode' ? humanise(iriLocalName(s.value), true) : 'Domain');
			const id = nativeId(domainIds, s, name, 'domain');
			for (const member of index.objects(s, `${SKOS}member`)) {
				const concept = conceptOf(member);
				if (concept && !domainOfConcept.has(concept)) domainOfConcept.set(concept, id);
			}
			return {
				id,
				name,
				description: text(s, `${RDFS}comment`, `${SKOS}definition`) ?? '',
				aliases: texts(s, `${SKOS}altLabel`),
				owner: text(s, `${CM}owner`),
				order: integer(s, `${CM}order`) ?? i + 1,
				notes: text(s, `${SKOS}editorialNote`, `${SKOS}note`),
				at: position(s)
			};
		}
	);

	// ── Relationships ──
	interface RelationshipSpec {
		id: string;
		sourceId: string;
		targetId: string;
		label: string;
		inverseLabel?: string;
		rule: Rule;
		cardinality?: string;
		flagged?: boolean;
	}
	const relationships: RelationshipSpec[] = [];
	const relationshipIds = new NameSpace();
	const relationshipOfProperty = new Map<string, string>();
	const seenRelationship = new Set<string>();
	const addRelationship = (spec: Omit<RelationshipSpec, 'id'>, properties: string[] = []) => {
		// Each OWL property is its own Relationship. A hierarchy or association link is one per pair and verb.
		const key = `${spec.sourceId}|${spec.label}|${spec.targetId}`;
		if (properties.length === 0 && seenRelationship.has(key)) return;
		seenRelationship.add(key);
		const id = relationshipIds.take(`${spec.sourceId}-${slug(spec.label) || 'relates-to'}-${spec.targetId}`, '-');
		const both = spec.rule.forward && spec.rule.inverse;
		relationships.push({
			...spec,
			id,
			cardinality: spec.cardinality ?? (both ? `${endToUml(spec.rule.inverse!)} : ${endToUml(spec.rule.forward!)}` : undefined)
		});
		for (const p of properties) relationshipOfProperty.set(p, id);
	};

	// A property's one domain or range, when that is a Concept
	const conceptEnd = (property: string, predicate: string) => {
		const ends = iris(namedNode(property), predicate);
		return ends.length === 1 ? conceptIdOf.get(ends[0].value) : undefined;
	};
	const conceptIriOf = new Map([...conceptIdOf].map(([iri, id]) => [id, iri]));
	// Each class's restrictions by property, built once, so a class with thousands of
	// restrictions is not re-scanned for every Relationship
	const restrictionsOf = new Map<string, BlankNode[]>();
	for (const t of triples) {
		if (t.predicate.value !== `${RDFS}subClassOf` || t.subject.termType !== 'NamedNode' || t.object.termType !== 'BlankNode') continue;
		for (const on of iris(t.object, `${OWL}onProperty`)) {
			const key = `${t.subject.value}|${on.value}`;
			const list = restrictionsOf.get(key) ?? [];
			list.push(t.object);
			restrictionsOf.set(key, list);
		}
	}
	const restrictionEnd = (classId: string, property: string): RuleEnd | undefined => {
		const cls = conceptIriOf.get(classId);
		if (!cls) return undefined;
		let min: number | undefined;
		let max: number | undefined;
		for (const r of restrictionsOf.get(`${cls}|${property}`) ?? []) {
			const count = (name: string) => {
				const n = Number(text(r, `${OWL}${name}`));
				return Number.isInteger(n) && n >= 0 && text(r, `${OWL}${name}`) !== undefined ? n : undefined;
			};
			const exact = count('qualifiedCardinality') ?? count('cardinality');
			const low = count('minQualifiedCardinality') ?? count('minCardinality');
			const high = count('maxQualifiedCardinality') ?? count('maxCardinality');
			if (exact !== undefined) {
				min = exact;
				max = exact;
			}
			if (low !== undefined) min = Math.max(min ?? 0, low);
			if (high !== undefined) max = Math.min(max ?? Infinity, high);
			if (index.objects(r, `${OWL}someValuesFrom`).length > 0) min = Math.max(min ?? 0, 1);
		}
		if (min === undefined && max === undefined) return undefined;
		return { min: (min ?? 0) >= 1 ? 'one' : 'zero', max: max !== undefined && max <= 1 ? 'one' : 'many' };
	};
	const ruleOf = (property: string, classId: string): RuleEnd | undefined => {
		const word = text(namedNode(property), `${CM}rule`)?.toLowerCase().replace(/-/g, ' ');
		const end = word ? RULE_WORDS.get(word) : undefined;
		return (end ? { ...end } : undefined) ?? restrictionEnd(classId, property);
	};
	const verbOf = (property: string): string | undefined => {
		const label = text(namedNode(property), `${RDFS}label`, `${SKOS}prefLabel`);
		if (label !== undefined || ours) return label;
		return humanise(iriLocalName(property), false);
	};

	// Pair each property with its inverse. The property that states owl:inverseOf leads.
	const partner = new Map<string, { other: string; leads: boolean }>();
	for (const t of triples) {
		if (t.predicate.value !== `${OWL}inverseOf` || t.subject.termType !== 'NamedNode' || t.object.termType !== 'NamedNode') continue;
		const p = t.subject.value;
		const q = t.object.value;
		if (p === q || partner.has(p) || partner.has(q)) continue;
		partner.set(p, { other: q, leads: true });
		partner.set(q, { other: p, leads: false });
	}
	const properties: string[] = [];
	const listed = new Set<string>();
	for (const t of triples) {
		const candidates =
			t.predicate.value === RDF_TYPE && t.object.termType === 'NamedNode' && PROPERTY_TYPES.has(t.object.value)
				? [t.subject]
				: t.predicate.value === `${OWL}inverseOf`
					? [t.subject, t.object]
					: [];
		for (const c of candidates) {
			if (c.termType !== 'NamedNode' || isReserved(c.value) || listed.has(c.value)) continue;
			listed.add(c.value);
			properties.push(c.value);
		}
	}
	for (const property of properties) {
		const pair = partner.get(property);
		const forward = pair && !pair.leads ? pair.other : property;
		if (relationshipOfProperty.has(forward)) continue;
		const inverse = pair ? (pair.leads ? pair.other : property) : undefined;
		const sourceId = conceptEnd(forward, `${RDFS}domain`) ?? (inverse ? conceptEnd(inverse, `${RDFS}range`) : undefined);
		const targetId = conceptEnd(forward, `${RDFS}range`) ?? (inverse ? conceptEnd(inverse, `${RDFS}domain`) : undefined);
		if (!sourceId || !targetId) continue;
		addRelationship(
			{
				sourceId,
				targetId,
				label: verbOf(forward) ?? '',
				inverseLabel: inverse ? verbOf(inverse) : undefined,
				rule: { forward: ruleOf(forward, sourceId), inverse: inverse ? ruleOf(inverse, targetId) : undefined },
				cardinality: text(namedNode(forward), `${CM}cardinality`),
				flagged: flag(namedNode(forward), `${CM}flagged`) || undefined
			},
			inverse ? [forward, inverse] : [forward]
		);
	}

	// Hierarchy and association between Concepts, from ontologies and vocabularies this app did not write
	for (const t of triples) {
		const a = conceptOf(t.subject);
		const b = conceptOf(t.object);
		if (!a || !b || a === b) continue;
		switch (t.predicate.value) {
			case `${RDFS}subClassOf`:
				addRelationship({
					sourceId: a,
					targetId: b,
					label: 'is a kind of',
					inverseLabel: 'can be',
					rule: { forward: { min: 'one', max: 'one' }, inverse: { min: 'zero', max: 'one' } }
				});
				break;
			case `${SKOS}broader`:
				addRelationship({ sourceId: a, targetId: b, label: 'is narrower than', inverseLabel: 'is broader than', rule: {} });
				break;
			case `${SKOS}narrower`:
				addRelationship({ sourceId: b, targetId: a, label: 'is narrower than', inverseLabel: 'is broader than', rule: {} });
				break;
			case `${SKOS}related`:
				if (!seenRelationship.has(`${b}|is related to|${a}`)) {
					addRelationship({ sourceId: a, targetId: b, label: 'is related to', inverseLabel: 'is related to', rule: {} });
				}
				break;
		}
	}

	// ── People, stories, questions ──
	const participantIds = new NameSpace();
	const participantOf = new Map<string, string>();
	const participants = typed(new Set([`${CM}Participant`])).map((s) => {
		const name = text(s, `${RDFS}label`, `${SKOS}prefLabel`) ?? '';
		const id = nativeId(participantIds, s, name, 'participant');
		participantOf.set(termKey(s), id);
		const roles = [...new Set(texts(s, `${CM}role`).filter((r) => PARTICIPANT_ROLES.includes(r)))];
		return { id, name, roles, ...(text(s, `${SKOS}editorialNote`) ? { notes: text(s, `${SKOS}editorialNote`) } : {}) };
	});
	const personOf = (s: Term, p: string) => {
		const o = index.objects(s, p)[0];
		return o && o.termType !== 'Literal' ? participantOf.get(termKey(o)) : undefined;
	};

	const storyIds = new NameSpace();
	const storyOf = new Map<string, string>();
	const stories = typed(new Set([`${CM}BusinessStory`])).map((s, i) => {
		const name = text(s, `${RDFS}label`, `${SKOS}prefLabel`) ?? '';
		const id = nativeId(storyIds, s, name, 'story');
		storyOf.set(termKey(s), id);
		const toldBy = personOf(s, `${CM}toldBy`);
		const stakeholderIds = [
			...new Set(
				index
					.objects(s, `${CM}stakeholder`)
					.filter((o) => o.termType !== 'Literal')
					.map((o) => participantOf.get(termKey(o)))
					.filter((id): id is string => !!id)
			)
		];
		return {
			id,
			name,
			text: text(s, `${CM}storyText`) ?? '',
			kind: oneOf(text(s, `${CM}storyKind`), STORY_KINDS) ?? 'happy-path',
			...(toldBy ? { toldBy } : {}),
			...(stakeholderIds.length > 0 ? { stakeholderIds } : {}),
			order: integer(s, `${CM}order`) ?? i + 1
		};
	});

	const questionIds = new NameSpace();
	const questionOf = new Map<string, string>();
	const questions = typed(new Set([`${CM}BusinessQuestion`])).map((s, i) => {
		const name = text(s, `${RDFS}label`, `${SKOS}prefLabel`) ?? '';
		const id = nativeId(questionIds, s, name, 'question');
		questionOf.set(termKey(s), id);
		return {
			id,
			name,
			description: text(s, `${RDFS}comment`),
			askedBy: personOf(s, `${CM}askedBy`),
			order: integer(s, `${CM}order`) ?? i + 1
		};
	});

	const walkIds = new NameSpace();
	const walks: Record<string, unknown>[] = [];
	for (const s of typed(new Set([`${CM}Walk`]))) {
		const walked = index.objects(s, `${CM}walked`)[0];
		const key = walked && walked.termType !== 'Literal' ? termKey(walked) : '';
		const storyId = storyOf.get(key);
		const questionId = questionOf.get(key);
		const result = oneOf(text(s, `${CM}result`), WALK_RESULTS);
		if ((!storyId && !questionId) || !result) continue;
		const resolution = oneOf(text(s, `${CM}resolution`), WALK_RESOLUTIONS);
		const finding = text(s, `${CM}finding`);
		walks.push({
			id: nativeId(walkIds, s, `walk ${storyId ?? questionId}`, 'walk'),
			// A walked question is held by its graph id, as the converter expects
			subject: storyId ? { type: 'story', id: storyId } : { type: 'question', id: graphId.question(questionId!) },
			result,
			...(finding ? { finding } : {}),
			...(resolution ? { resolution } : {})
		});
	}

	const parkedIds = new NameSpace();
	const parked = typed(new Set([`${CM}ParkedItem`])).map((s) => {
		const textValue = text(s, `${RDFS}label`, `${SKOS}prefLabel`) ?? '';
		const note = text(s, `${CM}parkedFrom`);
		return {
			id: nativeId(parkedIds, s, textValue, 'parked'),
			text: textValue,
			kind: oneOf(text(s, `${CM}parkedKind`), PARKED_KINDS) ?? 'other',
			...(note ? { note } : {})
		};
	});

	// ── Events and processes ──
	const eventIds = new NameSpace();
	const events = typed(new Set([`${CM}CoreBusinessEvent`])).map((s, i) => {
		const name = text(s, `${RDFS}label`, `${SKOS}prefLabel`) ?? (s.termType === 'NamedNode' ? humanise(iriLocalName(s.value), true) : 'Event');
		const sitsOn = iris(s, `${CM}sitsOn`)[0];
		return {
			id: nativeId(eventIds, s, name, 'event'),
			name,
			description: text(s, `${RDFS}comment`, `${DCTERMS}description`) ?? '',
			order: integer(s, `${CM}order`) ?? i + 1,
			involves: [...new Set(index.objects(s, `${CM}involves`).map(conceptOf).filter((c): c is string => !!c))],
			relationshipId: sitsOn ? relationshipOfProperty.get(sitsOn.value) : undefined,
			conceptId: conceptOf(iris(s, `${CM}isAlsoConcept`)[0]),
			notes: text(s, `${SKOS}editorialNote`, `${SKOS}note`),
			at: position(s)
		};
	});

	const processIds = new NameSpace();
	const processes = typed(new Set([`${CM}CoreBusinessProcess`])).map((s, i) => {
		const name = text(s, `${RDFS}label`, `${SKOS}prefLabel`) ?? '';
		return {
			id: nativeId(processIds, s, name, 'process'),
			name,
			description: text(s, `${RDFS}comment`) ?? '',
			order: integer(s, `${CM}order`) ?? i + 1,
			notes: text(s, `${SKOS}editorialNote`, `${SKOS}note`)
		};
	});

	// ── Model fields ──
	let scope: Record<string, unknown> | undefined;
	const stepNotes: Record<string, Record<string, unknown>> = {};
	if (modelSubject) {
		const statement = text(modelSubject, `${CM}scopeStatement`);
		const slicedBy = oneOf(text(modelSubject, `${CM}scopeSlicedBy`), SCOPE_SLICES);
		if (statement !== undefined || slicedBy) scope = { statement: statement ?? '', ...(slicedBy ? { slicedBy } : {}) };
		for (const b of index.objects(modelSubject, `${CM}stepNote`)) {
			const step = oneOf(text(b, `${CM}step`), STEP_IDS);
			if (!step) continue;
			const note = text(b, `${CM}note`);
			stepNotes[step] = { ...(flag(b, `${CM}skipped`) ? { skipped: true } : {}), ...(note ? { note } : {}) };
		}
	}
	// `concepts` and `events` are always in a layout, `domains` only once a sheet has moved
	const domainPoints = Object.fromEntries(domains.filter((d) => d.at).map((d) => [graphId.domain(d.id), d.at]));
	const layout = {
		concepts: Object.fromEntries(concepts.filter((c) => c.at).map((c) => [graphId.concept(c.id), c.at])),
		events: Object.fromEntries(events.filter((e) => e.at).map((e) => [graphId.event(e.id), e.at])),
		...(Object.keys(domainPoints).length > 0 ? { domains: domainPoints } : {})
	};
	const hasLayout = Object.keys(layout.concepts).length + Object.keys(layout.events).length + Object.keys(domainPoints).length > 0;

	// ── The graph, in the shape the Concept Model app's converter writes ──
	const modelId = slug(modelName) || 'imported';
	const now = new Date().toISOString();
	const stamp = { created_at: now, updated_at: now };
	const nodes: ContextNode[] = [];
	const links: ContextLink[] = [];
	const root = graphId.model(modelId);
	nodes.push({
		id: root,
		label: 'cm_model',
		name: modelName,
		description: modelDescription || null,
		properties: {
			sourceId: modelId,
			version: '2.0',
			...(scope ? { scope } : {}),
			...(participants.length ? { participants } : {}),
			...(stories.length ? { stories } : {}),
			...(walks.length ? { walks } : {}),
			...(parked.length ? { parked } : {}),
			...(Object.keys(stepNotes).length ? { stepNotes } : {}),
			...(hasLayout ? { layout } : {})
		},
		...stamp
	});

	for (const c of concepts) {
		const id = graphId.concept(c.id);
		nodes.push({
			id,
			label: 'global_concept,global_glossary_term',
			name: c.name,
			description: c.description || null,
			properties: {
				sourceId: c.id,
				aliases: c.aliases,
				order: c.order,
				definitionCategory: c.definitionCategory ?? '',
				definitionDifferentiator: c.definitionDifferentiator ?? '',
				examples: c.examples.length ? c.examples : undefined,
				specialCases: c.specialCases.length ? c.specialCases : undefined,
				definitionStatus: c.definitionStatus,
				definitionDisagreement: c.definitionDisagreement,
				w: c.w,
				conceptKind: c.conceptKind,
				notes: c.notes
			},
			...stamp
		});
		const domainId = domainOfConcept.get(c.id);
		const storyIdsOfConcept = c.storyIris.map((iri) => storyOf.get(`<${iri}>`)).filter((s): s is string => !!s);
		links.push({
			id: `link_model_concept_${c.id}`,
			source_id: root,
			destination_id: id,
			label: 'has_concept',
			properties: {
				domainId: domainId ? graphId.domain(domainId) : undefined,
				storyIds: storyIdsOfConcept.length ? storyIdsOfConcept : undefined
			},
			...stamp
		});
	}

	for (const r of relationships) {
		links.push({
			id: graphId.relationship(r.id),
			source_id: graphId.concept(r.sourceId),
			destination_id: graphId.concept(r.targetId),
			label: r.label || 'relates_to',
			properties: {
				sourceRelId: r.id,
				cardinality: r.cardinality,
				inverseLabel: r.inverseLabel || undefined,
				rule: r.rule.forward || r.rule.inverse ? { ...(r.rule.forward ? { forward: r.rule.forward } : {}), ...(r.rule.inverse ? { inverse: r.rule.inverse } : {}) } : undefined,
				flagged: r.flagged
			},
			...stamp
		});
	}

	for (const e of events) {
		const id = graphId.event(e.id);
		nodes.push({
			id,
			label: 'global_core_business_event',
			name: e.name,
			description: e.description || null,
			properties: {
				sourceId: e.id,
				order: e.order,
				notes: e.notes,
				relationshipId: e.relationshipId ? graphId.relationship(e.relationshipId) : undefined,
				conceptId: e.conceptId ? graphId.concept(e.conceptId) : undefined
			},
			...stamp
		});
		links.push({ id: `link_model_event_${e.id}`, source_id: root, destination_id: id, label: 'has_core_event', properties: {}, ...stamp });
		for (const conceptId of e.involves) {
			links.push({
				id: `link_evc_${e.id}__${conceptId}`,
				source_id: id,
				destination_id: graphId.concept(conceptId),
				label: 'event_involves_concept',
				properties: {},
				...stamp
			});
		}
	}

	for (const p of processes) {
		const id = graphId.process(p.id);
		nodes.push({
			id,
			label: 'global_core_business_process',
			name: p.name,
			description: p.description || null,
			properties: { sourceId: p.id, order: p.order, notes: p.notes },
			...stamp
		});
		links.push({ id: `link_model_process_${p.id}`, source_id: root, destination_id: id, label: 'has_core_process', properties: {}, ...stamp });
	}

	for (const d of domains) {
		const id = graphId.domain(d.id);
		nodes.push({
			id,
			label: 'global_domain',
			name: d.name,
			description: d.description || null,
			properties: { sourceId: d.id, order: d.order, owner: d.owner, aliases: d.aliases.length ? d.aliases : undefined, notes: d.notes },
			...stamp
		});
		links.push({ id: `link_model_domain_${d.id}`, source_id: root, destination_id: id, label: 'has_domain', properties: {}, ...stamp });
	}

	for (const q of questions) {
		const id = graphId.question(q.id);
		nodes.push({
			id,
			label: 'global_business_question',
			name: q.name,
			description: q.description ?? null,
			properties: { sourceId: q.id, order: q.order, askedBy: q.askedBy },
			...stamp
		});
		links.push({ id: `link_model_question_${q.id}`, source_id: root, destination_id: id, label: 'answers', properties: {}, ...stamp });
	}

	return { nodes, links };
}

// ── The two languages ───────────────────────────────────────────────────

const ENTITY_MAP: Record<string, string> = {
	cm_model: 'owl:Ontology, skos:ConceptScheme, cm:ConceptModel',
	concept_model: 'owl:Ontology, skos:ConceptScheme, cm:ConceptModel',
	global_concept: 'owl:Class, skos:Concept',
	global_domain: 'skos:Collection, cm:Domain',
	global_core_business_event: 'cm:CoreBusinessEvent',
	global_core_business_process: 'cm:CoreBusinessProcess',
	global_business_question: 'cm:BusinessQuestion'
};

const RELATIONSHIP_MAP: Record<string, string> = {
	has_concept: 'skos:inScheme (from the Concept)',
	has_domain: 'cm:Domain in the file, its Concepts as skos:member',
	has_core_event: 'cm:CoreBusinessEvent in the file',
	has_event: 'cm:CoreBusinessEvent in the file',
	answers: 'cm:BusinessQuestion in the file',
	event_involves_concept: 'cm:involves',
	relates_to: 'owl:ObjectProperty with rdfs:domain, rdfs:range and an owl:inverseOf partner'
};

const PROPERTY_MAP: Record<string, Record<string, string>> = {
	global_concept: {
		name: 'rdfs:label, skos:prefLabel',
		description: 'skos:definition',
		aliases: 'skos:altLabel',
		examples: 'skos:example',
		specialCases: 'skos:scopeNote',
		notes: 'skos:editorialNote',
		definitionCategory: 'cm:definitionCategory',
		definitionDifferentiator: 'cm:definitionDifferentiator',
		definitionStatus: 'cm:definitionStatus',
		definitionDisagreement: 'cm:definitionDisagreement',
		w: 'cm:sevenW',
		conceptKind: 'cm:conceptKind (written for a Metric only)',
		order: 'cm:order'
	},
	relationship: {
		label: 'rdfs:label on the property',
		inverseLabel: 'rdfs:label on the owl:inverseOf property',
		rule: 'owl:qualifiedCardinality restrictions, and cm:rule',
		cardinality: 'cm:cardinality',
		flagged: 'cm:flagged'
	},
	global_core_business_event: {
		conceptIds: 'cm:involves',
		relationshipId: 'cm:sitsOn',
		conceptId: 'cm:isAlsoConcept'
	}
};

function validator(parse: (content: string) => Triple[]) {
	return (content: string): ValidationResult => {
		try {
			rdfToConceptModel(parse(content));
			return { valid: true, errors: [] };
		} catch (e) {
			return { valid: false, errors: [(e as Error).message] };
		}
	};
}

const parseTurtleTriples = (content: string) => parseTurtle(content).triples;

/** Turtle (.ttl): Concept Models as OWL 2 and SKOS. */
export const turtle: Language = {
	id: 'turtle',
	name: 'Turtle',
	version: '1.1',
	fileExtension: 'ttl',
	mimeType: 'text/turtle',
	supportedEntities: Object.keys(ENTITY_MAP),
	entityMap: ENTITY_MAP,
	relationshipMap: RELATIONSHIP_MAP,
	propertyMap: PROPERTY_MAP,
	export(data, rootNodeId) {
		const rdf = conceptModelToRdf(data, rootNodeId);
		return writeTurtle(rdf.triples, rdf);
	},
	import(content) {
		return rdfToConceptModel(parseTurtleTriples(content));
	},
	validate: validator(parseTurtleTriples)
};

/** RDF/XML (.rdf): Concept Models as OWL 2 and SKOS, the format Protégé saves by default. */
export const rdfXml: Language = {
	id: 'rdf-xml',
	name: 'RDF/XML',
	version: '1.1',
	fileExtension: 'rdf',
	mimeType: 'application/rdf+xml',
	supportedEntities: Object.keys(ENTITY_MAP),
	entityMap: ENTITY_MAP,
	relationshipMap: RELATIONSHIP_MAP,
	propertyMap: PROPERTY_MAP,
	export(data, rootNodeId) {
		const rdf = conceptModelToRdf(data, rootNodeId);
		return writeRdfXml(rdf.triples, rdf);
	},
	import(content) {
		return rdfToConceptModel(parseRdfXml(content));
	},
	validate: validator((content) => parseRdfXml(content))
};

/**
 * Which RDF language a picked file is: by its extension first, then by its
 * first characters. Returns undefined for anything else (JSON, say), so the
 * caller falls back to its own formats.
 */
export function detectRdfLanguage(fileName: string, content: string): 'turtle' | 'rdf-xml' | undefined {
	const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	if (extension === 'ttl' || extension === 'turtle') return 'turtle';
	if (extension === 'rdf' || extension === 'owl' || extension === 'xml') return 'rdf-xml';
	if (extension === 'json' || extension === 'jsonld') return undefined;
	const start = content.replace(/^\u{FEFF}/u, '').trimStart();
	if (/^[{[]/.test(start)) return undefined;
	if (/^<(\?xml|!DOCTYPE|!--|[A-Za-z_][\w.-]*:RDF[\s>])/.test(start)) return 'rdf-xml';
	// A Turtle file starts with a comment, a directive, an IRI subject or a blank node
	if (/^(#|@prefix\s|@base\s|PREFIX\s|BASE\s|<[^>\s]*>|_:)/i.test(start)) return 'turtle';
	return undefined;
}
