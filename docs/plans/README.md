# Plan lifecycle

`docs/plans/` contains active executable plans. Keep each plan current while work is in progress.

Move a plan to `docs/plans/archived/` only after every task and completion check has evidence.

Delete an incomplete plan only after its remaining work has one explicit current owner and the replacement records the relationship. Git and GitHub preserve the superseded design history; unchecked boxes from deleted plans must not be treated as active work.

The archive is a workflow handoff, not permanent product documentation. During later curation:

- move public behavior and compatibility guidance to the owning package README;
- move accepted architectural decisions and trade-offs to `docs/adr/`;
- move current internal mechanisms or empirical verification guidance to
  `docs/implementation-notes/` or the owning test documentation; and
- keep future direction in `docs/roadmaps/`.

After durable facts are represented by their maintained owner, completed checklists, migration
sequence, review follow-ups, old counts/versions, and superseded designs may be deleted from the
archive. Git and GitHub remain the historical record. Never retain or delete whole plans solely to
manage execution history without first assigning every remaining obligation to a current owner.
