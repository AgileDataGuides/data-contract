/**
 * Convert a Data Contract v2.1 native model into a self-contained styled
 * HTML document suitable for two jobs:
 *
 *   1. **Export Word (.doc)** — Microsoft Word opens HTML files with full
 *      inline styling and renders them as a Word document. Save with a
 *      .doc extension and `application/msword` MIME type; the file
 *      opens natively in Word, Pages, and LibreOffice.
 *
 *   2. **Export PDF** — open the HTML in a new browser window and call
 *      `print()` — the browser's "Save as PDF" produces the PDF. No
 *      runtime library required; the browser is the renderer.
 *
 * Inline styles only (Word's HTML renderer ignores <style> blocks in many
 * cases). Layout mirrors ContractAgreementView.svelte so the document
 * reads the same on screen, in Word, and in a printed PDF.
 */
import type { ContractModel } from '../types';

// Change Detection / Retention Period / History Window render as raw strings —
// values come from the shared patterns (see Manage Patterns tab).

// ── HTML escaping ────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
	if (!s) return '';
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function today(): string {
	const d = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Inline style shortcuts ───────────────────────────────────────────

const S = {
	page: "font-family: 'Times New Roman', serif; font-size: 11pt; color: #1e293b; max-width: 780px; margin: 0 auto; padding: 32px;",
	titleBlock: "text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 24px; margin-bottom: 24px;",
	supertitle: "font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 3px; color: #64748b; margin: 0 0 6px 0;",
	h1: "font-size: 20pt; font-weight: bold; color: #0f172a; margin: 0;",
	description: "font-size: 10pt; color: #475569; font-style: italic; margin: 8px 0 0 0;",
	h2: "font-size: 14pt; font-weight: bold; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 24px 0 8px 0;",
	h3: "font-size: 12pt; font-weight: bold; color: #334155; margin: 18px 0 6px 0;",
	para: "font-size: 11pt; color: #334155; margin: 6px 0;",
	idTable: "width: 100%; border-collapse: collapse; margin: 12px 0 24px 0;",
	idTableRow: "border-bottom: 1px solid #e2e8f0;",
	idTableLabel: "padding: 6px 16px 6px 0; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; width: 160px; vertical-align: top;",
	idTableValue: "padding: 6px 0; font-size: 10pt; color: #1e293b; vertical-align: top;",
	schemaTable: "width: 100%; border-collapse: collapse; margin: 12px 0;",
	schemaTh: "padding: 6px 10px; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; text-align: left; background: #f1f5f9; border: 1px solid #cbd5e1;",
	schemaTd: "padding: 6px 10px; font-size: 10pt; color: #334155; border: 1px solid #e2e8f0; vertical-align: top;",
	schemaTdMono: "padding: 6px 10px; font-size: 9pt; color: #334155; border: 1px solid #e2e8f0; font-family: 'Courier New', monospace; vertical-align: top;",
	ol: "padding-left: 28px; margin: 8px 0;",
	li: "margin: 10px 0; font-size: 10pt; color: #334155;",
	listGrid: "margin: 4px 0 4px 20px; font-size: 9pt; color: #475569;",
	empty: "margin: 4px 0 0 16px; font-size: 10pt; color: #94a3b8; font-style: italic;",
	hr: "border: none; border-top: 1px solid #cbd5e1; margin: 32px 0;",
	sigBlock: "margin: 24px 0 40px 0; page-break-inside: avoid;",
	sigHeading: "font-size: 10pt; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 10px 0;",
	sigLine: "margin: 10px 0; font-size: 10pt; color: #334155;",
	footer: "margin-top: 24px; text-align: center; font-size: 8pt; color: #94a3b8; font-style: italic;",
	printCss:
		"@page { size: A4; margin: 20mm; }\n" +
		"@media print { body { max-width: none !important; padding: 0 !important; } }"
};

function idRow(label: string, value: string | undefined | null): string {
	const v = value ? esc(value) : '—';
	return `<tr style="${S.idTableRow}"><td style="${S.idTableLabel}">${esc(label)}</td><td style="${S.idTableValue}">${v}</td></tr>\n`;
}

// ── Main converter ───────────────────────────────────────────────────

export function contractToHtml(model: ContractModel): string {
	const parts: string[] = [];

	parts.push('<!DOCTYPE html>');
	parts.push('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">');
	parts.push('<head>');
	parts.push(`<meta charset="utf-8">`);
	parts.push(`<title>${esc(model.name || 'Data Contract Agreement')}</title>`);
	parts.push(`<style>${S.printCss}</style>`);
	parts.push('</head>');
	parts.push(`<body style="${S.page}">`);

	// Title block
	parts.push('<header style="' + S.titleBlock + '">');
	parts.push(`<p style="${S.supertitle}">Data Contract Agreement</p>`);
	parts.push(`<h1 style="${S.h1}">${esc(model.name || 'Untitled Contract')}</h1>`);
	if (model.description) {
		parts.push(`<p style="${S.description}">${esc(model.description)}</p>`);
	}
	parts.push('</header>');

	// Identification block
	parts.push(`<h2 style="${S.h2}">Contract Identification</h2>`);
	parts.push(`<table style="${S.idTable}"><tbody>`);
	parts.push(idRow('Contract ID', model.id));
	parts.push(idRow('Version', model.version));
	parts.push(idRow('Status', model.status.length > 0 ? model.status.join(', ').toUpperCase() : ''));
	parts.push(idRow('Domain', model.domain?.name || ''));
	parts.push(idRow('Information Product', model.informationProduct?.name || ''));
	if (model.tags && model.tags.length > 0) {
		parts.push(idRow('Tags', model.tags.join(', ')));
	}
	parts.push(idRow('Effective Date', today()));
	parts.push('</tbody></table>');

	// Preamble
	parts.push(`<p style="${S.para}"><em>This Data Contract Agreement ("Agreement") sets out the terms under which the data producer commits to deliver the data asset described below, and under which the data consumer commits to use it. The terms of this Agreement take effect on the Effective Date shown above.</em></p>`);

	// 1. Parties
	parts.push(`<h2 style="${S.h2}">1. Parties</h2>`);
	if (model.team && model.team.length > 0) {
		parts.push(`<p style="${S.para}">This Agreement is entered into by the following parties:</p>`);
		parts.push(`<ul style="${S.ol}">`);
		for (const member of model.team) {
			parts.push(`<li style="${S.li}"><strong>${esc(member.name)}</strong> &nbsp;(${esc(member.role)})`);
			if (member.description) parts.push(`<br><em style="color: #64748b;">${esc(member.description)}</em>`);
			parts.push('</li>');
		}
		parts.push('</ul>');
	} else {
		parts.push(`<p style="${S.empty}">No parties listed.</p>`);
	}

	// 2. Data Asset
	parts.push(`<h2 style="${S.h2}">2. Data Asset</h2>`);
	if (model.dataAsset) {
		parts.push(`<p style="${S.para}">The data asset governed by this Agreement is:</p>`);
		parts.push(`<p style="margin: 8px 0 4px 20px; font-size: 12pt; font-weight: bold; color: #0f172a;">${esc(model.dataAsset.name)}</p>`);
		if (model.dataAsset.description) {
			parts.push(`<p style="margin: 4px 0 12px 20px; ${S.para}">${esc(model.dataAsset.description)}</p>`);
		}
	} else {
		parts.push(`<p style="${S.empty}">No data asset specified.</p>`);
	}

	// Change Detection + Retention Period + History Window — the temporal shape of each delivery.
	// Each is a string[]; join for prose form.
	const fmt = (arr: string[]) => (arr && arr.length > 0 ? arr.join(', ') : '—');
	parts.push(`<p style="${S.para}">Each delivered file or table shall carry data of the following shape and temporal window:</p>`);
	parts.push(`<table style="${S.idTable}"><tbody>`);
	parts.push(`<tr style="${S.idTableRow}"><td style="padding: 6px 12px 6px 0; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; width: 160px;">Change Detection</td><td style="padding: 6px 0; color: #1e293b;">${esc(fmt(model.changeDetection))}</td></tr>`);
	parts.push(`<tr style="${S.idTableRow}"><td style="padding: 6px 12px 6px 0; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b;">Retention Period</td><td style="padding: 6px 0; color: #1e293b;">${esc(fmt(model.retentionPeriod))}</td></tr>`);
	parts.push(`<tr style="${S.idTableRow}"><td style="padding: 6px 12px 6px 0; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b;">History Window</td><td style="padding: 6px 0; color: #1e293b;">${esc(fmt(model.historyWindow))}</td></tr>`);
	parts.push('</tbody></table>');

	// 3. Schema
	parts.push(`<h2 style="${S.h2}">3. Schema</h2>`);
	if (model.columns && model.columns.length > 0) {
		parts.push(`<p style="${S.para}">The data asset contains ${model.columns.length} column${model.columns.length === 1 ? '' : 's'}:</p>`);
		parts.push(`<table style="${S.schemaTable}"><thead><tr>`);
		parts.push(`<th style="${S.schemaTh}">Column</th>`);
		parts.push(`<th style="${S.schemaTh}">Data Type</th>`);
		parts.push(`<th style="${S.schemaTh}">Flags</th>`);
		parts.push(`<th style="${S.schemaTh}">Description</th>`);
		parts.push('</tr></thead><tbody>');
		for (const col of model.columns) {
			const flags: string[] = [];
			if (col.primaryKey) flags.push('PK');
			else if (col.unique) flags.push('UNIQUE');
			if (col.required) flags.push('REQUIRED');
			if (col.classification && col.classification !== 'internal') flags.push(col.classification.toUpperCase());
			parts.push('<tr>');
			parts.push(`<td style="${S.schemaTdMono}"><strong>${esc(col.name)}</strong></td>`);
			parts.push(`<td style="${S.schemaTdMono}">${esc(col.dataType)}</td>`);
			parts.push(`<td style="${S.schemaTd}">${esc(flags.join(', '))}</td>`);
			parts.push(`<td style="${S.schemaTd}">${esc(col.description || '')}</td>`);
			parts.push('</tr>');
		}
		parts.push('</tbody></table>');
	} else {
		parts.push(`<p style="${S.empty}">No columns defined.</p>`);
	}

	// 4. Trust Rules
	parts.push(`<h2 style="${S.h2}">4. Trust Rules</h2>`);
	if (model.trustRules && model.trustRules.length > 0) {
		parts.push(`<p style="${S.para}">The following ${model.trustRules.length} Trust Rule${model.trustRules.length === 1 ? '' : 's'} will be enforced:</p>`);
		parts.push(`<ol style="${S.ol}">`);
		model.trustRules.forEach((rule) => {
			const targetField = rule.column === '*' ? 'ALL (table-level)' : (rule.column || 'ALL (table-level)');
			parts.push(`<li style="${S.li}"><strong>${esc(rule.name)}</strong>`);
			parts.push(`<div style="${S.listGrid}">`);
			parts.push(`<div><strong>Category:</strong> ${esc(rule.category || 'Custom')}</div>`);
			parts.push(`<div><strong>Target field:</strong> ${esc(targetField)}</div>`);
			parts.push(`<div><strong>Rule:</strong> ${esc(rule.rule || '(rule statement not provided)')}</div>`);
			if (rule.description) parts.push(`<div style="font-style: italic; color: #64748b;">${esc(rule.description)}</div>`);
			parts.push('</div>');
			parts.push('</li>');
		});
		parts.push('</ol>');
	} else {
		parts.push(`<p style="${S.empty}">No Trust Rules defined.</p>`);
	}

	// 5. Data Sync
	parts.push(`<h2 style="${S.h2}">5. Data Sync</h2>`);
	if (model.dataSyncs && model.dataSyncs.length > 0) {
		parts.push(`<ol style="${S.ol}">`);
		for (const sync of model.dataSyncs) {
			parts.push(`<li style="${S.li}"><strong>${esc(sync.name)}</strong>`);
			parts.push(`<div style="${S.listGrid}">`);
			parts.push(`<div><strong>${esc(sync.property)}:</strong> ${esc(`${sync.value} ${sync.unit}`.trim())}</div>`);
			if (sync.description) parts.push(`<div style="font-style: italic; color: #64748b;">${esc(sync.description)}</div>`);
			parts.push('</div>');
			parts.push('</li>');
		}
		parts.push('</ol>');
	} else {
		parts.push(`<p style="${S.empty}">No Data Sync commitments defined.</p>`);
	}

	// 6. Glossary Terms
	parts.push(`<h2 style="${S.h2}">6. Glossary Terms</h2>`);
	if (model.glossaryTerms && model.glossaryTerms.length > 0) {
		parts.push(`<p style="${S.para}">The following Glossary Terms used in this Agreement have the meanings assigned below:</p>`);
		parts.push(`<dl style="margin: 8px 0 8px 20px;">`);
		for (const term of model.glossaryTerms) {
			parts.push(`<dt style="margin-top: 8px; font-size: 10pt; font-weight: bold; color: #0f172a;">&ldquo;${esc(term.name)}&rdquo;</dt>`);
			parts.push(`<dd style="margin: 2px 0 0 16px; font-size: 10pt; color: #475569;">— ${esc(term.description || '(no definition)')}</dd>`);
		}
		parts.push('</dl>');
	} else {
		parts.push(`<p style="${S.empty}">No Glossary Terms defined.</p>`);
	}

	// 7. Delivery
	parts.push(`<h2 style="${S.h2}">7. Delivery & Infrastructure</h2>`);
	if (model.deliveryTypes && model.deliveryTypes.length > 0) {
		parts.push(`<ul style="${S.ol}">`);
		for (const del of model.deliveryTypes) {
			parts.push(`<li style="${S.li}"><strong>${esc(del.name)}</strong>`);
			if (del.description) parts.push(` &mdash; ${esc(del.description)}`);
			parts.push('</li>');
		}
		parts.push('</ul>');
	} else {
		parts.push(`<p style="${S.empty}">No delivery infrastructure specified.</p>`);
	}

	// 8. Lineage
	parts.push(`<h2 style="${S.h2}">8. Lineage</h2>`);
	if (model.lineage && model.lineage.length > 0) {
		parts.push(`<p style="${S.para}">Upstream data sources and downstream dependencies:</p>`);
		parts.push(`<ul style="${S.ol}">`);
		for (const lin of model.lineage) {
			parts.push(`<li style="${S.li}"><strong>${esc(lin.name)}</strong>`);
			if (lin.description) parts.push(` &mdash; ${esc(lin.description)}`);
			parts.push('</li>');
		}
		parts.push('</ul>');
	} else {
		parts.push(`<p style="${S.empty}">No lineage documented.</p>`);
	}

	// Personas (bonus — informational)
	if (model.personas && model.personas.length > 0) {
		parts.push(`<h3 style="${S.h3}">Consumer Personas</h3>`);
		parts.push(`<p style="${S.para}">This data asset is consumed by the following personas:</p>`);
		parts.push(`<ul style="${S.ol}">`);
		for (const p of model.personas) {
			parts.push(`<li style="${S.li}"><strong>${esc(p.name)}</strong>`);
			if (p.description) parts.push(` &mdash; ${esc(p.description)}`);
			parts.push('</li>');
		}
		parts.push('</ul>');
	}

	// Signature block
	parts.push(`<hr style="${S.hr}">`);
	parts.push(`<h2 style="${S.h2}">Signatures</h2>`);
	parts.push(`<p style="${S.para}">By signing below, the parties agree to the terms of this Data Contract Agreement.</p>`);

	const sigBlock = (role: string) => {
		const lines = [
			`<div style="${S.sigBlock}">`,
			`<p style="${S.sigHeading}">${esc(role)}</p>`,
			`<p style="${S.sigLine}">Name: ____________________________________________________</p>`,
			`<p style="${S.sigLine}">Signature: _______________________________________________</p>`,
			`<p style="${S.sigLine}">Date: ____________________________________________________</p>`,
			'</div>'
		];
		return lines.join('\n');
	};
	parts.push(sigBlock('FOR THE PRODUCER'));
	parts.push(sigBlock('FOR THE CONSUMER'));

	// Footer
	parts.push(`<p style="${S.footer}">Generated from Context Plane on ${today()}. This Agreement is a living document — see the Context Plane for the latest version.</p>`);

	parts.push('</body></html>');

	return parts.join('\n');
}
