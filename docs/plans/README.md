# Plan lifecycle

`docs/plans/` contains active executable plans. Keep each plan current while work is in progress and
archive it under `docs/plans/archived/` only after every task and completion check has evidence.

The archive is a workflow handoff, not permanent product documentation. During later curation:

- move public behavior and compatibility guidance to the owning package README;
- move accepted architectural decisions and trade-offs to `docs/adr/`;
- move current internal mechanisms or empirical verification guidance to
  `docs/implementation-notes/` or the owning test documentation; and
- keep future direction in `docs/roadmaps/`.

After durable facts are represented by their maintained owner, completed checklists, migration
sequence, review follow-ups, old counts/versions, and superseded designs may be deleted from the
archive. Git and GitHub remain the historical record. Never move whole plans into another directory
solely to retain execution history.
