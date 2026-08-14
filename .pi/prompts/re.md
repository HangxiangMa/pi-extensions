---
description: Resolve all review feedback on a pull request
argument-hint: "<pr-url-or-number>"
---

Target: ${ARGUMENTS:-the pull request for the current branch}

Resolve the pull request feedback end to end.

1. Identify the target pull request without guessing.
2. Read the repository instructions, pull request description, commits, full diff, checks, submitted reviews, inline comments, and conversation threads.
3. Inspect the working tree before editing, and preserve unrelated or pre-existing changes.
4. Create a review ledger that maps every feedback item to one of these outcomes:
   - Actionable and not yet addressed.
   - Already addressed by the current code.
   - Outdated or superseded.
   - A question or discussion item that needs a response.
   - Incorrect, conflicting, or blocked, with evidence explaining why.
5. Implement every actionable item that remains valid.
   Fix the underlying issue rather than only the commented line, and check the full diff for the same failure pattern.
6. Add or update tests when behavior changes or a regression needs coverage.
7. Run focused tests and all required repository checks.
8. Re-read the feedback, inspect the final diff, and confirm that every ledger item has an evidence-backed outcome.
9. Reply to or resolve threads only after the concern is addressed and verified.
   Explain non-actionable outcomes clearly and respectfully.
10. Stage only the intended files, create a signed commit using the repository's commit conventions, and push it to the pull request branch.
11. Refresh the pull request once after pushing, then report the commit, checks, resolved feedback, and any remaining blockers.

Do not rewrite history, discard user changes, conceal failing checks, or claim that feedback is resolved without evidence.
If no code changes are needed, do not create an empty commit; report the evidence and update the relevant review threads instead.
