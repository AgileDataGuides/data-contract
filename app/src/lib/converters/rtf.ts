/**
 * Convert a Data Contract v2.0 native model into an RTF (Rich Text Format)
 * document that renders the contract as a formal legal-style agreement.
 *
 * The output opens natively in Microsoft Word, macOS Pages, LibreOffice,
 * and can be "saved as PDF" from any of those. No external dependency —
 * RTF is a plain-text format with inline formatting codes.
 *
 * The structure mirrors the on-screen Agreement view:
 *   Title · Identification block · 8 numbered clauses · Signature block.
 */
import type { ContractModel } from '../types';

// Change Detection / Retention Period / History Window render as raw strings —
// values come from the shared patterns (see Manage Patterns tab).

// ── RTF escaping ───────────────────────────────────────────────────────

/** Escape a string for RTF. Handles backslashes, braces, and non-ASCII via
 *  the \u<code>? convention (the `?` is a fallback char for readers that
 *  don't speak unicode). */
function esc(s: string | null | undefined): string {
	if (!s) return '';
	let out = '';
	for (const ch of String(s)) {
		const code = ch.charCodeAt(0);
		if (ch === '\\') out += '\\\\';
		else if (ch === '{') out += '\\{';
		else if (ch === '}') out += '\\}';
		else if (ch === '\n') out += '\\line ';
		else if (ch === '\r') continue;
		else if (ch === '\t') out += '\\tab ';
		else if (code >= 0x20 && code < 0x80) out += ch;
		else {
			// Non-ASCII → \u<signed-decimal>?
			const signed = code > 0x7fff ? code - 0x10000 : code;
			out += `\\u${signed}?`;
		}
	}
	return out;
}

// ── Helpers ────────────────────────────────────────────────────────────

function today(): string {
	const d = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** \par shortcut, optional formatting prefix (e.g. `{\b heading}`). */
function par(content: string = ''): string {
	return content + '\\par\n';
}

function heading(text: string, level: 1 | 2 | 3 = 2): string {
	const size = level === 1 ? 36 : level === 2 ? 28 : 24;
	return `{\\pard\\sb240\\sa120\\b\\fs${size} ${esc(text)}\\par}\n`;
}

function subHeading(text: string): string {
	return `{\\pard\\sb120\\sa60\\b\\fs24 ${esc(text)}\\par}\n`;
}

function plain(text: string): string {
	return `{\\pard\\sa60 ${esc(text)}\\par}\n`;
}

function italic(text: string): string {
	return `{\\pard\\sa60\\i ${esc(text)}\\par}\n`;
}

function bulleted(text: string): string {
	return `{\\pard\\fi-200\\li400\\sa60 \\bullet\\tab ${esc(text)}\\par}\n`;
}

function labelValue(label: string, value: string): string {
	return `{\\pard\\sa40{\\b ${esc(label)}:\\b0}\\tab ${esc(value || '\u2014')}\\par}\n`;
}

function hr(): string {
	return `{\\pard\\sb120\\sa120\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}\n`;
}

// ── Main converter ─────────────────────────────────────────────────────

export function contractToRtf(model: ContractModel): string {
	const out: string[] = [];

	// Preamble
	out.push('{\\rtf1\\ansi\\ansicpg1252\\deff0');
	out.push('{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Helvetica;}}');
	out.push('{\\colortbl;\\red0\\green0\\blue0;\\red100\\green116\\blue139;\\red30\\green41\\blue59;}');
	out.push('\\f0\\fs22');
	out.push(''); // blank line for readability

	// Title
	out.push(`{\\pard\\qc\\sb0\\sa0\\b\\fs22\\cf2 ${esc('DATA CONTRACT AGREEMENT')}\\par}`);
	out.push(`{\\pard\\qc\\sb60\\sa120\\b\\fs40\\cf3 ${esc(model.name || 'Untitled Contract')}\\par}`);
	if (model.description) {
		out.push(`{\\pard\\qc\\sa240\\i\\fs22 ${esc(model.description)}\\par}`);
	}
	out.push(hr());

	// Identification block
	out.push(heading('Contract Identification'));
	out.push(labelValue('Contract ID', model.id));
	out.push(labelValue('Version', model.version));
	out.push(labelValue('Status', model.status.length > 0 ? model.status.join(', ').toUpperCase() : ''));
	out.push(labelValue('Domain', model.domain?.name || ''));
	out.push(labelValue('Information Product', model.informationProduct?.name || ''));
	if (model.tags && model.tags.length > 0) {
		out.push(labelValue('Tags', model.tags.join(', ')));
	}
	out.push(labelValue('Effective Date', today()));

	// Preamble paragraph
	out.push(par());
	out.push(italic(
		'This Data Contract Agreement ("Agreement") sets out the terms under which the ' +
		'data producer commits to deliver the data asset described below, and under which ' +
		'the data consumer commits to use it. The terms of this Agreement take effect on ' +
		'the Effective Date shown above.'
	));

	// 1. Parties
	out.push(heading('1. Parties'));
	if (model.team && model.team.length > 0) {
		out.push(plain('This Agreement is entered into by the following parties:'));
		out.push(par());
		for (const member of model.team) {
			out.push(`{\\pard\\sa40\\li200{\\b ${esc(member.name)}\\b0}\\tab (${esc(member.role)})\\par}\n`);
			if (member.description) {
				out.push(`{\\pard\\sa80\\li400\\i\\cf2 ${esc(member.description)}\\par}\n`);
			}
		}
	} else {
		out.push(italic('No parties listed.'));
	}

	// 2. Data Asset
	out.push(heading('2. Data Asset'));
	if (model.dataAsset) {
		out.push(plain('The data asset governed by this Agreement is:'));
		out.push(par());
		out.push(`{\\pard\\sa60\\li200\\b\\fs26 ${esc(model.dataAsset.name)}\\par}\n`);
		if (model.dataAsset.description) {
			out.push(`{\\pard\\sa120\\li200 ${esc(model.dataAsset.description)}\\par}\n`);
		}
	} else {
		out.push(italic('No data asset specified.'));
	}

	// Change Detection + Retention Period + History Window — the temporal shape of each delivery.
	// Each is a string[]; join with ", " for the prose form. Empty list renders as em-dash.
	const fmt = (arr: string[]) => (arr && arr.length > 0 ? arr.join(', ') : '—');
	out.push(plain('Each delivered file or table shall carry data of the following shape and temporal window:'));
	out.push(par());
	out.push(`{\\pard\\sa40\\li200 {\\b Change Detection:} ${esc(fmt(model.changeDetection))}\\par}\n`);
	out.push(`{\\pard\\sa40\\li200 {\\b Retention Period:} ${esc(fmt(model.retentionPeriod))}\\par}\n`);
	out.push(`{\\pard\\sa120\\li200 {\\b History Window:} ${esc(fmt(model.historyWindow))}\\par}\n`);

	// 3. Schema / Columns
	out.push(heading('3. Schema'));
	if (model.columns && model.columns.length > 0) {
		out.push(plain(`The data asset contains ${model.columns.length} column${model.columns.length === 1 ? '' : 's'}:`));
		out.push(par());
		for (const col of model.columns) {
			const flags: string[] = [];
			if (col.primaryKey) flags.push('PRIMARY KEY');
			else if (col.unique) flags.push('UNIQUE');
			if (col.required) flags.push('REQUIRED');
			const flagStr = flags.length > 0 ? ` \u2014 ${flags.join(', ')}` : '';
			out.push(`{\\pard\\sa40\\li200{\\b ${esc(col.name)}\\b0}\\tab {\\i ${esc(col.dataType)}\\i0}${esc(flagStr)}\\par}\n`);
			if (col.description) {
				out.push(`{\\pard\\sa60\\li400\\cf2 ${esc(col.description)}\\par}\n`);
			}
			if (col.classification && col.classification !== 'internal') {
				out.push(`{\\pard\\sa60\\li400\\i\\cf2 Classification: ${esc(col.classification)}\\par}\n`);
			}
		}
	} else {
		out.push(italic('No columns defined.'));
	}

	// 4. Trust Rules
	out.push(heading('4. Trust Rules'));
	if (model.trustRules && model.trustRules.length > 0) {
		out.push(plain(`The following ${model.trustRules.length} Trust Rule${model.trustRules.length === 1 ? '' : 's'} will be enforced:`));
		out.push(par());
		model.trustRules.forEach((rule, i) => {
			const targetField = rule.column === '*' ? 'ALL (table-level)' : (rule.column || 'ALL (table-level)');
			out.push(`{\\pard\\sa40\\li200{\\b 4.${i + 1} ${esc(rule.name)}\\b0}\\par}\n`);
			out.push(`{\\pard\\sa40\\li400 ${esc('Category:')}\\tab ${esc(rule.category || 'Custom')}\\par}\n`);
			out.push(`{\\pard\\sa40\\li400 ${esc('Target field:')}\\tab ${esc(targetField)}\\par}\n`);
			out.push(`{\\pard\\sa40\\li400 ${esc('Rule:')}\\tab ${esc(rule.rule || '(rule statement not provided)')}\\par}\n`);
			if (rule.description) {
				out.push(`{\\pard\\sa80\\li400\\i\\cf2 ${esc(rule.description)}\\par}\n`);
			}
		});
	} else {
		out.push(italic('No Trust Rules defined.'));
	}

	// 5. Data Sync
	out.push(heading('5. Data Sync'));
	if (model.dataSyncs && model.dataSyncs.length > 0) {
		for (const sync of model.dataSyncs) {
			out.push(`{\\pard\\sa40\\li200{\\b ${esc(sync.name)}\\b0}\\par}\n`);
			out.push(`{\\pard\\sa40\\li400 ${esc(`${sync.property}:`)}\\tab ${esc(`${sync.value} ${sync.unit}`.trim())}\\par}\n`);
			if (sync.description) {
				out.push(`{\\pard\\sa80\\li400\\i\\cf2 ${esc(sync.description)}\\par}\n`);
			}
		}
	} else {
		out.push(italic('No Data Sync commitments defined.'));
	}

	// 6. Glossary Terms
	out.push(heading('6. Glossary Terms'));
	if (model.glossaryTerms && model.glossaryTerms.length > 0) {
		for (const term of model.glossaryTerms) {
			out.push(bulleted(term.description ? `${term.name} \u2014 ${term.description}` : term.name));
		}
	} else {
		out.push(italic('No glossary terms listed.'));
	}

	// 7. Delivery / Infrastructure
	out.push(heading('7. Delivery & Infrastructure'));
	if (model.deliveryTypes && model.deliveryTypes.length > 0) {
		for (const del of model.deliveryTypes) {
			out.push(bulleted(del.description ? `${del.name} \u2014 ${del.description}` : del.name));
		}
	} else {
		out.push(italic('No delivery infrastructure specified.'));
	}

	// 8. Lineage
	out.push(heading('8. Lineage'));
	if (model.lineage && model.lineage.length > 0) {
		out.push(plain('Upstream data sources and downstream dependencies:'));
		out.push(par());
		for (const lin of model.lineage) {
			out.push(bulleted(lin.description ? `${lin.name} \u2014 ${lin.description}` : lin.name));
		}
	} else {
		out.push(italic('No lineage documented.'));
	}

	// Personas (bonus section — not numbered because it's informational)
	if (model.personas && model.personas.length > 0) {
		out.push(heading('Consumer Personas', 3));
		out.push(plain('This data asset is consumed by the following personas:'));
		for (const p of model.personas) {
			out.push(bulleted(p.description ? `${p.name} \u2014 ${p.description}` : p.name));
		}
	}

	// Signature block
	out.push(par());
	out.push(hr());
	out.push(heading('Signatures', 2));
	out.push(plain('By signing below, the parties agree to the terms of this Data Contract Agreement.'));
	out.push(par());

	const sigBlock = (role: string) => {
		const parts = [
			`{\\pard\\sb120\\sa60\\b\\cf2 ${esc(role)}\\par}`,
			`{\\pard\\sa120 ${esc('Name:')}\\tab ${esc('__________________________________________________')}\\par}`,
			`{\\pard\\sa120 ${esc('Signature:')}\\tab ${esc('______________________________________________')}\\par}`,
			`{\\pard\\sa200 ${esc('Date:')}\\tab ${esc('__________________________________________________')}\\par}`,
		];
		return parts.join('\n') + '\n';
	};

	out.push(sigBlock('FOR THE PRODUCER'));
	out.push(sigBlock('FOR THE CONSUMER'));

	// Footer — small grey disclaimer
	out.push(par());
	out.push(`{\\pard\\qc\\sa0\\i\\fs18\\cf2 ${esc(`Generated from Context Plane on ${today()}. This Agreement is a living document — see the Context Plane for the latest version.`)}\\par}\n`);

	// Close
	out.push('}');

	return out.join('\n');
}
