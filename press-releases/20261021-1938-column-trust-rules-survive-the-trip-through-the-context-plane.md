# Column Trust Rules Now Survive the Trip Through the Context Plane

**21 October 2026**

AgileDataGuides today released a fix to the Data Contract, so a Trust Rule attached to a column stays attached when the contract is exported from the Context Plane or imported into the app as a graph.

## The Problem

A Trust Rule in a Data Contract can apply to one or more columns, such as "email must be a valid format" on the email column. The Context Plane stores those attachments as links in the graph. When it turned the graph back into a contract, for a JSON or RTF export, it rebuilt the attachments and then threw them away in the same step. The exported contract listed every rule, but none was attached to a column. The same happened to Glossary Terms attached to columns, and to a graph JSON imported into the standalone app. Columns that came from an imported contract were also matched under the wrong id, so their rules missed even when the rebuild worked.

## The Solution

The rebuilt attachments now stay in the contract, and each one is keyed to its column the same way the column itself is. A contract exported from the Context Plane carries the same column Trust Rules and Glossary Terms that the graph holds.

## Key Benefits

- **Exports match the graph**: every rule attached to a column in the Context Plane is attached in the exported contract
- **Imported contracts keep their links**: columns that came from a standalone contract keep their rules
- **Glossary Terms too**: column Glossary Terms ride the same path and stay attached

The fix is available now in the Data Contract app and the Context Plane in the Context Plane monorepo, and it reaches the public app at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) on its next publish.
