# Data Contract Goes Public with Three Stripe SaaS Revenue Examples and a Live Demo

**1 May 2026**

AgileDataGuides today published the Data Contract app to a public open-source repo, alongside a live in-browser demo that runs entirely on GitHub Pages. The demo is seeded with three example contracts modelling the Stripe APIs that almost every SaaS company uses to bill customers — the canonical SaaS revenue funnel from customer master through MRR / ARR to recognised revenue.

This is an **alpha release**, published so the AgileDataGuides community can collaborate on what the Data Contract app should look like and behave like as it matures.

## The Problem

The Data Contract app had been incubated inside the Context Plane monorepo for several weeks while the core data model, ODCS / OpenMetadata / PROV-O alignment, and the multi-format export story (JSON / ODCS YAML / OpenMetadata JSON / RTF / Word / PDF) all stabilised. But it wasn't shareable — anyone who wanted to try it had to clone the entire monorepo, install pnpm, build the shared package, and run a SvelteKit dev server. That's a real barrier for the data leaders, RevOps managers, and finance analysts the app is most useful to.

There were also no realistic example contracts. Users opened the app to a single placeholder contract and were left to figure out the shape of a good Data Contract from scratch.

## The Solution

Three pieces shipped together.

### Public repo

The Data Contract app now lives at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) as a standalone open-source project under the MIT licence. The repo is self-contained — the shared types, canvas components, data catalogues, and language modules from the Context Plane monorepo are all bundled in at publish time, so nothing the standalone app imports lives outside its own `app/` directory.

The publish flow is automated — `./scripts/publish-app.sh data-contract --push` syncs the monorepo's working copy to the public repo, rewrites cross-package imports, bundles shared code locally, copies example contracts, and pushes the changes. Same script that already publishes the IPC and Business Event Matrix.

### Three Stripe SaaS Revenue example contracts

The app now ships with three example contracts modelling the Stripe APIs that drive the canonical SaaS revenue stack:

- **Stripe Customers** (`/v1/customers`) — the customer master record. 10 columns covering id, email, name, currency, balance, delinquent, tax_exempt; 6 trust rules (id format, uniqueness, email validity, currency ISO 4217, PII classification, freshness)
- **Stripe Subscriptions** (`/v1/subscriptions`) — the foundation of the SaaS revenue model. 15 columns including `mrr_amount_local`, `current_period_end`, `cancel_at_period_end`; 8 trust rules including the calculated MRR sanity checks and the FK to Customers
- **Stripe Invoices** (`/v1/invoices`) — drives recognised revenue and AR aging. 16 columns; 9 trust rules including `amount_remaining = amount_due - amount_paid` and "paid invoices have zero remaining"

All three share `domain: Finance` and `informationProduct: SaaS Revenue Metrics`, and cross-reference each other via foreign keys (Subscription.customer → Customer.id, Invoice.subscription → Subscription.id) plus shared glossary terms (MRR, ARR, Churn, Recognised Revenue, AR). They thread together into a coherent SaaS revenue product story so users can see how multiple Data Contracts connect across a real dataset stack.

### Live demo on GitHub Pages

A new build mode (`pnpm build:demo`) compiles the SvelteKit app with `adapter-static` and a localStorage-backed persistence layer, producing a pure client-side SPA that runs entirely in the browser. A GitHub Actions workflow (`deploy-demo.yml`) deploys the build to GitHub Pages on every push to main.

The demo lives at **[agiledataguides.github.io/data-contract](https://agiledataguides.github.io/data-contract/)** — no install, no sign-up, just a link. On first visit, the three Stripe contracts seed into localStorage so visitors land on a populated app, not an empty one. Everything stays in the visitor's browser; nothing is sent to any server.

A second workflow (`build-on-pr.yml`) runs typecheck + production build + demo build on every pull request to main, catching breakage before merge. Dependabot watches the npm dependencies and GitHub Actions weekly.

## How It Works

The publish script bundles a non-trivial set of dependencies inline:

- Shared types from `packages/shared/src/index.ts` get written to `app/src/lib/cp-shared.ts`
- Shared canvas components (`CanvasSection`, `CanvasCard`, `CanvasAreaShell`, `DictionaryTableView`) get copied into `app/src/lib/components/canvas/`
- The pattern + delivery-type catalogues from `packages/shared/data/` and their helper modules from `packages/shared/src/data/` get copied into `app/src/lib/shared-data/`
- The five language modules (Bitol, OpenMetadata, Malloy, dbt-MetricFlow, OSI) from `packages/shared/src/languages/` get copied into `app/src/lib/languages/`
- All `@context-plane/shared` imports get rewritten to local `$lib/...` paths
- The `yaml` runtime dependency (used by Bitol) gets added to the standalone app's `package.json`

The live demo seeds the three Stripe contracts via build-time imports (`import customers from '$data/stripe-customers-contract.json'`), so the JSON files are inlined into the SPA bundle and seeded into localStorage on first visit when no models are present.

## Key Benefits

- **Zero-friction trial** — share a link, the recipient is using the app in seconds, no install
- **Realistic examples** — three Stripe contracts that thread together through the SaaS revenue funnel, not a single placeholder
- **Self-contained repo** — the public repo has no monorepo dependencies; anyone can clone it standalone
- **Multi-format export from day one** — JSON / ODCS YAML / OpenMetadata JSON / RTF / Word / PDF all work in the demo
- **CI for pull requests** — typecheck + production build + demo build every PR
- **Auto-deploy** — every commit to main rebuilds the live demo

## Try It

- **Live demo**: [agiledataguides.github.io/data-contract](https://agiledataguides.github.io/data-contract/)
- **Source**: [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract)
- **Local install**: clone the repo, `./start-data-contract.sh`, open `http://localhost:5119`

The Data Contract is an alpha release. Feedback, questions, and pull requests welcome — open an issue at [github.com/AgileDataGuides/data-contract/issues](https://github.com/AgileDataGuides/data-contract/issues).
