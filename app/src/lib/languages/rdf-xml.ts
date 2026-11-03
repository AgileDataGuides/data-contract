/**
 * RDF/XML (https://www.w3.org/TR/rdf-syntax-grammar/): a reader and a writer.
 *
 * The reader has its own small XML reader, because Node has no DOMParser and
 * Protégé writes RDF/XML with DTD entities (`<!ENTITY owl "…">` used as
 * `&owl;Thing`). It expands internal entities with a cap on depth and size,
 * and never fetches an external one. Over the XML it takes the RDF/XML
 * grammar: typed node elements, rdf:about, rdf:ID, rdf:nodeID, property
 * attributes, rdf:resource, rdf:datatype, xml:lang, xml:base, rdf:li, and
 * rdf:parseType Resource, Collection and Literal.
 *
 * The writer uses a typed node element (`<owl:Class rdf:about="…">`) where a
 * subject's first type has a QName, and nests single-use blank nodes.
 *
 * No dependencies (decision 20261006-02).
 */

import {
	type Literal,
	type RdfWriteOptions,
	type Subject,
	type SubjectBlock,
	type Term,
	type Triple,
	OWL,
	RDF,
	RDF_FIRST,
	RDF_LANG_STRING,
	RDF_NIL,
	RDF_REST,
	RDF_TYPE,
	RDF_XML_LITERAL,
	RdfSyntaxError,
	XML_NS,
	XSD_STRING,
	blankNodeFactory,
	layoutTriples,
	literal,
	namedNode,
	resolveIri,
	termKey,
	triple,
	wellFormedText
} from './rdf.js';

// ── A small XML reader ──────────────────────────────────────────────────

interface XmlName {
	/** The namespace IRI, or '' for none. */
	ns: string;
	local: string;
	qname: string;
}

interface XmlAttribute extends XmlName {
	value: string;
}

interface XmlElement {
	kind: 'element';
	name: XmlName;
	attributes: XmlAttribute[];
	children: XmlNode[];
	/** Where the start tag begins, for error messages. */
	at: number;
}

interface XmlText {
	kind: 'text';
	value: string;
}

type XmlNode = XmlElement | XmlText;

const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };
const NAME_START = /[A-Za-z_:\u{C0}-\u{D6}\u{D8}-\u{F6}\u{F8}-\u{2FF}\u{370}-\u{37D}\u{37F}-\u{1FFF}\u{200C}\u{200D}\u{2070}-\u{218F}\u{2C00}-\u{2FEF}\u{3001}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFFD}\u{D800}-\u{DBFF}]/u;
const NAME_CHAR = /[A-Za-z0-9_:.\-\u{B7}\u{C0}-\u{D6}\u{D8}-\u{F6}\u{F8}-\u{37D}\u{37F}-\u{1FFF}\u{200C}\u{200D}\u{203F}\u{2040}\u{2070}-\u{218F}\u{2C00}-\u{2FEF}\u{3001}-\u{D7FF}\u{F900}-\u{FDCF}\u{FDF0}-\u{FFFD}\u{D800}-\u{DFFF}]/u;

/**
 * Entities expand at most this deep and to at most this many characters in all, and each expands once
 * (see `expand`): a "billion laughs" file fails with a message, and one that fans out to empty text
 * finishes at once.
 */
const MAX_ENTITY_DEPTH = 8;
const MAX_ENTITY_CHARACTERS = 20_000_000;
/** Elements nest no deeper than this. */
const MAX_DEPTH = 512;

class XmlReader {
	/** The document with its line breaks normalised. Error positions count in this text. */
	readonly text: string;
	private pos = 0;
	private depth = 0;
	private expanded = 0;
	private readonly entities = new Map<string, string>();
	/**
	 * Each entity's expanded text and height, by name and by attribute or content, so a reference never
	 * re-walks its tree. The height counts the entities its expansion passes through: 1 for plain text.
	 */
	private readonly expansions = new Map<string, { text: string; height: number }>();
	/** The height of the tallest entity the last `expand` call met, 0 for none. */
	private tallest = 0;

	constructor(text: string) {
		// XML § 2.11: every line break reads as one line feed
		this.text = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
	}

	document(): XmlElement {
		this.misc(true);
		if (this.text[this.pos] !== '<') this.fail(this.pos >= this.text.length ? 'The document is empty' : 'The document does not start with an element');
		const root = this.element(new Map([['xml', XML_NS]]));
		this.misc(false);
		if (this.pos < this.text.length) this.fail('Content after the end of the document element');
		return root;
	}

	/** Comments, processing instructions, white space and (before the root) a DOCTYPE. */
	private misc(beforeRoot: boolean) {
		for (;;) {
			this.skipSpace();
			if (this.text.startsWith('<?', this.pos)) this.skipTo('?>', 'A processing instruction is not closed');
			else if (this.text.startsWith('<!--', this.pos)) this.skipTo('-->', 'A comment is not closed');
			else if (beforeRoot && this.text.startsWith('<!DOCTYPE', this.pos)) this.doctype();
			else return;
		}
	}

	private doctype() {
		this.pos += 9;
		for (;;) {
			const c = this.text[this.pos];
			if (c === undefined) this.fail('The DOCTYPE is not closed');
			if (c === '>') {
				this.pos++;
				return;
			}
			if (c === '[') {
				this.pos++;
				this.internalSubset();
			} else if (c === '"' || c === "'") {
				this.quoted();
			} else {
				this.pos++;
			}
		}
	}

	/** The DTD's internal subset. Only general entity declarations matter, the rest is skipped. */
	private internalSubset() {
		for (;;) {
			this.skipSpace();
			const c = this.text[this.pos];
			if (c === undefined) this.fail('The DOCTYPE subset is not closed with "]"');
			if (c === ']') {
				this.pos++;
				return;
			}
			if (this.text.startsWith('<!ENTITY', this.pos)) {
				this.entityDeclaration();
			} else if (this.text.startsWith('<!--', this.pos)) {
				this.skipTo('-->', 'A comment is not closed');
			} else if (this.text.startsWith('<?', this.pos)) {
				this.skipTo('?>', 'A processing instruction is not closed');
			} else if (this.text.startsWith('<!', this.pos)) {
				this.skipDeclaration();
			} else if (c === '%') {
				this.skipTo(';', 'A parameter entity reference is not closed');
			} else {
				this.fail('Unexpected content in the DOCTYPE');
			}
		}
	}

	private entityDeclaration() {
		this.pos += 8;
		this.skipSpace();
		// A parameter entity (`<!ENTITY % …>`) only shapes the DTD, which is not read
		if (this.text[this.pos] === '%') {
			this.skipDeclaration();
			return;
		}
		const name = this.name();
		this.skipSpace();
		const c = this.text[this.pos];
		if (c === '"' || c === "'") {
			const value = this.quoted();
			// The first declaration of an entity binds (XML § 4.2)
			if (!this.entities.has(name)) this.entities.set(name, value);
		}
		// An external entity (SYSTEM or PUBLIC) is never fetched, so it stays undefined
		this.skipDeclaration();
	}

	/** Skip to the `>` that ends a markup declaration, stepping over quoted strings. */
	private skipDeclaration() {
		for (;;) {
			const c = this.text[this.pos];
			if (c === undefined) this.fail('A declaration in the DOCTYPE is not closed');
			if (c === '>') {
				this.pos++;
				return;
			}
			if (c === '"' || c === "'") this.quoted();
			else this.pos++;
		}
	}

	private quoted(): string {
		const quote = this.text[this.pos];
		const end = this.text.indexOf(quote, this.pos + 1);
		if (end < 0) this.fail('A quoted value is not closed');
		const value = this.text.slice(this.pos + 1, end);
		this.pos = end + 1;
		return value;
	}

	private element(scope: Map<string, string>): XmlElement {
		const at = this.pos;
		if (++this.depth > MAX_DEPTH) this.fail(`Elements nest more than ${MAX_DEPTH} deep`);
		this.pos++;
		const qname = this.name();
		const raw: { qname: string; value: string }[] = [];
		let empty = false;
		for (;;) {
			this.skipSpace();
			if (this.text.startsWith('/>', this.pos)) {
				this.pos += 2;
				empty = true;
				break;
			}
			if (this.text[this.pos] === '>') {
				this.pos++;
				break;
			}
			if (this.pos >= this.text.length) this.fail(`The start tag <${qname}> is not closed`);
			const name = this.name();
			this.skipSpace();
			if (this.text[this.pos] !== '=') this.fail(`The attribute ${name} has no "="`);
			this.pos++;
			this.skipSpace();
			const c = this.text[this.pos];
			if (c !== '"' && c !== "'") this.fail(`The value of ${name} is not quoted`);
			const value = this.quoted();
			if (value.includes('<')) this.fail(`"<" inside the value of ${name}`);
			raw.push({ qname: name, value: this.expand(value.replace(/[\t\n]/g, ' '), true, 0) });
		}

		// Namespace declarations on this element are in scope for it and its children
		let inner = scope;
		for (const a of raw) {
			if (a.qname === 'xmlns' || a.qname.startsWith('xmlns:')) {
				if (inner === scope) inner = new Map(scope);
				inner.set(a.qname === 'xmlns' ? '' : a.qname.slice(6), a.value);
			}
		}
		const resolve = (q: string, isAttribute: boolean): XmlName => {
			const colon = q.indexOf(':');
			const prefix = colon < 0 ? '' : q.slice(0, colon);
			const local = colon < 0 ? q : q.slice(colon + 1);
			// An unprefixed attribute is in no namespace. An unprefixed element is in the default namespace.
			if (!prefix) return { ns: isAttribute ? '' : (inner.get('') ?? ''), local, qname: q };
			const ns = inner.get(prefix);
			if (ns === undefined) this.fail(`The namespace prefix "${prefix}" is not declared`);
			return { ns, local, qname: q };
		};
		const name = resolve(qname, false);
		const attributes = raw
			.filter((a) => a.qname !== 'xmlns' && !a.qname.startsWith('xmlns:'))
			.map((a) => ({ ...resolve(a.qname, true), value: a.value }));

		const children: XmlNode[] = [];
		const addText = (value: string) => {
			const last = children[children.length - 1];
			if (last?.kind === 'text') last.value += value;
			else children.push({ kind: 'text', value });
		};
		if (!empty) {
			for (;;) {
				if (this.pos >= this.text.length) this.fail(`<${qname}> is not closed`);
				if (this.text.startsWith('</', this.pos)) {
					this.pos += 2;
					const end = this.name();
					this.skipSpace();
					if (this.text[this.pos] !== '>') this.fail(`The end tag </${end}> is not closed`);
					this.pos++;
					if (end !== qname) this.fail(`</${end}> closes <${qname}>`);
					break;
				}
				if (this.text.startsWith('<!--', this.pos)) {
					this.skipTo('-->', 'A comment is not closed');
				} else if (this.text.startsWith('<![CDATA[', this.pos)) {
					const end = this.text.indexOf(']]>', this.pos + 9);
					if (end < 0) this.fail('A CDATA section is not closed');
					addText(this.text.slice(this.pos + 9, end));
					this.pos = end + 3;
				} else if (this.text.startsWith('<?', this.pos)) {
					this.skipTo('?>', 'A processing instruction is not closed');
				} else if (this.text[this.pos] === '<') {
					children.push(this.element(inner));
				} else {
					const next = this.text.indexOf('<', this.pos);
					const end = next < 0 ? this.text.length : next;
					addText(this.expand(this.text.slice(this.pos, end), false, 0));
					this.pos = end;
				}
			}
		}
		this.depth--;
		return { kind: 'element', name, attributes, children, at };
	}

	/** Replace character and entity references. An attribute's entity text has its white space normalised too. */
	private expand(raw: string, inAttribute: boolean, depth: number): string {
		if (!raw.includes('&')) {
			this.tallest = 0;
			return raw;
		}
		let out = '';
		let i = 0;
		let tallest = 0;
		for (;;) {
			const amp = raw.indexOf('&', i);
			if (amp < 0) {
				this.tallest = tallest;
				return out + raw.slice(i);
			}
			out += raw.slice(i, amp);
			const semi = raw.indexOf(';', amp);
			if (semi < 0) this.fail('"&" starts no reference. Write &amp; for an ampersand');
			const ref = raw.slice(amp + 1, semi);
			if (ref.startsWith('#')) {
				const hex = ref[1] === 'x';
				const digits = ref.slice(hex ? 2 : 1);
				const cp = /^[0-9A-Fa-f]+$/.test(digits) && (hex || /^[0-9]+$/.test(digits)) ? parseInt(digits, hex ? 16 : 10) : NaN;
				if (!(cp >= 0 && cp <= 0x10ffff)) this.fail(`"&${ref};" is not a character`);
				out += String.fromCodePoint(cp);
			} else if (PREDEFINED[ref] !== undefined && Object.prototype.hasOwnProperty.call(PREDEFINED, ref)) {
				out += PREDEFINED[ref];
			} else if (this.entities.has(ref)) {
				// Expand each entity once. Without this, entities that fan out to empty text
				// add nothing to the size cap but re-walk their whole tree on every reference
				const key = `${inAttribute ? 'a' : 'c'}:${ref}`;
				let entity = this.expansions.get(key);
				// A cached entity brings its height, so the depth cap holds whatever order the references come in
				if (depth + (entity?.height ?? 1) > MAX_ENTITY_DEPTH) this.fail(`Entities nest more than ${MAX_ENTITY_DEPTH} deep`);
				if (entity === undefined) {
					let replacement = this.entities.get(ref)!;
					if (inAttribute) replacement = replacement.replace(/[\t\n]/g, ' ');
					const text = this.expand(replacement, inAttribute, depth + 1);
					entity = { text, height: this.tallest + 1 };
					this.expansions.set(key, entity);
				}
				tallest = Math.max(tallest, entity.height);
				this.expanded += entity.text.length;
				if (this.expanded > MAX_ENTITY_CHARACTERS) this.fail('Entities expand to too much text');
				out += entity.text;
			} else {
				this.fail(`The entity "&${ref};" is not declared`);
			}
			i = semi + 1;
		}
	}

	private name(): string {
		const start = this.pos;
		if (!NAME_START.test(this.text[this.pos] ?? '')) this.fail('A name is expected');
		this.pos++;
		while (this.pos < this.text.length && NAME_CHAR.test(this.text[this.pos])) this.pos++;
		return this.text.slice(start, this.pos);
	}

	private skipSpace() {
		while (this.pos < this.text.length) {
			const c = this.text[this.pos];
			if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return;
			this.pos++;
		}
	}

	private skipTo(end: string, message: string) {
		const at = this.text.indexOf(end, this.pos);
		if (at < 0) this.fail(message);
		this.pos = at + end.length;
	}

	private fail(message: string): never {
		throw new RdfSyntaxError(message, this.text, this.pos);
	}
}

// ── RDF/XML grammar over the XML ────────────────────────────────────────

/** RDF attributes that name or shape a node, never a property. Unprefixed forms are the legacy spellings. */
const SYNTAX_ATTRIBUTES = new Set(['about', 'ID', 'nodeID', 'bagID', 'aboutEach', 'aboutEachPrefix', 'resource', 'parseType', 'datatype', 'li']);
const LEGACY_UNPREFIXED = new Set(['about', 'ID', 'nodeID', 'resource', 'parseType', 'datatype', 'type']);

interface Scope {
	base: string | undefined;
	lang: string;
}

/**
 * Parse an RDF/XML document. `baseIri` resolves relative IRIs until the
 * document sets xml:base. Throws RdfSyntaxError on malformed XML or RDF/XML.
 */
export function parseRdfXml(text: string, options: { baseIri?: string } = {}): Triple[] {
	const reader = new XmlReader(text);
	const root = reader.document();
	if (isOwlXml(root)) {
		throw new RdfSyntaxError('This file is OWL/XML, which this app does not read. In Protégé, save it as RDF/XML or Turtle, then import it', reader.text, root.at);
	}
	return new RdfXmlReader(reader.text).read(root, options.baseIri);
}

/**
 * OWL/XML is OWL's own XML, not RDF/XML, and Protégé can save it under a .owl
 * name. Its root is an owl:Ontology with an ontologyIRI attribute or OWL/XML
 * children such as Prefix and Declaration. An RDF/XML file whose root is an
 * owl:Ontology node element has neither.
 */
function isOwlXml(root: XmlElement): boolean {
	if (root.name.ns !== OWL || root.name.local !== 'Ontology') return false;
	return (
		root.attributes.some((a) => a.ns === '' && a.local === 'ontologyIRI') ||
		root.children.some((c) => c.kind === 'element' && c.name.ns === OWL && ['Prefix', 'Import', 'Declaration'].includes(c.name.local))
	);
}

class RdfXmlReader {
	private readonly text: string;
	private readonly triples: Triple[] = [];
	private readonly bnodes = blankNodeFactory('x');

	constructor(text: string) {
		this.text = text;
	}

	read(root: XmlElement, base: string | undefined): Triple[] {
		const scope = this.scope(root, { base, lang: '' });
		if (isRdf(root.name, 'RDF')) {
			for (const child of root.children) {
				if (child.kind === 'element') this.nodeElement(child, scope);
				else if (child.value.trim()) this.fail('Text inside rdf:RDF, where only nodes belong', root);
			}
		} else {
			this.nodeElement(root, { base, lang: '' });
		}
		return this.triples;
	}

	/** xml:base and xml:lang carry down to the children. */
	private scope(e: XmlElement, parent: Scope): Scope {
		let { base, lang } = parent;
		for (const a of e.attributes) {
			if (a.ns !== XML_NS) continue;
			if (a.local === 'base') base = resolveIri(a.value.replace(/#.*$/, ''), base);
			if (a.local === 'lang') lang = a.value;
		}
		return { base, lang };
	}

	private nodeElement(e: XmlElement, parent: Scope): Subject {
		const scope = this.scope(e, parent);
		const id = rdfAttribute(e, 'ID');
		const about = rdfAttribute(e, 'about');
		const nodeId = rdfAttribute(e, 'nodeID');
		const subject: Subject =
			id !== undefined
				? namedNode(resolveIri(`#${id}`, scope.base))
				: about !== undefined
					? namedNode(resolveIri(about, scope.base))
					: nodeId !== undefined
						? this.bnodes.labelled(nodeId)
						: this.bnodes.fresh();
		if (!isRdf(e.name, 'Description')) this.push(subject, RDF_TYPE, namedNode(e.name.ns + e.name.local));
		this.propertyAttributes(e, subject, scope);

		let li = 1;
		for (const child of e.children) {
			if (child.kind === 'text') {
				if (child.value.trim()) this.fail('Text where a property element belongs', e);
				continue;
			}
			this.propertyElement(child, subject, scope, () => li++);
		}
		return subject;
	}

	/** Attributes that are properties: rdf:type names a type, any other gives a plain literal. */
	private propertyAttributes(e: XmlElement, subject: Subject, scope: Scope) {
		for (const a of e.attributes) {
			if (isSyntax(a)) continue;
			if (isRdfAttribute(a, 'type')) this.push(subject, RDF_TYPE, namedNode(resolveIri(a.value, scope.base)));
			else this.push(subject, a.ns + a.local, scope.lang ? literal(a.value, { language: scope.lang }) : literal(a.value));
		}
	}

	private propertyElement(e: XmlElement, subject: Subject, parent: Scope, nextLi: () => number) {
		const scope = this.scope(e, parent);
		const predicate = isRdf(e.name, 'li') ? `${RDF}_${nextLi()}` : e.name.ns + e.name.local;
		const parseType = rdfAttribute(e, 'parseType');
		const elements = e.children.filter((c): c is XmlElement => c.kind === 'element');
		const text = e.children.map((c) => (c.kind === 'text' ? c.value : '')).join('');

		if (parseType === 'Resource') {
			const node = this.bnodes.fresh();
			this.push(subject, predicate, node);
			if (text.trim()) this.fail('Text inside rdf:parseType="Resource"', e);
			let li = 1;
			for (const child of elements) this.propertyElement(child, node, scope, () => li++);
			return;
		}
		if (parseType === 'Collection') {
			if (text.trim()) this.fail('Text inside rdf:parseType="Collection"', e);
			this.push(subject, predicate, this.list(elements.map((child) => this.nodeElement(child, scope))));
			return;
		}
		if (parseType !== undefined) {
			// rdf:parseType="Literal", and any other value, keeps the content as XML text
			this.push(subject, predicate, literal(serialize(e.children), RDF_XML_LITERAL));
			return;
		}

		if (elements.length > 1) this.fail(`<${e.name.qname}> holds more than one node`, e);
		if (elements.length === 1) {
			if (text.trim()) this.fail(`<${e.name.qname}> mixes text and a node`, e);
			this.push(subject, predicate, this.nodeElement(elements[0], scope));
			return;
		}

		const resource = rdfAttribute(e, 'resource');
		const nodeId = rdfAttribute(e, 'nodeID');
		const described = e.attributes.filter((a) => !isSyntax(a));
		if (resource !== undefined || nodeId !== undefined || described.length > 0) {
			if (text.trim()) this.fail(`<${e.name.qname}> has rdf:resource and text`, e);
			const object: Subject =
				resource !== undefined
					? namedNode(resolveIri(resource, scope.base))
					: nodeId !== undefined
						? this.bnodes.labelled(nodeId)
						: this.bnodes.fresh();
			this.push(subject, predicate, object);
			this.propertyAttributes(e, object, scope);
			return;
		}

		const datatype = rdfAttribute(e, 'datatype');
		if (datatype !== undefined) this.push(subject, predicate, literal(text, resolveIri(datatype, scope.base)));
		else this.push(subject, predicate, scope.lang ? literal(text, { language: scope.lang }) : literal(text));
	}

	private list(items: Subject[]): Subject {
		if (items.length === 0) return namedNode(RDF_NIL);
		const head = this.bnodes.fresh();
		let current = head;
		items.forEach((item, i) => {
			this.push(current, RDF_FIRST, item);
			if (i === items.length - 1) {
				this.push(current, RDF_REST, namedNode(RDF_NIL));
			} else {
				const next = this.bnodes.fresh();
				this.push(current, RDF_REST, next);
				current = next;
			}
		});
		return head;
	}

	private push(subject: Subject, predicate: string, object: Term) {
		this.triples.push(triple(subject, predicate, object));
	}

	private fail(message: string, at: XmlElement): never {
		throw new RdfSyntaxError(message, this.text, at.at);
	}
}

function isRdf(name: XmlName, local: string): boolean {
	return name.ns === RDF && name.local === local;
}

function isRdfAttribute(a: XmlAttribute, local: string): boolean {
	return isRdf(a, local) || (a.ns === '' && a.local === local && LEGACY_UNPREFIXED.has(local));
}

function rdfAttribute(e: XmlElement, local: string): string | undefined {
	return e.attributes.find((a) => isRdfAttribute(a, local))?.value;
}

/** True for xml:*, the RDF syntax attributes, and any other unprefixed attribute (no namespace, so no property). */
function isSyntax(a: XmlAttribute): boolean {
	if (a.ns === XML_NS) return true;
	if (a.ns === RDF) return SYNTAX_ATTRIBUTES.has(a.local);
	return a.ns === '' && a.local !== 'type';
}

/** XML content back to text, for rdf:parseType="Literal". */
function serialize(nodes: XmlNode[]): string {
	return nodes
		.map((n) => {
			if (n.kind === 'text') return escapeText(n.value);
			const attributes = n.attributes.map((a) => ` ${a.qname}="${escapeAttribute(a.value)}"`).join('');
			return n.children.length === 0
				? `<${n.name.qname}${attributes}/>`
				: `<${n.name.qname}${attributes}>${serialize(n.children)}</${n.name.qname}>`;
		})
		.join('');
}

// ── Writer ──────────────────────────────────────────────────────────────

/** Characters XML 1.0 cannot carry at all. They are dropped, as Export SVG drops them. */
const NOT_XML = /[^\u{9}\u{A}\u{D}\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu;
const NCNAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function escapeText(value: string): string {
	return wellFormedText(value)
		.replace(NOT_XML, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\r/g, '&#13;');
}

function escapeAttribute(value: string): string {
	return escapeText(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}

function xmlComment(text: string): string {
	// XML allows no "--" inside a comment, so a space follows every hyphen that another hyphen follows
	return `<!-- ${wellFormedText(text).replace(NOT_XML, '').replace(/-(?=-)/g, '- ').replace(/-$/, '- ')} -->`;
}

export function writeRdfXml(triples: Triple[], options: RdfWriteOptions): string {
	return new RdfXmlWriter(options).write(triples);
}

class RdfXmlWriter {
	private readonly options: RdfWriteOptions;
	/** Prefixes usable in element names: every declared one except the empty prefix. Longest namespace first. */
	private readonly prefixes: [string, string][];
	private readonly used = new Set<string>(['rdf']);
	private readonly extra = new Map<string, string>();
	private inline = new Map<string, SubjectBlock>();

	constructor(options: RdfWriteOptions) {
		this.options = options;
		this.prefixes = Object.entries({ rdf: RDF, ...options.prefixes })
			.filter(([prefix]) => prefix !== '')
			.sort((a, b) => b[1].length - a[1].length);
	}

	write(triples: Triple[]): string {
		const layout = layoutTriples(triples);
		this.inline = layout.inline;
		const body: string[] = [];
		for (const block of layout.topLevel) {
			const section = this.options.sections?.get(termKey(block.subject));
			if (section) body.push(`  ${xmlComment(section)}`);
			body.push(this.node(block, 1, true), '');
		}

		const namespaces = [...this.prefixes, ...this.extra.entries()]
			.filter(([prefix]) => this.used.has(prefix))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([prefix, iri]) => `    xmlns:${prefix}="${escapeAttribute(iri)}"`);
		const header = (this.options.header ?? []).map(xmlComment);
		return [
			'<?xml version="1.0" encoding="UTF-8"?>',
			...header,
			`<rdf:RDF\n${namespaces.join('\n')}>`,
			'',
			...body,
			'</rdf:RDF>',
			''
		].join('\n');
	}

	/** A node element: typed by its first QName-able type, else rdf:Description. */
	private node(block: SubjectBlock, level: number, topLevel: boolean): string {
		const pad = '  '.repeat(level);
		let element = 'rdf:Description';
		let skipType: string | undefined;
		const types = block.predicates.find((p) => p.predicate === RDF_TYPE)?.objects ?? [];
		for (const t of types) {
			if (t.termType !== 'NamedNode') continue;
			const qname = this.qname(t.value, false);
			if (qname) {
				element = qname;
				skipType = t.value;
				break;
			}
		}

		let identity = '';
		if (block.subject.termType === 'NamedNode') identity = ` rdf:about="${escapeAttribute(block.subject.value)}"`;
		else if (topLevel || !this.inline.has(block.subject.value)) identity = ` rdf:nodeID="${block.subject.value}"`;

		const properties: string[] = [];
		for (const { predicate, objects } of block.predicates) {
			for (const object of objects) {
				if (predicate === RDF_TYPE && object.termType === 'NamedNode' && object.value === skipType) continue;
				properties.push(this.property(predicate, object, level + 1));
			}
		}
		if (properties.length === 0) return `${pad}<${element}${identity}/>`;
		return `${pad}<${element}${identity}>\n${properties.join('\n')}\n${pad}</${element}>`;
	}

	private property(predicate: string, object: Term, level: number): string {
		const pad = '  '.repeat(level);
		const name = this.qname(predicate, true)!;
		if (object.termType === 'NamedNode') return `${pad}<${name} rdf:resource="${escapeAttribute(object.value)}"/>`;
		if (object.termType === 'BlankNode') {
			const block = this.inline.get(object.value);
			if (!block) return `${pad}<${name} rdf:nodeID="${object.value}"/>`;
			return `${pad}<${name}>\n${this.node(block, level + 1, false)}\n${pad}</${name}>`;
		}
		return `${pad}<${name}${this.literalAttributes(object)}>${escapeText(object.value)}</${name}>`;
	}

	private literalAttributes(l: Literal): string {
		if (l.language) return ` xml:lang="${escapeAttribute(l.language)}"`;
		if (l.datatype !== XSD_STRING && l.datatype !== RDF_LANG_STRING) return ` rdf:datatype="${escapeAttribute(l.datatype)}"`;
		return '';
	}

	/**
	 * The QName for an IRI, from the declared prefixes. A predicate must have
	 * one, so an IRI no prefix fits gets a made-up `ns1:` prefix. A type that
	 * no prefix fits returns undefined and is written as rdf:type instead.
	 */
	private qname(iri: string, required: boolean): string | undefined {
		for (const [prefix, namespace] of [...this.prefixes, ...this.extra.entries()]) {
			if (!iri.startsWith(namespace)) continue;
			const local = iri.slice(namespace.length);
			if (!NCNAME.test(local)) continue;
			this.used.add(prefix);
			return `${prefix}:${local}`;
		}
		if (!required) return undefined;
		const m = /^(.*?)([A-Za-z_][A-Za-z0-9_.-]*)$/.exec(iri);
		if (!m || !m[1]) throw new Error(`RDF/XML cannot write the predicate <${iri}>: it does not end in an XML name`);
		const prefix = `ns${this.extra.size + 1}`;
		this.extra.set(prefix, m[1]);
		this.used.add(prefix);
		return `${prefix}:${m[2]}`;
	}
}
