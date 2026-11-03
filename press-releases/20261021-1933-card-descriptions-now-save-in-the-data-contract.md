# Card Descriptions Now Save in the Standalone Data Contract

**21 October 2026**

AgileDataGuides today released a fix to the standalone Data Contract app, so a description typed on a card or a column stays after the page reloads.

## The Problem

In the standalone Data Contract, a data product owner could open a card, such as a persona, a delivery type or a trust rule, and type a description. The app showed the new text, then lost it. The page passed only name changes and reorders to the contract, so the description never reached the saved file. A column description typed on the Table tab went the same way. The contract's own description was not affected.

## The Solution

Description edits on every card now reach the contract and save, the same way a rename does. The app saves 300 ms after the last edit, so a reload shows the new text.

## Key Benefits

- **Descriptions stay**: what you type on a card is what the saved contract holds
- **Columns too**: column descriptions from the Table tab save as well
- **Nothing new to learn**: edit a card the same way as before

The fix is available now in the Data Contract app in the Context Plane monorepo, and it reaches the public app at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) on its next publish.
