# Data Contract ODCS and OpenMetadata Exports Now Publish Real Column Types

**12 June 2026**

AgileDataGuides today fixed a silent corruption in the Data Contract app's standards exports: every column left the building typed as a string.

## The Problem

The Data Contract canvas stores each column's type in the `dataType` property, matching the Data Dictionary. But the ODCS (Bitol) and OpenMetadata language modules still read the older `logicalType` property name, which no current contract carries. The fallback kicked in on every column, so a contract with integers, decimals, dates, timestamps and booleans exported a YAML or JSON-LD document declaring every single column a string. Consumers validating against the published contract saw types that contradicted the canvas, and nothing in the app hinted anything was wrong.

## The Solution

Both language modules now read the current `dataType` property first and fall back to the legacy `logicalType` only for older graphs. Integer columns export as integers, dates as dates — the published contract finally says what the canvas says. A leftover diagnostic logger that dumped a stack trace to the console on every tab change was also removed.

## Key Benefits

- **Published contracts are trustworthy** — ODCS and OpenMetadata documents carry the real column types
- **Both standards fixed at once** — the same stale read existed in each module
- **Quieter console** — no more diagnostic stack traces while navigating tabs

The fixes are available now on `main` in the Context Plane monorepo.
