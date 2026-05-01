# Manage Pattern Types Gets a Reversible Toggle, Trash Icon, and Per-Pattern Export

**30 April 2026**

AgileDataGuides today released a UX upgrade to the Manage Pattern Types section of the Data Contract app. Each pattern type chip now carries three actions — edit, trash for permanent delete, and a toggle switch to hide a pattern from the canvas without deleting it. Users can also export and import a single pattern type as a JSON bundle, in addition to the existing all-patterns bundle.

## The Problem

Two pain points in the previous Manage Pattern Types UI:

**Destructive-only delete.** The chip's only remove action was a small × button that hard-deleted the pattern. There was no way to "hide a pattern from the canvas while keeping it in the catalogue." If a user wanted to temporarily de-clutter the canvas — say, hide History Window because their contract didn't care about it — the only option was to delete the pattern entirely, then either re-add it manually later or hit Reset to Defaults (which also wiped every other customisation).

**All-or-nothing export.** The existing **Export Patterns** button bundled every pattern type into one JSON file. To share or back up a single pattern — for example, a custom Trust Tier pattern someone wanted to copy from one contract to another — users had to manually surgery the JSON.

## The Solution

Two related changes.

### Toggle switch + trash icon

Each chip now displays four elements left-to-right:

1. Pattern name
2. M / S badge (Multi-select / Single-select)
3. Edit (✎) — opens inline rename + multi-select toggle
4. **Trash icon** — permanent delete with strong confirm wording
5. **Toggle switch** — flips `enabled: false` on the pattern; reversible

When a pattern is toggled off, its chip dims to 50% opacity. The canvas filters by `enabled !== false`, so the pattern's column / row / dropdown disappears from view. Click the toggle again to bring it back. Nothing is destroyed.

Trash is for permanent deletion — the pattern and any per-contract overrides are removed. The confirm dialog explicitly tells the user *"use the toggle to hide instead"* if they just want to de-clutter.

### Per-pattern Export

A new **Export this Pattern Type** button sits next to Save and Reset to Defaults. It writes the currently-selected pattern as a single-bundle JSON containing the pattern definition, its values, the pattern description, and per-value descriptions. The file name embeds the pattern ID (e.g. `pattern-change-detection-2026-04-30-091322.json`).

The existing **Export Patterns** button is renamed to **Export all Pattern Types** for clarity.

### Auto-detecting Import

The **Import Patterns** button auto-detects which kind of bundle was selected:

- **All-bundle** (plural `patternTypes` array) — replaces the entire catalogue
- **Single-bundle** (singular `patternType` object) — adds the pattern as a new chip, OR replaces the existing pattern with a matching ID after a confirm prompt

One button, both shapes, no need for the user to pick the right one upfront.

## Key Benefits

- **Reversible UX** — the toggle switch makes "hide this pattern" a one-click reversible action. Users can experiment without fearing they'll lose work.
- **Trash is honest** — destructive delete is now visually distinct and explicitly warns the user there's a less-destructive option
- **Granular sharing** — share or back up a single pattern, no manual JSON surgery
- **Auto-detecting import** — the same Import button handles all-patterns and single-pattern bundles, less choice friction for the user

Applied consistently across the SA Checklist's AdminPanel, the canvas-side Manage Patterns tab (used by both the SA Checklist and embedded CP canvas), and the SA Data Contract — so the UX is identical wherever pattern types are managed.

The release is available now in the Context Plane monorepo at `apps/data-contract/`.
