# Contract Documents Now Name the Columns Each Trust Rule Checks

**21 October 2026**

AgileDataGuides today released a fix to the Data Contract's documents, so the Agreement tab and the RTF, Word and PDF exports show which columns each Trust Rule checks.

## The Problem

Since Trust Rules became a catalogue that attaches to columns, a rule can check one column, several, or the whole table. The contract documents never caught up. They still read the old single "column" field, which new rules do not have. So every rule in the Agreement tab and in the RTF, Word and PDF files said its target field was "ALL (table-level)", even when it was attached to the email column only. A data consumer reading the document could not tell which column a rule protected.

## The Solution

Each rule's "Target field" now lists the columns it is attached to, such as "id, email". A rule attached to no column still says "ALL (table-level)". An older contract whose rules still carry the single column field shows that column, as before. The standalone app does not benefit yet. Its Table tab, the only place there to attach a rule to a column, stores the attachment under the wrong column key, so those rules still print "ALL (table-level)" until that fault, tracked as its own fix, lands. The shipped invoices example stores its attachments the same way. Its documents show each rule's older single column instead, so a rule attached to two columns names only one. The Context Plane path is not affected.

## Key Benefits

- **Documents match the graph**: in the Context Plane, the target field shows the same columns as the Trust Rule attachments
- **One rule, many columns**: a rule attached to several columns lists them all
- **Older contracts still read right**: rules from before the catalogue keep their column

The fix is available now in the Data Contract app in the Context Plane monorepo, and it reaches the public app at [github.com/AgileDataGuides/data-contract](https://github.com/AgileDataGuides/data-contract) on its next publish.
