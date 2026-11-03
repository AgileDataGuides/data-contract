// The design tokens the Steps tab uses, copied from design/tokens.md.
//
// tokens.md is AUTHORITATIVE: if this file and tokens.md disagree, tokens.md
// wins. They live here, not imported from @context-plane/shared/design-tokens,
// because scripts/publish-app.sh does not bundle that module into the public
// repo. The Concept Model and the Information Product Canvas keep their own
// copies for the same reason.

/** tokens.md buttons */
export const BUTTON = {
	/** buttons.success_create_outlined */
	add: 'px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 transition-colors'
};

/** tokens.md form_inputs */
export const INPUT = {
	/** form_inputs.text */
	text: 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white'
};

/** The canvas area header: the area title in its entity colour (CanvasSection). */
export const AREA_TITLE = 'text-[10px] font-bold uppercase tracking-wider';

/** tokens.md cards.default, with cards.list_divider for a card that holds a list of rows */
export const CARD = 'bg-white rounded-lg shadow-sm border border-slate-200';
export const CARD_LIST_DIVIDER = 'divide-y divide-slate-100';

/** tokens.md typography */
export const TYPE = {
	/** typography.label_table_header */
	sectionHeader: 'text-[11px] font-semibold uppercase tracking-wider text-slate-500',
	/** typography.card_title */
	cardTitle: 'text-xs font-medium text-slate-800 leading-tight',
	/** typography.body */
	body: 'text-sm text-slate-600'
};

/** tokens.md step_rail: the steps down the left of the Steps tab (DESIGN_SYSTEM.md § 18 Step Rail). */
export const STEP_RAIL = {
	container: 'w-72 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto',
	row: 'w-full text-left flex items-start gap-2 px-3 py-2 border-l-2 transition-colors',
	rowActive: 'bg-white border-blue-600',
	rowInactive: 'border-transparent hover:bg-slate-100',
	labelActive: 'text-xs font-semibold text-slate-800',
	labelInactive: 'text-xs font-medium text-slate-600',
	status: 'text-[10px] text-slate-400 leading-tight',
	dotStarted: 'mt-1 w-2 h-2 shrink-0 rounded-full bg-slate-600',
	dotEmpty: 'mt-1 w-2 h-2 shrink-0 rounded-full border border-slate-300'
};

/** tokens.md step_panel: the header of the selected step (DESIGN_SYSTEM.md § 18 Step Panel). */
export const STEP_PANEL = {
	label: 'text-xs font-semibold text-slate-500',
	question: 'text-base font-semibold text-slate-800',
	description: 'text-xs text-slate-500 leading-relaxed',
	body: 'px-6 py-5',
	/** The app's own guidance line under the description, where a step needs more help */
	guide: 'text-xs text-slate-700 leading-relaxed'
};

/** tokens.md hint: a quiet line, never a gate (DESIGN_SYSTEM.md § 18). The example on a step. */
export const HINT = {
	quiet: 'flex items-start gap-1.5 text-[11px] text-slate-500 leading-snug',
	icon: 'w-3.5 h-3.5 shrink-0 mt-px text-slate-400'
};

/** tokens.md step_nav: Back and Next under the selected step (DESIGN_SYSTEM.md § 18 Step Nav). */
export const STEP_NAV = {
	bar: 'shrink-0 flex items-center justify-between gap-3 px-6 py-2.5 border-t border-slate-200 bg-white',
	/** buttons.secondary_slate, with room for the arrow */
	button:
		'inline-flex items-center gap-1.5 min-w-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors',
	label: 'truncate',
	/** Heroicons outline arrow-left / arrow-right */
	icon: 'w-4 h-4 shrink-0'
};

/** tokens.md row_actions.neutral: the Go to link on a row of the check step. */
export const ROW_ACTION = 'text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors';
