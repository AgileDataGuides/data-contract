# The Data Contract Now Guides a Team Through It One Step at a Time

**3 November 2026**

AgileDataGuides today released a 12 Steps tab for the Data Contract app, so the people who provide a dataset and the people who use it can agree a contract one question at a time, instead of facing fifteen empty boxes at once.

## The Problem

The Data Contract canvas showed every area on one page: Data Asset, Status, Domain, Information Product, Change Detection, Retention Period, History Window, columns, Trust Rules, Data Sync, Glossary Terms, Team, Personas, Delivery and Lineage. That page is the right view once a contract is full. For a team starting a new contract, it gave no way in. People did not know which box to fill first. Teams tend to start with the columns and the Delivery Types, the parts that feel technical, and leave the parts that make a contract an agreement: who uses the data, what the business words mean, and what must be true before anyone trusts it. Example Data sat on its own tab, where it was easy to forget. The Concept Model app already walked a team through its method one step at a time, and the Data Contract had nothing like it.

## The Solution

The app now opens on a **12 Steps** tab, the first of its tabs. Twelve steps run down the left, each with a line that reads off the contract, for example "2 Teams, No Personas yet" or "1 example row". Click a step and its panel opens on the right: the question the step asks, a line on what it captures, help on how to fill it in where a step needs it, and an example from the Stripe Subscriptions contract. Under that are the step's own areas. Type an answer, press Enter, and the cursor stays in the field for the next one. The pattern steps show the same pickers as the canvas, and the Example Data step shows the sample-rows table. A Back and Next bar under the panel names the step before and the step after.

## How It Works

The steps run from what the data is, to who it is for, to what it holds, to what makes it trusted, to how it arrives: Data Asset, Domain and Information Product, Team and Personas, Glossary Terms, Columns, Trust Rules, Example Data, Change and History, Data Sync, Delivery, Lineage, and Status and Check. The last step sets the contract's Status and lists every step that still has nothing in it, each with a Go to link. An empty step is a prompt to talk, not a failure: some contracts need no Lineage. The steps are a checklist, never a wizard. Every step is one click away at any time, and no step locks another. The 12 Steps tab and the Canvas tab hold the same cards, so a card added in a step appears on the canvas at once. The 12 Steps tab also shows inside the Context Plane, as the first tab of the embedded Data Contract.

## Key Benefits

- **A way in for a blank contract**: the team answers one question at a time, from the Data Asset to the Status
- **Both sides of the agreement**: the Team and the Personas come before the columns, so the people who use the data are named first
- **Example Data in the flow**: sample rows are a step of their own, not a tab people forget
- **A check before agreement**: the last step lists the empty steps, so the gaps are talked about, not missed
- **Built for the room**: Enter adds and keeps the cursor, so a Facilitator can type as fast as people talk
- **Nothing to relearn**: the same cards, the same pickers, and the full canvas one tab away

The 12 Steps tab is available now in the Data Contract app in the Context Plane monorepo, and it reaches the public app at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) on its next publish.
