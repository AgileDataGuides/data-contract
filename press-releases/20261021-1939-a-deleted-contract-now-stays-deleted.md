# A Deleted Contract Now Stays Deleted in the Data Contract App

**21 October 2026**

AgileDataGuides today released a fix to the Data Contract app, so deleting a contract that has unsaved changes removes it for good.

## The Problem

When a user changed a contract and then deleted it before the next save, the contract came back. The app deleted the file, then moved to the next contract in the list. Moving on saves any unsaved changes first, and the changes still belonged to the contract just deleted. So the app wrote it straight back to disk, and it reappeared in the switcher on the next reload.

## The Solution

Deleting a contract now drops its unsaved changes before the delete is sent, so moving to the next contract has nothing left to save. A save still waiting to run from the last edit is cancelled too. Unsaved changes to a different contract are not affected.

## Key Benefits

- **Delete means delete**: a deleted contract does not come back on reload
- **No clean-up loop**: no need to delete the same contract twice
- **Same in six apps**: Metric Trees, Access, Business Glossary, Data Dictionary, Data Contract and the Information Product Canvas got the same fix

The fix is available now in the Data Contract app in the Context Plane monorepo, and it reaches the public app at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) on its next publish.
