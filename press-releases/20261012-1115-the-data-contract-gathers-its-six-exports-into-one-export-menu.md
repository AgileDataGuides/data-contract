# The Data Contract Gathers Its Six Exports Into One Export Menu

**12 October 2026**

AgileDataGuides today released an Export menu in the Data Contract app, so the toolbar gives its space back to the contract's name and description, and every export format says what its file is for.

## The Problem

The Data Contract had six export buttons in one row: Export JSON, Export ODCS, Export OMS, Export RTF, Export Word and Export PDF. They took most of the toolbar, and the contract's name and description were squeezed into the space left over. Five of the six labels were acronyms. A data product owner had to know that ODCS is the Open Data Contract Standard and OMS is OpenMetadata, or guess, because those two buttons said nothing more.

## The Solution

The six buttons are now one **Export** button. It opens a menu with the formats in three groups: Model (JSON), Document (RTF, Word and PDF) and Standards (ODCS and OMS). Under each format is one line on what the file is for, such as "Open Data Contract Standard YAML (.odcs.yaml)" for ODCS and "Opens the print dialog. Choose Save as PDF" for PDF. Choose a format and the app makes the same file as before. PDF still opens the print dialog.

## How It Works

Click Export to open the menu. Click anywhere else, or press Escape, to close it. From the keyboard, Arrow Down on the Export button opens the menu, and the arrow keys move through the formats. The Data Contract view in the Context Plane uses the same menu, so the app looks the same in both places. The Concept Model app uses the same menu too.

## Key Benefits

- **Room for the contract**: the name and description get the toolbar back
- **No acronym guessing**: ODCS and OMS each say which standard they are
- **Formats in groups**: the contract, the documents and the standards each have their own heading
- **One look everywhere**: the standalone app and the Context Plane show the same menu

The Export menu is available now in the Data Contract app in the Context Plane monorepo, and it reaches the public app at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) on its next publish.
