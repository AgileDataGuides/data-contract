// THE one file for the canvas areas and the twelve steps.
//
// Every area title, colour and limit, and every step name, question,
// description, guide and example lives here, so the Canvas grid and the
// 12 Steps tab always say the same thing.
//
// No written AgileData method for Data Contracts exists yet, so the steps
// follow the app's own model: what the data is, who it is for, what it
// holds, what makes it trusted, how it arrives, then a check. Each example
// comes from the Stripe Subscriptions contract, the canonical SaaS example
// (data/stripe-subscriptions-contract.json).
//
// Copy rules for anything a person reads: British spelling, "the
// organisation" never "the business", no em dashes, step labels in the form
// "Step 3 - Team and Personas".

import { listDeliveryTypeLabels } from '$lib/shared-data/delivery-types';

/** The neutral slate of the metadata areas: Domain, Status and the pattern areas. */
export const METADATA_COLOR = '#64748b';

export interface SectionCanon {
	/** The entity label the area holds. */
	label: string;
	/** The area title on the Canvas grid. */
	title: string;
	color: string;
	/** One item only (Data Asset, Domain, Information Product). */
	maxItems?: number;
	/** The word for one item and for many, used in a step's status line. */
	noun: [string, string];
	/** Values offered on the add field. Any other value can still be typed. */
	suggestions?: string[];
	/** The add field's placeholder in a step. */
	placeholder: string;
	/** Lineage hangs off the Data Asset, so it shows only once the contract has one. */
	needsDataAsset?: boolean;
}

export const SECTIONS = {
	global_data_asset: { label: 'global_data_asset', title: 'Data Asset', color: '#0891b2', maxItems: 1, noun: ['Data Asset', 'Data Assets'], placeholder: 'Name the Data Asset' },
	global_domain: { label: 'global_domain', title: 'Domain', color: METADATA_COLOR, maxItems: 1, noun: ['Domain', 'Domains'], placeholder: 'Name the Domain' },
	global_info_product: { label: 'global_info_product', title: 'Information Product', color: '#0ea5e9', maxItems: 1, noun: ['Information Product', 'Information Products'], placeholder: 'Name the Information Product' },
	global_publisher: { label: 'global_publisher', title: 'Team', color: '#f97316', noun: ['Team', 'Teams'], placeholder: 'Add a team that provides or looks after the data' },
	global_persona: { label: 'global_persona', title: 'Personas', color: '#f97316', noun: ['Persona', 'Personas'], placeholder: 'Add a Persona who uses the data' },
	dict_column: { label: 'dict_column', title: 'Details / Schema / Fields', color: '#2563eb', noun: ['Column', 'Columns'], placeholder: 'Add a column' },
	global_glossary_term: { label: 'global_glossary_term', title: 'Glossary Terms', color: '#16a34a', noun: ['Glossary Term', 'Glossary Terms'], placeholder: 'Add a Glossary Term' },
	global_policy: { label: 'global_policy', title: 'Trust Rules', color: '#7c3aed', noun: ['Trust Rule', 'Trust Rules'], placeholder: 'Add a Trust Rule' },
	global_data_sync: { label: 'global_data_sync', title: 'Data Sync', color: '#7c3aed', noun: ['Data Sync', 'Data Syncs'], placeholder: 'Add a Data Sync' },
	global_delivery_type: {
		label: 'global_delivery_type',
		title: 'Delivery / Infrastructure',
		color: '#f97316',
		noun: ['Delivery Type', 'Delivery Types'],
		suggestions: listDeliveryTypeLabels(),
		placeholder: 'Pick or type a Delivery Type'
	},
	lineage_source: { label: 'lineage_source', title: 'Lineage', color: '#6366f1', noun: ['Lineage item', 'Lineage items'], placeholder: 'Add a source, a job or a tool the data passes through', needsDataAsset: true }
} satisfies Record<string, SectionCanon>;

export type SectionLabel = keyof typeof SECTIONS;

export interface PatternAreaCanon {
	/** The shared pattern the values come from. */
	patternId: string;
	title: string;
	/** The contract field the values are saved on. */
	field: 'status' | 'changeDetection' | 'historyWindow' | 'retentionPeriod';
}

export const PATTERN_AREAS = {
	status: { patternId: 'status', title: 'Status', field: 'status' },
	'change-detection': { patternId: 'change-detection', title: 'Change Detection', field: 'changeDetection' },
	'history-window': { patternId: 'history-window', title: 'History Window', field: 'historyWindow' },
	'default-retention-period': { patternId: 'default-retention-period', title: 'Retention Period', field: 'retentionPeriod' }
} satisfies Record<string, PatternAreaCanon>;

export type PatternAreaId = keyof typeof PATTERN_AREAS;

export interface StepCanon {
	id: string;
	number: number;
	name: string;
	/** The question the step asks, the most prominent line of its panel. */
	question: string;
	/** One or two lines on what the step captures. */
	description: string;
	/** More help on how to fill the step in, where it needs it. */
	guide?: string;
	/** An example from the Stripe Subscriptions contract. */
	example: string;
	/** The canvas areas the step fills, in the order the panel shows them. */
	sections: SectionLabel[];
	/** The pattern areas the step sets, in the order the panel shows them. */
	patterns: PatternAreaId[];
	/** A step with its own panel: the Example Data table, or the check of every step. */
	special?: 'example-data' | 'check';
}

export const STEPS: StepCanon[] = [
	{
		id: 'data-asset',
		number: 1,
		name: 'Data Asset',
		question: 'What data does this contract cover?',
		description: 'The one table, file or feed the contract is about. A contract covers one Data Asset.',
		example: 'landing.stripe.subscriptions',
		sections: ['global_data_asset'],
		patterns: []
	},
	{
		id: 'domain-and-information-product',
		number: 2,
		name: 'Domain and Information Product',
		question: 'Where does this data belong, and what does it feed?',
		description: 'The Domain is the part of the organisation the data belongs to. The Information Product is what the data is used to build.',
		example: 'Domain: Finance. Information Product: SaaS Revenue Metrics.',
		sections: ['global_domain', 'global_info_product'],
		patterns: []
	},
	{
		id: 'team-and-personas',
		number: 3,
		name: 'Team and Personas',
		question: 'Who provides the data, and who uses it?',
		description: 'The Team provides the data and looks after it. The Personas are the people who depend on it.',
		guide: 'A contract is an agreement between the people who provide the data and the people who use it. Name both sides before you agree anything else.',
		example: 'Team: Data Engineering, Revenue Operations. Personas: Chief Revenue Officer (CRO), Finance Analyst.',
		sections: ['global_publisher', 'global_persona'],
		patterns: []
	},
	{
		id: 'glossary-terms',
		number: 4,
		name: 'Glossary Terms',
		question: 'What do the business words in this data mean?',
		description: 'The business terms the data uses, so the people who provide it and the people who use it mean the same thing.',
		guide: 'Once the columns are in, link each Glossary Term to the columns that hold it on the Table tab of the standalone app.',
		example: 'Monthly Recurring Revenue (MRR), Annual Recurring Revenue (ARR), Churn.',
		sections: ['global_glossary_term'],
		patterns: []
	},
	{
		id: 'columns',
		number: 5,
		name: 'Columns',
		question: 'What does each row of the data hold?',
		description: 'The columns of the Data Asset, one card each.',
		guide: 'Add each column by its name. Set its data type, the Primary Key, Unique and Required flags and its classification on the Table tab (the Dictionary tab in the Context Plane).',
		example: 'id, customer, status, plan_id, quantity, currency.',
		sections: ['dict_column'],
		patterns: []
	},
	{
		id: 'trust-rules',
		number: 6,
		name: 'Trust Rules',
		question: 'What must be true before people trust this data?',
		description: 'The checks the Team agrees to run on the data, and the rule each one tests.',
		guide: 'Click a Trust Rule card to say what it checks. In the standalone app, write the rule on the Trust Rules tab and attach it to the columns it checks on the Table tab.',
		example: 'Active subscriptions have non-zero MRR. Period start before period end.',
		sections: ['global_policy'],
		patterns: []
	},
	{
		id: 'example-data',
		number: 7,
		name: 'Example Data',
		question: 'What does the data look like?',
		description: 'A few sample rows, so the people who use the data can see its shape before it arrives.',
		guide: 'The table has one column for each column from Step 5. Click a cell to type a value.',
		example: 'id sub_1OsFc7Lp9XpYzQwR4kBnNm5T, status active, quantity 12, currency gbp.',
		sections: [],
		patterns: [],
		special: 'example-data'
	},
	{
		id: 'change-and-history',
		number: 8,
		name: 'Change and History',
		question: 'How do changes arrive, and how much history comes with them?',
		description: 'How a change to the data is found, how much history each delivery carries, and how long the data is kept.',
		example: 'Change Detection: Change Data Capture (Database Logs). History Window: All history. Retention Period: 7 years.',
		sections: [],
		patterns: ['change-detection', 'history-window', 'default-retention-period']
	},
	{
		id: 'data-sync',
		number: 9,
		name: 'Data Sync',
		question: 'When does new data arrive?',
		description: 'The promises about timing: how often the data is refreshed, how late it can be, and how often the pipeline is up.',
		example: 'Refresh frequency, Webhook event latency, Pipeline uptime.',
		sections: ['global_data_sync'],
		patterns: []
	},
	{
		id: 'delivery',
		number: 10,
		name: 'Delivery',
		question: 'Where and how is the data delivered?',
		description: 'The tools, stores and protocols the data is delivered through.',
		example: 'Stripe API, JSON Files, Google Cloud Storage (GCS).',
		sections: ['global_delivery_type'],
		patterns: []
	},
	{
		id: 'lineage',
		number: 11,
		name: 'Lineage',
		question: 'Where does this data come from?',
		description: 'The systems, jobs and tools the data passes through before it reaches the Data Asset.',
		example: 'Stripe Billing Platform, Custom Meltano Stripe Connector, Google BigQuery.',
		sections: ['lineage_source'],
		patterns: []
	},
	{
		id: 'check',
		number: 12,
		name: 'Status and Check',
		question: 'Is the contract ready to agree?',
		description: 'Where the contract is in its life, and which steps still have nothing in them.',
		guide: 'An empty step is not always a gap. Some contracts need no Lineage or no Example Data. Read the list with the Team and the Personas, and agree what to fill in.',
		example: 'Status: Production.',
		sections: [],
		patterns: ['status'],
		special: 'check'
	}
];

/** "Step 3 - Team and Personas" */
export function stepLabel(step: StepCanon): string {
	return `Step ${step.number} - ${step.name}`;
}

/** The tab's name, from its step count: "12 Steps" */
export function stepsTabLabel(): string {
	return `${STEPS.length} Steps`;
}

/** The Lineage step's line when the contract has no Data Asset yet. */
export const NEEDS_DATA_ASSET = 'Lineage hangs off the Data Asset. Add the Data Asset in Step 1 first.';

/** The check step's words. */
export const CHECK = {
	heading: 'Steps with nothing in them',
	none: 'Every step has something in it.',
	goTo: 'Go to'
} as const;
