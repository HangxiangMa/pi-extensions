---
description: Investigate, plan, and resolve a GitHub issue
argument-hint: "<issue URL or number>"
---

Issue: $ARGUMENTS

Follow this workflow:

1. Identify the issue from its URL or number.
   Use the current repository for a bare issue number, and ask if the target is missing or ambiguous.
2. Read the complete issue, including its description, discussion, linked context, labels, and current status.
3. Inspect the repository instructions, relevant code, tests, documentation, and history.
4. Classify the request and investigate it:
   - For a bug, reproduce it safely when practical, compare expected and actual behavior, and identify the root cause.
   - For a feature, identify the users, use cases, constraints, compatibility needs, and measurable acceptance criteria.
5. Define the scope, expected outcome, implementation approach, risks, and verification plan.
6. Present a concise implementation plan and wait for explicit approval.

Do not modify files, branches, or issue metadata before approval.

After approval:

1. Implement the smallest complete solution that addresses the root cause or accepted requirements.
2. Preserve unrelated behavior and follow all repository conventions.
3. Add or update tests that would fail without the solution.
4. Run focused verification and the repository's required checks.
5. If a reproduced issue is genuinely a bug and the repository uses a `bug` label, add that label when permitted.
6. Recheck the acceptance criteria and inspect the final diff for unintended changes.
7. Summarize the solution, verification evidence, and any remaining risks or unverified paths.

Do not claim reproduction, completion, or passing checks without evidence.
