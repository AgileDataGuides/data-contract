/**
 * Turtle 1.1 (https://www.w3.org/TR/turtle/): a reader and a writer.
 *
 * The reader takes the whole grammar: @prefix and @base, the SPARQL-style
 * PREFIX and BASE, prefixed names with escapes, blank node labels, `[ … ]`
 * property lists, `( … )` collections, the four string forms with their
 * escapes, language tags, datatypes, numbers and booleans. Relative IRIs
 * resolve against the base.
 *
 * The writer groups triples by subject, writes `a` for rdf:type, prefixed
 * names wherever a declared prefix fits, and single-use blank nodes in place
 * as `[ … ]`. It declares only the prefixes it used.
 *
 * No dependencies (decision 20261006-02).
 */

import {
	type BlankNode,
	type Literal,
	type NamedNode,
	type RdfWriteOptions,
	type Subject,
	type SubjectBlock,
	type Term,
	type Triple,
	RDF_FIRST,
	RDF_LANG_STRING,
	RDF_NIL,
	RDF_REST,
	RDF_TYPE,
	RdfSyntaxError,
	XSD_BOOLEAN,
	XSD_DECIMAL,
	XSD_DOUBLE,
	XSD_INTEGER,
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

// ── Character classes from the Turtle grammar, by code point ────────────

function isPnCharsBase(cp: number): boolean {
	return (
		(cp >= 0x41 && cp <= 0x5a) ||
		(cp >= 0x61 && cp <= 0x7a) ||
		(cp >= 0xc0 && cp <= 0xd6) ||
		(cp >= 0xd8 && cp <= 0xf6) ||
		(cp >= 0xf8 && cp <= 0x2ff) ||
		(cp >= 0x370 && cp <= 0x37d) ||
		(cp >= 0x37f && cp <= 0x1fff) ||
		(cp >= 0x200c && cp <= 0x200d) ||
		(cp >= 0x2070 && cp <= 0x218f) ||
		(cp >= 0x2c00 && cp <= 0x2fef) ||
		(cp >= 0x3001 && cp <= 0xd7ff) ||
		(cp >= 0xf900 && cp <= 0xfdcf) ||
		(cp >= 0xfdf0 && cp <= 0xfffd) ||
		(cp >= 0x10000 && cp <= 0xeffff)
	);
}

function isPnCharsU(cp: number): boolean {
	return isPnCharsBase(cp) || cp === 0x5f;
}

function isDigit(cp: number): boolean {
	return cp >= 0x30 && cp <= 0x39;
}

function isPnChars(cp: number): boolean {
	return (
		isPnCharsU(cp) ||
		cp === 0x2d ||
		isDigit(cp) ||
		cp === 0xb7 ||
		(cp >= 0x300 && cp <= 0x36f) ||
		(cp >= 0x203f && cp <= 0x2040)
	);
}

const LOCAL_ESCAPES = "_~.-!$&'()*+,;=/?#@%";
const ESCAPES: Record<string, string> = { t: '\t', b: '\b', n: '\n', r: '\r', f: '\f', '"': '"', "'": "'", '\\': '\\' };
const DOUBLE = /[+-]?(?:[0-9]+\.[0-9]*[eE][+-]?[0-9]+|\.[0-9]+[eE][+-]?[0-9]+|[0-9]+[eE][+-]?[0-9]+)/y;
const DECIMAL = /[+-]?[0-9]*\.[0-9]+/y;
const INTEGER = /[+-]?[0-9]+/y;
const LANGTAG = /[a-zA-Z]+(?:-[a-zA-Z0-9]+)*/y;

/** `[` and `(` nest no deeper than this, so a hostile file fails with a message instead of a stack overflow. */
const MAX_DEPTH = 256;

// ── Reader ──────────────────────────────────────────────────────────────

export interface TurtleParseResult {
	triples: Triple[];
	/** Every prefix the document declared, prefix to namespace IRI. */
	prefixes: Map<string, string>;
}

/**
 * Parse a Turtle document. `baseIri` resolves relative IRIs until the
 * document sets its own base. Throws RdfSyntaxError, naming the line and
 * column, on the first mistake.
 */
export function parseTurtle(text: string, options: { baseIri?: string } = {}): TurtleParseResult {
	return new TurtleReader(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, options.baseIri).read();
}

class TurtleReader {
	private readonly text: string;
	private pos = 0;
	private base: string | undefined;
	private depth = 0;
	private readonly prefixes = new Map<string, string>();
	private readonly triples: Triple[] = [];
	private readonly bnodes = blankNodeFactory('t');

	constructor(text: string, base: string | undefined) {
		this.text = text;
		this.base = base;
	}

	read(): TurtleParseResult {
		this.skip();
		while (this.pos < this.text.length) {
			this.statement();
			this.skip();
		}
		return { triples: this.triples, prefixes: this.prefixes };
	}

	// ── Statements ──

	private statement() {
		if (this.text[this.pos] === '@') {
			if (this.directiveAhead('@prefix')) {
				this.pos += 7;
				this.prefixDirective(true);
			} else if (this.directiveAhead('@base')) {
				this.pos += 5;
				this.baseDirective(true);
			} else {
				this.fail('Unknown directive');
			}
			return;
		}
		if (this.keywordAhead('PREFIX')) {
			this.pos += 6;
			this.prefixDirective(false);
			return;
		}
		if (this.keywordAhead('BASE')) {
			this.pos += 4;
			this.baseDirective(false);
			return;
		}
		this.triplesStatement();
	}

	private directiveAhead(word: string): boolean {
		return this.text.startsWith(word, this.pos) && this.isSpace(this.pos + word.length);
	}

	/** SPARQL-style PREFIX or BASE, in any case, followed by white space. */
	private keywordAhead(word: string): boolean {
		return this.text.slice(this.pos, this.pos + word.length).toUpperCase() === word && this.isSpace(this.pos + word.length);
	}

	private isSpace(at: number): boolean {
		const c = this.text[at];
		return c === ' ' || c === '\t' || c === '\n' || c === '\r';
	}

	private prefixDirective(turtleStyle: boolean) {
		this.skip();
		const prefix = this.readPnPrefix();
		this.expect(':');
		this.skip();
		this.prefixes.set(prefix, this.readIriRef());
		if (turtleStyle) {
			this.skip();
			this.expect('.');
		}
	}

	private baseDirective(turtleStyle: boolean) {
		this.skip();
		this.base = this.readIriRef();
		if (turtleStyle) {
			this.skip();
			this.expect('.');
		}
	}

	private triplesStatement() {
		if (this.text[this.pos] === '[') {
			const subject = this.blankNodePropertyList();
			this.skip();
			if (this.text[this.pos] !== '.') this.predicateObjectList(subject);
		} else {
			const subject = this.subject();
			this.skip();
			this.predicateObjectList(subject);
		}
		this.skip();
		this.expect('.');
	}

	private subject(): Subject {
		const c = this.text[this.pos];
		if (c === '<') return namedNode(this.readIriRef());
		if (c === '_' && this.text[this.pos + 1] === ':') return this.readBlankNodeLabel();
		if (c === '(') return this.collection();
		return namedNode(this.readPrefixedName());
	}

	private predicateObjectList(subject: Subject) {
		for (;;) {
			const predicate = this.verb();
			this.skip();
			this.objectList(subject, predicate);
			this.skip();
			if (this.text[this.pos] !== ';') return;
			while (this.text[this.pos] === ';') {
				this.pos++;
				this.skip();
			}
			const next = this.text[this.pos];
			if (next === '.' || next === ']' || next === undefined) return;
		}
	}

	private verb(): NamedNode {
		if (this.text[this.pos] === 'a') {
			const after = this.text[this.pos + 1];
			if (after === undefined || ' \t\n\r<[("\'#'.includes(after)) {
				this.pos++;
				return namedNode(RDF_TYPE);
			}
		}
		if (this.text[this.pos] === '<') return namedNode(this.readIriRef());
		return namedNode(this.readPrefixedName());
	}

	private objectList(subject: Subject, predicate: NamedNode) {
		for (;;) {
			this.triples.push(triple(subject, predicate, this.object()));
			this.skip();
			if (this.text[this.pos] !== ',') return;
			this.pos++;
			this.skip();
		}
	}

	private object(): Term {
		const c = this.text[this.pos];
		if (c === undefined) this.fail('The document ends where an object was expected');
		if (c === '<') return namedNode(this.readIriRef());
		if (c === '_' && this.text[this.pos + 1] === ':') return this.readBlankNodeLabel();
		if (c === '[') return this.blankNodePropertyList();
		if (c === '(') return this.collection();
		if (c === '"' || c === "'") return this.rdfLiteral();
		if (isDigit(c.charCodeAt(0)) || c === '+' || c === '-' || (c === '.' && isDigit(this.text.charCodeAt(this.pos + 1)))) {
			return this.numericLiteral();
		}
		if (this.wordAhead('true')) {
			this.pos += 4;
			return literal('true', XSD_BOOLEAN);
		}
		if (this.wordAhead('false')) {
			this.pos += 5;
			return literal('false', XSD_BOOLEAN);
		}
		return namedNode(this.readPrefixedName());
	}

	/** A keyword such as `true`, not the start of a prefixed name such as `true:x` or `trueish:x`. */
	private wordAhead(word: string): boolean {
		if (!this.text.startsWith(word, this.pos)) return false;
		const after = this.text.codePointAt(this.pos + word.length);
		return after === undefined || !(isPnChars(after) || after === 0x3a || after === 0x2e);
	}

	private blankNodePropertyList(): BlankNode {
		this.expect('[');
		this.enter();
		this.skip();
		const node = this.bnodes.fresh();
		if (this.text[this.pos] !== ']') this.predicateObjectList(node);
		this.skip();
		this.expect(']');
		this.depth--;
		return node;
	}

	private collection(): BlankNode | NamedNode {
		this.expect('(');
		this.enter();
		this.skip();
		const items: Term[] = [];
		while (this.text[this.pos] !== ')') {
			if (this.pos >= this.text.length) this.fail('A collection is not closed with ")"');
			items.push(this.object());
			this.skip();
		}
		this.pos++;
		this.depth--;
		if (items.length === 0) return namedNode(RDF_NIL);
		const head = this.bnodes.fresh();
		let current = head;
		items.forEach((item, i) => {
			this.triples.push(triple(current, RDF_FIRST, item));
			if (i === items.length - 1) {
				this.triples.push(triple(current, RDF_REST, namedNode(RDF_NIL)));
			} else {
				const next = this.bnodes.fresh();
				this.triples.push(triple(current, RDF_REST, next));
				current = next;
			}
		});
		return head;
	}

	private enter() {
		if (++this.depth > MAX_DEPTH) this.fail(`Brackets nest more than ${MAX_DEPTH} deep`);
	}

	// ── Literals ──

	private rdfLiteral(): Literal {
		const value = this.readString();
		if (this.text[this.pos] === '@') {
			this.pos++;
			LANGTAG.lastIndex = this.pos;
			const m = LANGTAG.exec(this.text);
			if (!m) this.fail('A language tag is expected after "@"');
			this.pos += m[0].length;
			return literal(value, { language: m[0] });
		}
		if (this.text.startsWith('^^', this.pos)) {
			this.pos += 2;
			const datatype = this.text[this.pos] === '<' ? this.readIriRef() : this.readPrefixedName();
			return literal(value, datatype);
		}
		return literal(value);
	}

	private numericLiteral(): Literal {
		for (const [pattern, datatype] of [
			[DOUBLE, XSD_DOUBLE],
			[DECIMAL, XSD_DECIMAL],
			[INTEGER, XSD_INTEGER]
		] as const) {
			pattern.lastIndex = this.pos;
			const m = pattern.exec(this.text);
			if (m) {
				this.pos += m[0].length;
				return literal(m[0], datatype);
			}
		}
		return this.fail('A number is expected');
	}

	private readString(): string {
		const quote = this.text[this.pos];
		const triple3 = quote.repeat(3);
		if (this.text.startsWith(triple3, this.pos)) {
			this.pos += 3;
			let out = '';
			for (;;) {
				if (this.pos >= this.text.length) this.fail('A long string is not closed');
				// A quote straight before the closing three belongs to the content. The strict
				// grammar forbids it, but naive writers produce """He said "hi"""", so read it
				// the way they meant
				if (this.text.startsWith(triple3, this.pos) && this.text[this.pos + 3] !== quote) {
					this.pos += 3;
					return out;
				}
				const c = this.text[this.pos];
				if (c === '\\') {
					out += this.readEscape();
				} else {
					out += c;
					this.pos++;
				}
			}
		}
		this.pos++;
		let out = '';
		for (;;) {
			const c = this.text[this.pos];
			if (c === undefined) this.fail('A string is not closed');
			if (c === quote) {
				this.pos++;
				return out;
			}
			if (c === '\n' || c === '\r') this.fail('A line break inside a short string. Use """ for text over several lines');
			if (c === '\\') {
				out += this.readEscape();
			} else {
				out += c;
				this.pos++;
			}
		}
	}

	private readEscape(): string {
		const c = this.text[this.pos + 1];
		if (c === 'u') return this.readUchar(4);
		if (c === 'U') return this.readUchar(8);
		const escaped = c === undefined ? undefined : ESCAPES[c];
		if (escaped === undefined) this.fail(`Unknown escape "\\${c ?? ''}"`);
		this.pos += 2;
		return escaped;
	}

	private readUchar(digits: number): string {
		const hex = this.text.slice(this.pos + 2, this.pos + 2 + digits);
		if (hex.length !== digits || !/^[0-9A-Fa-f]+$/.test(hex)) this.fail('A \\u escape needs hex digits');
		const cp = parseInt(hex, 16);
		if (cp > 0x10ffff) this.fail('A \\U escape is past the last Unicode character');
		this.pos += 2 + digits;
		return String.fromCodePoint(cp);
	}

	// ── Names ──

	private readIriRef(): string {
		this.expect('<');
		let out = '';
		for (;;) {
			const c = this.text[this.pos];
			if (c === undefined) this.fail('An IRI is not closed with ">"');
			if (c === '>') {
				this.pos++;
				return resolveIri(out, this.base);
			}
			if (c === '\\') {
				const n = this.text[this.pos + 1];
				if (n === 'u') out += this.readUchar(4);
				else if (n === 'U') out += this.readUchar(8);
				else this.fail('Only \\u and \\U escapes are allowed in an IRI');
				continue;
			}
			if (c <= ' ' || '<"{}|^`'.includes(c)) this.fail(`"${c === ' ' ? 'space' : c}" is not allowed in an IRI`);
			out += c;
			this.pos++;
		}
	}

	/** PN_PREFIX, possibly empty. It never ends with ".". */
	private readPnPrefix(): string {
		const start = this.pos;
		const first = this.text.codePointAt(this.pos);
		if (first === undefined || !isPnCharsBase(first)) return '';
		this.pos += first > 0xffff ? 2 : 1;
		let end = this.pos;
		for (;;) {
			const cp = this.text.codePointAt(this.pos);
			if (cp === undefined || !(isPnChars(cp) || cp === 0x2e)) break;
			this.pos += cp > 0xffff ? 2 : 1;
			if (cp !== 0x2e) end = this.pos;
		}
		this.pos = end;
		return this.text.slice(start, end);
	}

	private readPrefixedName(): string {
		const at = this.pos;
		const prefix = this.readPnPrefix();
		if (this.text[this.pos] !== ':') {
			this.pos = at;
			const c = this.text[at];
			this.fail(c === undefined ? 'The document ends too soon' : `Unexpected "${c}"`);
		}
		this.pos++;
		const local = this.readPnLocal();
		const namespace = this.prefixes.get(prefix);
		if (namespace === undefined) {
			this.pos = at;
			this.fail(`The prefix "${prefix}:" is not declared`);
		}
		return namespace + local;
	}

	/** PN_LOCAL with its escapes undone and percent-encodings kept. It never ends with an unescaped ".". */
	private readPnLocal(): string {
		let out = '';
		let keptOut = '';
		let keptPos = this.pos;
		let first = true;
		for (;;) {
			const cp = this.text.codePointAt(this.pos);
			if (cp === undefined) break;
			if (cp === 0x25) {
				const hex = this.text.slice(this.pos + 1, this.pos + 3);
				if (!/^[0-9A-Fa-f]{2}$/.test(hex)) this.fail('"%" in a local name needs two hex digits');
				out += `%${hex}`;
				this.pos += 3;
			} else if (cp === 0x5c) {
				const escaped = this.text[this.pos + 1];
				if (escaped === undefined || !LOCAL_ESCAPES.includes(escaped)) this.fail('Unknown escape in a local name');
				out += escaped;
				this.pos += 2;
			} else if (first ? isPnCharsU(cp) || cp === 0x3a || isDigit(cp) : isPnChars(cp) || cp === 0x3a || cp === 0x2e) {
				out += String.fromCodePoint(cp);
				this.pos += cp > 0xffff ? 2 : 1;
				if (cp === 0x2e) {
					first = false;
					continue;
				}
			} else {
				break;
			}
			first = false;
			keptOut = out;
			keptPos = this.pos;
		}
		this.pos = keptPos;
		return keptOut;
	}

	private readBlankNodeLabel(): BlankNode {
		this.pos += 2;
		const start = this.pos;
		const first = this.text.codePointAt(this.pos);
		if (first === undefined || !(isPnCharsU(first) || isDigit(first))) this.fail('A blank node label is expected after "_:"');
		this.pos += first > 0xffff ? 2 : 1;
		let end = this.pos;
		for (;;) {
			const cp = this.text.codePointAt(this.pos);
			if (cp === undefined || !(isPnChars(cp) || cp === 0x2e)) break;
			this.pos += cp > 0xffff ? 2 : 1;
			if (cp !== 0x2e) end = this.pos;
		}
		this.pos = end;
		return this.bnodes.labelled(this.text.slice(start, end));
	}

	// ── Plumbing ──

	/** Skip white space and comments. */
	private skip() {
		for (;;) {
			const c = this.text[this.pos];
			if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
				this.pos++;
			} else if (c === '#') {
				// A comment ends at a line feed or a carriage return, so a file with old Mac line breaks reads too
				let end = this.pos;
				while (end < this.text.length && this.text[end] !== '\n' && this.text[end] !== '\r') end++;
				this.pos = end;
			} else {
				return;
			}
		}
	}

	private expect(c: string) {
		if (this.text[this.pos] !== c) {
			const found = this.text[this.pos];
			this.fail(found === undefined ? `"${c}" is expected, but the document ends` : `"${c}" is expected, not "${found}"`);
		}
		this.pos++;
	}

	private fail(message: string): never {
		throw new RdfSyntaxError(message, this.text, this.pos);
	}
}

// ── Writer ──────────────────────────────────────────────────────────────

const INDENT = '    ';
/** A local name every Turtle parser accepts unescaped, Turtle 1.1 or older. */
const SAFE_LOCAL = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function writeTurtle(triples: Triple[], options: RdfWriteOptions): string {
	return new TurtleWriter(options).write(triples);
}

class TurtleWriter {
	private readonly prefixes: [string, string][];
	private readonly used = new Set<string>();
	private readonly options: RdfWriteOptions;
	private inline = new Map<string, SubjectBlock>();

	constructor(options: RdfWriteOptions) {
		this.options = options;
		// Longest namespace first, so the most specific prefix wins
		this.prefixes = Object.entries(options.prefixes).sort((a, b) => b[1].length - a[1].length);
	}

	write(triples: Triple[]): string {
		const layout = layoutTriples(triples);
		this.inline = layout.inline;
		const blocks: string[] = [];
		for (const block of layout.topLevel) {
			const section = this.options.sections?.get(termKey(block.subject));
			const lines = section ? `${comment(section)}\n` : '';
			blocks.push(`${lines}${this.term(block.subject, 0)} ${this.predicates(block.predicates, 1)} .`);
		}

		const header = (this.options.header ?? []).map(comment).join('\n');
		const declarations = Object.entries(this.options.prefixes)
			.filter(([prefix]) => this.used.has(prefix))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([prefix, iri]) => `@prefix ${prefix}: <${escapeIri(iri)}> .`)
			.join('\n');
		return `${[header, declarations, ...blocks].filter(Boolean).join('\n\n')}\n`;
	}

	private predicates(predicates: { predicate: string; objects: Term[] }[], level: number): string {
		return predicates
			.map(({ predicate, objects }) => {
				const verb = predicate === RDF_TYPE ? 'a' : this.iri(predicate);
				return `${verb} ${objects.map((o) => this.term(o, level)).join(', ')}`;
			})
			.join(` ;\n${INDENT.repeat(level)}`);
	}

	private term(term: Term, level: number): string {
		switch (term.termType) {
			case 'NamedNode':
				return this.iri(term.value);
			case 'BlankNode': {
				const block = this.inline.get(term.value);
				if (!block) return `_:${term.value}`;
				if (block.predicates.length === 0) return '[]';
				return `[\n${INDENT.repeat(level + 1)}${this.predicates(block.predicates, level + 1)}\n${INDENT.repeat(level)}]`;
			}
			case 'Literal':
				return this.literal(term);
		}
	}

	private iri(value: string): string {
		for (const [prefix, namespace] of this.prefixes) {
			if (!value.startsWith(namespace)) continue;
			const local = value.slice(namespace.length);
			if (!SAFE_LOCAL.test(local)) continue;
			this.used.add(prefix);
			return `${prefix}:${local}`;
		}
		return `<${escapeIri(value)}>`;
	}

	private literal(l: Literal): string {
		if (l.datatype === XSD_BOOLEAN && (l.value === 'true' || l.value === 'false')) return l.value;
		if (l.datatype === XSD_INTEGER && /^[+-]?[0-9]+$/.test(l.value)) return l.value;
		if (l.datatype === XSD_DECIMAL && /^[+-]?[0-9]*\.[0-9]+$/.test(l.value)) return l.value;
		const quoted = quoteString(l.value);
		if (l.language) return `${quoted}@${l.language}`;
		if (l.datatype !== XSD_STRING && l.datatype !== RDF_LANG_STRING) return `${quoted}^^${this.iri(l.datatype)}`;
		return quoted;
	}
}

function comment(text: string): string {
	return text
		.split(/\r\n|\r|\n/)
		.map((line) => `# ${line}`.trimEnd())
		.join('\n');
}

function escapeIri(iri: string): string {
	return wellFormedText(iri).replace(/[\u0000-\u0020<>"{}|^`\\]/g, uescape);
}

function uescape(c: string): string {
	return `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** A string literal. Text over several lines uses """ so it stays readable. */
function quoteString(value: string): string {
	const text = wellFormedText(value).replace(/[\\"]/g, (c) => `\\${c}`);
	if (text.includes('\n')) {
		return `"""${text.replace(/\r/g, '\\r').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, uescape)}"""`;
	}
	return `"${text
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t')
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, uescape)}"`;
}
