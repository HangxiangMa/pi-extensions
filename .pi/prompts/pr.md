---
description: Review a pull request for correctness, risks, and test coverage
argument-hint: "<PR URL or number>"
---

Target: ${ARGUMENTS:-the pull request for the current branch}

Review the target pull request without changing code, posting comments, approving it, or merging it.

1. Identify the pull request and its base branch.
   If the target is missing or unclear, ask instead of guessing.
2. Read the repository instructions, pull request title and description, linked issues, commits, checks, and complete diff.
3. Read all submitted reviews, inline comments, and discussion threads.
   Verify each concern yourself because earlier feedback may be incomplete or outdated.
4. Inspect the relevant code, tests, documentation, history, callers, and downstream behavior.
5. Confirm the intended behavior and trace how the changes affect existing behavior.
6. Look for real problems in:
   - Correctness and edge cases.
   - Error handling, cleanup, retries, concurrency, and state changes.
   - Security, permissions, validation, secrets, and sensitive data.
   - System boundaries, dependencies, public contracts, and how far failures can spread.
   - Performance, resource use, compatibility, deployment, migrations, rollback, and monitoring.
   - Test coverage and documentation.
7. Run focused checks when practical.
   Treat passing checks as evidence, not proof that the code is correct.
8. Report only findings caused, exposed, or made worse by this pull request.
   Separate directly relevant pre-existing problems and omit style-only comments unless requested.
9. Distinguish confirmed problems from possible risks and unverified areas.

Use this output structure:

## Goal

Explain in simple terms what the pull request is trying to achieve.

## Findings

List confirmed findings from highest to lowest severity: **Critical**, **Major**, then **Minor**.
Use **Critical** for severe security, data loss, or widespread failure; **Major** for merge-blocking defects; and **Minor** for real, low-risk defects.
For each finding, include the file and line, the trigger, the impact, and a practical fix.
If there are no confirmed findings, say so clearly.

## Risks (optional)

List material risks and unverified areas separately.
Omit this section when there are none.

## What looks good (optional)

Briefly note strong design, implementation, tests, or documentation.
Omit this section when there is nothing meaningful to highlight.

## Tests

State what is covered, what is missing, which checks you ran, and any checks you could not run.

## Open questions (optional)

Include only questions that block a merge decision and require user input.
Omit this section when there are none.

## Verdict

Match the verdict to the findings:

- Use **Request changes** for any Critical or Major finding.
- Use **Approve with minor comments** when only Minor findings remain.
- Use **Needs more context** when missing evidence blocks the decision.
- Use **Approve** when no confirmed findings remain.

Explain the verdict in one or two sentences.
