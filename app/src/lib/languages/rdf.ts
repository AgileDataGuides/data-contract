/**
 * RDF 1.1 terms, the well-known namespaces, and a small triple index.
 *
 * Shared by the Turtle and RDF/XML readers and writers (rdf-turtle.ts,
 * rdf-xml.ts) and by the Concept Model translation (concept-model-rdf.ts).
 * No dependencies, so it runs in the browser, in Node and in the public
 * repos that bundle this folder (decision 20261006-02).
 */

export interface NamedNode {
	termType: 'NamedNode';
	value: string;
}

export interface BlankNode {
	termType: 'BlankNode';
	value: string;
}

export interface Literal {
	termType: 'Literal';
	value: string;
	/** Always set: xsd:string for a plain string, rdf:langString when `language` is set. */
	datatype: string;
	/** Empty unless the literal carries a language tag. */
	language: string;
}

export type Term = NamedNode | BlankNode | Literal;
export type Subject = NamedNode | BlankNode;

export interface Triple {
	subject: Subject;
	predicate: NamedNode;
	object: Term;
}

// ── Namespaces ──────────────────────────────────────────────────────────

export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const SKOS = 'http://www.w3.org/2004/02/skos/core#';
export const DCTERMS = 'http://purl.org/dc/terms/';
export const DC = 'http://purl.org/dc/elements/1.1/';
export const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export const RDF_TYPE = `${RDF}type`;
export const RDF_FIRST = `${RDF}first`;
export const RDF_REST = `${RDF}rest`;
export const RDF_NIL = `${RDF}nil`;
export const RDF_LANG_STRING = `${RDF}langString`;
export const RDF_XML_LITERAL = `${RDF}XMLLiteral`;
export const XSD_STRING = `${XSD}string`;
export const XSD_BOOLEAN = `${XSD}boolean`;
export const XSD_INTEGER = `${XSD}integer`;
export const XSD_DECIMAL = `${XSD}decimal`;
export const XSD_DOUBLE = `${XSD}double`;
export const XSD_NON_NEGATIVE_INTEGER = `${XSD}nonNegativeInteger`;

// ── Term factories ──────────────────────────────────────────────────────

export function namedNode(value: string): NamedNode {
	return { termType: 'NamedNode', value };
}

export function blankNode(value: string): BlankNode {
	return { termType: 'BlankNode', value };
}

/** A literal. The second argument is a datatype IRI, or `{ language }` for a language-tagged string. */
export function literal(value: string, typeOrLanguage?: string | { language: string }): Literal {
	if (typeof typeOrLanguage === 'object' && typeOrLanguage.language) {
		return { termType: 'Literal', value, datatype: RDF_LANG_STRING, language: typeOrLanguage.language };
	}
	const datatype = typeof typeOrLanguage === 'string' && typeOrLanguage ? typeOrLanguage : XSD_STRING;
	return { termType: 'Literal', value, datatype, language: '' };
}

export function triple(subject: Subject, predicate: string | NamedNode, object: Term): Triple {
	return { subject, predicate: typeof predicate === 'string' ? namedNode(predicate) : predicate, object };
}

/** A key that is equal for two equal terms, for use in a Map or Set. */
export function termKey(term: Term): string {
	switch (term.termType) {
		case 'NamedNode':
			return `<${term.value}>`;
		case 'BlankNode':
			return `_:${term.value}`;
		case 'Literal':
			return `"${term.value}"@${term.language.toLowerCase()}^^${term.datatype}`;
	}
}

/** Blank node labels unique within one document, so two parsed documents never share one. */
export function blankNodeFactory(prefix = 'b'): {
	fresh: () => BlankNode;
	labelled: (label: string) => BlankNode;
} {
	let count = 0;
	const byLabel = new Map<string, BlankNode>();
	const fresh = () => blankNode(`${prefix}${++count}`);
	return {
		fresh,
		labelled(label: string) {
			let node = byLabel.get(label);
			if (!node) {
				node = fresh();
				byLabel.set(label, node);
			}
			return node;
		}
	};
}

// ── IRIs ────────────────────────────────────────────────────────────────

const IRI_PARTS = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;

interface IriParts {
	scheme?: string;
	authority?: string;
	path: string;
	query?: string;
	fragment?: string;
}

function splitIri(iri: string): IriParts {
	// A group that did not take part in the match is undefined, so "no authority" and "empty authority" differ
	const m = IRI_PARTS.exec(iri)!;
	return {
		scheme: m[1],
		authority: m[2],
		path: m[3] ?? '',
		query: m[4],
		fragment: m[5]
	};
}

function removeDotSegments(path: string): string {
	const input = path.split('/');
	const output: string[] = [];
	for (let i = 0; i < input.length; i++) {
		const segment = input[i];
		const last = i === input.length - 1;
		if (segment === '.') {
			if (last) output.push('');
		} else if (segment === '..') {
			if (output.length > 1 || (output.length === 1 && output[0] !== '')) output.pop();
			if (last) output.push('');
		} else {
			output.push(segment);
		}
	}
	return output.join('/');
}

/**
 * Resolve a relative IRI against a base, by RFC 3986 § 5.2. An absolute
 * reference comes back unchanged. With no base, a relative reference also
 * comes back unchanged, so it still names one thing within the document.
 */
export function resolveIri(reference: string, base: string | undefined): string {
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference) || !base) return reference;
	const b = splitIri(base);
	const r = splitIri(reference);
	let authority: string | undefined;
	let path: string;
	let query: string | undefined;
	if (r.authority !== undefined) {
		authority = r.authority;
		path = removeDotSegments(r.path);
		query = r.query;
	} else {
		authority = b.authority;
		if (r.path === '') {
			path = b.path;
			query = r.query !== undefined ? r.query : b.query;
		} else {
			if (r.path.startsWith('/')) {
				path = removeDotSegments(r.path);
			} else {
				const merged =
					b.authority !== undefined && b.path === ''
						? `/${r.path}`
						: `${b.path.slice(0, b.path.lastIndexOf('/') + 1)}${r.path}`;
				path = removeDotSegments(merged);
			}
			query = r.query;
		}
	}
	let out = b.scheme !== undefined ? `${b.scheme}:` : '';
	if (authority !== undefined) out += `//${authority}`;
	out += path;
	if (query !== undefined) out += `?${query}`;
	if (r.fragment !== undefined) out += `#${r.fragment}`;
	return out;
}

/** The last part of an IRI after `#`, `/` or `:`, for a human-readable fallback name. */
export function iriLocalName(iri: string): string {
	const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'), iri.lastIndexOf(':'));
	return cut >= 0 ? iri.slice(cut + 1) : iri;
}

// ── Errors ──────────────────────────────────────────────────────────────

/** A file that breaks its grammar. The message names the line and column. */
export class RdfSyntaxError extends Error {
	readonly line: number;
	readonly column: number;

	constructor(message: string, text: string, position: number) {
		const before = text.slice(0, position);
		// A line ends at a line feed, a carriage return or both, as the Turtle grammar reads it
		const line = before.split(/\r\n|\r|\n/).length;
		const column = position - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
		super(`${message} (line ${line}, column ${column})`);
		this.name = 'RdfSyntaxError';
		this.line = line;
		this.column = column;
	}
}

// ── Writing: which subjects go where ────────────────────────────────────

export interface RdfWriteOptions {
	/** Prefix to namespace IRI. '' is the empty prefix. Only the prefixes the output uses are declared. */
	prefixes: Record<string, string>;
	/** Comment lines at the top of the file. */
	header?: string[];
	/** A comment line written before a top-level subject, keyed by termKey(subject). */
	sections?: Map<string, string>;
}

export interface SubjectBlock {
	subject: Subject;
	/** Each predicate once, rdf:type first, then in first-seen order, with its objects in order. */
	predicates: { predicate: string; objects: Term[] }[];
}

export interface TripleLayout {
	/** Subjects written at the top level, in first-seen order. */
	topLevel: SubjectBlock[];
	/** Blank nodes written in place at their one reference, by blank node label. */
	inline: Map<string, SubjectBlock>;
}

/** Inline blank nodes nest no deeper than this, so a long RDF list never runs the writer out of stack. */
const MAX_INLINE_DEPTH = 32;

/**
 * Group triples by subject for a writer. A blank node that is the object of
 * exactly one triple is written in place there (Turtle `[ … ]`, a nested
 * RDF/XML node). Any other subject is written at the top level. A duplicate
 * triple is written once, because a graph is a set.
 */
export function layoutTriples(triples: Triple[]): TripleLayout {
	const blocks = new Map<string, SubjectBlock>();
	const order: string[] = [];
	const seen = new Set<string>();
	const references = new Map<string, number>();

	for (const t of triples) {
		const key = termKey(t.subject);
		const tripleKey = `${key} <${t.predicate.value}> ${termKey(t.object)}`;
		if (seen.has(tripleKey)) continue;
		seen.add(tripleKey);
		let block = blocks.get(key);
		if (!block) {
			block = { subject: t.subject, predicates: [] };
			blocks.set(key, block);
			order.push(key);
		}
		let entry = block.predicates.find((p) => p.predicate === t.predicate.value);
		if (!entry) {
			entry = { predicate: t.predicate.value, objects: [] };
			block.predicates.push(entry);
		}
		entry.objects.push(t.object);
		if (t.object.termType === 'BlankNode') references.set(t.object.value, (references.get(t.object.value) ?? 0) + 1);
	}

	for (const block of blocks.values()) {
		const at = block.predicates.findIndex((p) => p.predicate === RDF_TYPE);
		if (at > 0) block.predicates.unshift(...block.predicates.splice(at, 1));
	}

	const candidate = (value: string) => references.get(value) === 1;
	const inline = new Map<string, SubjectBlock>();
	const placed = new Set<string>();

	// Walk down from a top-level block, placing each single-use blank node inside its parent
	const placeChildren = (start: SubjectBlock) => {
		const stack: { block: SubjectBlock; depth: number }[] = [{ block: start, depth: 0 }];
		while (stack.length > 0) {
			const { block, depth } = stack.pop()!;
			if (depth >= MAX_INLINE_DEPTH) continue;
			for (const p of block.predicates) {
				for (const o of p.objects) {
					if (o.termType !== 'BlankNode' || !candidate(o.value) || placed.has(o.value)) continue;
					placed.add(o.value);
					const child = blocks.get(termKey(o)) ?? { subject: o, predicates: [] };
					inline.set(o.value, child);
					stack.push({ block: child, depth: depth + 1 });
				}
			}
		}
	};

	const topLevel: SubjectBlock[] = [];
	for (const key of order) {
		const block = blocks.get(key)!;
		if (block.subject.termType === 'BlankNode' && candidate(block.subject.value)) continue;
		topLevel.push(block);
		placeChildren(block);
	}
	// Single-use blank nodes that only refer to each other (a cycle), or sit too deep, are written at the top level
	for (const key of order) {
		const block = blocks.get(key)!;
		if (block.subject.termType !== 'BlankNode' || !candidate(block.subject.value) || placed.has(block.subject.value)) continue;
		placed.add(block.subject.value);
		topLevel.push(block);
		placeChildren(block);
	}
	return { topLevel, inline };
}

/** Text with any lone UTF-16 surrogate replaced, so a writer never emits a broken character. */
export function wellFormedText(text: string): string {
	return text.replace(/[\u{D800}-\u{DFFF}]/gu, '\u{FFFD}');
}

// ── A small index over parsed triples ───────────────────────────────────

/** Triples by subject, in document order, with the lookups a translator needs. */
export class TripleIndex {
	readonly triples: Triple[];
	private bySubject = new Map<string, Triple[]>();
	private byObject = new Map<string, Triple[]>();

	constructor(triples: Triple[]) {
		this.triples = triples;
		for (const t of triples) {
			const s = termKey(t.subject);
			const o = termKey(t.object);
			let list = this.bySubject.get(s);
			if (!list) this.bySubject.set(s, (list = []));
			list.push(t);
			let back = this.byObject.get(o);
			if (!back) this.byObject.set(o, (back = []));
			back.push(t);
		}
	}

	/** Every object of `subject predicate ?`, in document order. */
	objects(subject: Term, predicate: string): Term[] {
		return (this.bySubject.get(termKey(subject)) ?? []).filter((t) => t.predicate.value === predicate).map((t) => t.object);
	}

	/** Every subject of `? predicate object`, in document order. */
	subjects(predicate: string, object: Term): Subject[] {
		return (this.byObject.get(termKey(object)) ?? []).filter((t) => t.predicate.value === predicate).map((t) => t.subject);
	}

	/** Every subject typed `type`, in document order, each once. */
	subjectsOfType(type: string): Subject[] {
		const seen = new Set<string>();
		return this.subjects(RDF_TYPE, namedNode(type)).filter((s) => !seen.has(termKey(s)) && !!seen.add(termKey(s)));
	}

	types(subject: Term): string[] {
		return this.objects(subject, RDF_TYPE).flatMap((o) => (o.termType === 'NamedNode' ? [o.value] : []));
	}

	hasType(subject: Term, type: string): boolean {
		return this.types(subject).includes(type);
	}

	/** Every triple with this subject, in document order. */
	about(subject: Term): Triple[] {
		return this.bySubject.get(termKey(subject)) ?? [];
	}
}
