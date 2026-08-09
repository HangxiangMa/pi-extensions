# Coding-Agent Subagents Architecture Deep Dive

Date: 2026-08-10.

## Scope and evidence labels

This report studies how a coding agent should decide whether to delegate, isolate concurrent work, transfer context, integrate changes, verify results, and stop unsafe or stale work.

The study began with the repository survey and engineering notes dated 2026-08-10 and then used AlphaXiv `discover_papers` to search beyond their cited set.

AlphaXiv `answer_pdf_queries` was used to inspect mechanisms, experiments, ablations, limitations, and contrary results in the selected papers.

`[Direct evidence]` marks a mechanism or result reported by a paper.

`[Cross-paper inference]` marks an architecture conclusion synthesized across papers rather than directly tested as one system.

`[Paper-author interpretation]` marks an explanatory interpretation made by a paper's authors rather than a directly measured result.

`[Coverage gap]` marks a requested concern for which the reviewed evidence remains weak or indirect.

Quantitative findings are reported in the paper's own benchmark setting and should not be treated as directly comparable across different models, tasks, or budgets.

## Executive findings

- `[Cross-paper inference]` Multi-agent execution is not a reliable default because strong single-agent or equal-sample baselines often match or beat automatically designed multi-agent systems at much lower cost.
- `[Cross-paper inference]` Delegation helps most when work is genuinely decomposable, context exceeds one agent's effective window, or independent verification can cheaply reject a weak first attempt.
- `[Cross-paper inference]` More workers can reduce success when they create integration conflicts, repeated reasoning, late communication, or excessive context transfer.
- `[Cross-paper inference]` Worktree isolation prevents accidental file interference but does not by itself prevent logically incompatible patches or stale assumptions.
- `[Cross-paper inference]` Shared workspaces can outperform worktrees when every read and write is versioned and stale writes are actively rejected, but unprotected shared workspaces perform poorly.
- `[Cross-paper inference]` Structured task contracts, explicit dependencies, precise ownership boundaries, and machine-checkable artifacts outperform unconstrained peer conversation as coordination primitives.
- `[Cross-paper inference]` Independent tests and evidence-bound completion gates improve selection and reduce false completion more reliably than self-reported confidence.
- `[Cross-paper inference]` The smallest defensible architecture is a single-agent-first cascade with at most two concurrent workers, immutable task packets, versioned state, manager-controlled integration, and a fresh-context verifier.
- `[Cross-paper inference]` The architecture should optimize verified task value per unit of cost and latency rather than agent count, message count, or nominal parallelism.

## Search and selection method

- The search covered dynamic routing, decomposition, context transfer, communication, scheduling, filesystem isolation, integration, verification, permissions, cancellation, retries, stale state, observability, and evaluation.
- Papers were retained when their PDFs exposed an executable mechanism, a controlled comparison, a quantitative result, or a clearly stated limitation relevant to coding-agent architecture.
- The reviewed set includes software-engineering benchmarks, general multi-agent benchmarks, long-context delegation studies, concurrency-control systems, permission systems, and orchestration evaluators.
- The evidence base extends beyond the seed documents with CAID, STORM, CooperBench, SHEPHERD, CoAgent, Claim Plane, Proof-or-Stop, SkillScope, Semantic Snapshot Isolation, Co-Coder, and the single-versus-multi hybrid study.
- Simulator results and synthetic mechanism probes are treated as lower-external-validity evidence than repository-level tests, and preliminary one-seed studies are labeled accordingly.

## Dynamic delegation policy

- `[Direct evidence]` [Single-agent or Multi-agent Systems? Why Not Both?](https://arxiv.org/abs/2505.18286) found that single-agent and multi-agent systems produced the same pass-or-fail outcome in about 80% of evaluated cases across 15 tasks, seven application types, and nine frameworks.
- `[Direct evidence]` The same study found much higher multi-agent token use, including 5.05 times prefill and 5.56 times decode tokens on MBPP, 34.66 times and 12.77 times on GSM8K, and 220.22 times and 11.05 times on AIME.
- `[Direct evidence]` Its difficulty router sent low-rated tasks to a single agent and high-rated tasks to a multi-agent system, producing two percentage points higher accuracy at half the multi-agent cost on a mixed GSM8K and AIME workload.
- `[Direct evidence]` Its cascade ran a single agent first and escalated only answers that failed a cheap exact checker, reaching 94.5% on HumanEval versus 90.2% for the single agent and 93.3% for the multi-agent system.
- `[Direct evidence]` The same cascade reached 84.4% on MBPP versus 79.6% and 80.8%, and 71.2% on DS1000 versus 62.9% and 62.3%.
- `[Direct evidence]` The cascade was reported to improve accuracy by as much as 12% while lowering cost by 20% relative to the multi-agent system, with larger savings in some settings.
- `[Direct evidence]` The cascade depends on a checker that is both cheap and accurate, so it does not transfer directly to open-ended tasks with ambiguous correctness.
- `[Direct evidence]` [The Illusion of Multi-Agent Advantage](https://arxiv.org/abs/2606.13003) found that six automatically designed multi-agent systems generally lost to five-sample chain-of-thought self-consistency and sometimes cost up to ten times more.
- `[Direct evidence]` On SWE-bench Lite with GPT-5, five-sample self-consistency achieved 57.09% for $286.40, while the evaluated multi-agent systems ranged from 27.23% to 55.97% and from $83.50 to $998.20.
- `[Direct evidence]` On the synthetic, non-coding Synthetic Multi-Hop Financial Reasoning task with GPT-5, DyLAN and MAS-Orchestra improved over self-consistency by 4.3 and 6.0 percentage points while costing about 2.5 and 1.9 times as much.
- `[Direct evidence]` A hand-designed Synthetic Multi-Hop Financial Reasoning pipeline with a meta-agent, parallel per-investor extractors and calculators, and deterministic aggregation achieved 96.51% at $554.82 versus 56.97% at $478.40 for self-consistency.
- `[Cross-paper inference]` Delegation admission should require at least one explicit benefit hypothesis such as context relief, separable parallel work, specialist tool access, or independent evidence generation.
- `[Cross-paper inference]` The default path should remain one agent unless estimated benefit exceeds coordination cost and the task contract exposes a credible verification route.

## Task decomposition and concurrency control

- `[Direct evidence]` [Effective Strategies for Asynchronous SWE Agents](https://arxiv.org/abs/2603.21489) uses a central manager to build a dependency graph, group strongly or circularly dependent work, and dispatch only ready nodes under a maximum-active-worker limit.
- `[Direct evidence]` The manager dynamically reassigns work after integrations and sends workers structured JSON contracts containing target paths, functions, dependencies, and expected work.
- `[Direct evidence]` The system improved by as much as 14.7 percentage points on Commit0 and 25.6 percentage points on PaperBench over its single-agent baseline.
- `[Direct evidence]` Its agent-count ablation was nonmonotonic because Commit0 improved from two to four workers and then declined at eight workers as integration overhead grew.
- `[Direct evidence]` Wall-clock time did not fall substantially because merges and verification remained sequential and test-gated even when implementation ran in parallel.
- `[Direct evidence]` [Co-Coder](https://arxiv.org/abs/2606.00953) builds a weighted repository dependency graph, isolates hub files, partitions the graph into communities, and schedules a group only when its dependencies finish.
- `[Direct evidence]` Co-Coder assigns one owner per group and routes failed tests back only to implicated groups for at most ten repair iterations.
- `[Direct evidence]` On DevEval, Co-Coder reached 68.1% at 442 seconds and $0.18, compared with 56.8% at 800 seconds and $0.25 for sequential execution.
- `[Direct evidence]` On CodeProjectEval, Co-Coder reached 34.1% at 1,315 seconds and $0.67, compared with 20.1% at 2,756 seconds and $1.03 for sequential execution.
- `[Direct evidence]` Across the 16 CodeProjectEval projects with nonzero pass rates, Co-Coder's absolute test-pass improvement over sequential execution correlated with dependency edge density at Pearson 0.65 and Spearman 0.60, with both p-values below 0.05.
- `[Direct evidence]` Nearly complete coupling collapsed Co-Coder's schedule toward sequential work.
- `[Direct evidence]` [SWARMRESEARCH](https://arxiv.org/abs/2607.02807) lets a shepherd choose a parent branch and an explorer or optimizer role while changing tree width and depth across waves of four to eight workers.
- `[Direct evidence]` Its controlled 60-worker-call study beat the best fixed strategy on four of five tasks, while adding a separate Claude orchestrator increased total output tokens by 7.7% relative to the output tokens of the 60 worker calls alone.
- `[Direct evidence]` The shepherd rarely merged branches and could collapse into repeatedly prescribing one approach, which limits the evidence for reliable synthesis at high width.
- `[Cross-paper inference]` A coding orchestrator should derive concurrency from a dependency graph and coupling estimate instead of using a fixed worker count.
- `[Cross-paper inference]` The initial concurrency ceiling should be two mutating workers because the strongest coding studies show benefits at small width and measurable degradation as width grows.

## Context isolation and transfer

- `[Direct evidence]` [Recursive Agent Harnesses](https://arxiv.org/abs/2606.13643) gives each worker a fresh context and isolated workspace, forbids sibling communication, and aggregates structured JSON result files.
- `[Direct evidence]` On 199 synthetic long-context Oolong tasks, Recursive Agent Harnesses scored 81.36 versus a published Codex baseline of 71.75, a published recursive-language-model baseline of 64.38, and full-context prompting at 59.22.
- `[Direct evidence]` The Codex result was imported from Cao et al. rather than rerun, although the paper matched its GPT-5 backbone family.
- `[Direct evidence]` The reported 9.61-point gain interval from 4.2 to 14.8 points bootstraps only the 199 RAH per-instance scores against the fixed 71.75 baseline because the authors did not have Codex per-instance outcomes, so it is not a paired baseline interval.
- `[Direct evidence]` The study did not instrument exact token or wall-clock cost and did not ablate context isolation, recursion depth, grouping, or spawn policy, so its aggregate gain cannot be attributed causally to context isolation.
- `[Direct evidence]` [OrchBench](https://arxiv.org/abs/2607.25656) models orchestration as a dependency graph whose edges explicitly choose whether to retain or compress predecessor context.
- `[Direct evidence]` In OrchBench's deterministic simulator at a 16,000-token context limit, simulated average quality was 0.423 for the modeled single-agent baseline and 0.725 for multi-agent plans.
- `[Direct evidence]` In the same deterministic simulation at 128,000 tokens, simulated averages narrowed to 0.852 and 0.859, and the modeled single-agent baseline was better on the 10-task, 20-task, and 50-task graph sizes.
- `[Direct evidence]` The OrchBench appendix reports that simulated multi-agent quality was lower in 82% of model-problem pairs at 128,000 tokens.
- `[Direct evidence]` Adding one simulator-selected handoff to 20 MultiAgentBench tasks raised real-agent score from 3.754 to 4.150 out of five.
- `[Direct evidence]` [SHEPHERD](https://arxiv.org/abs/2605.10913) reports exactly zero characters of worker-context inflation from supervisor observation and intervention in a ten-step check.
- `[Direct evidence]` [Semantic Snapshot Isolation](https://arxiv.org/abs/2608.05412) makes prompt, model, index, tool, resource, and contract versions sticky across retries, resumes, children, and forks.
- `[Direct evidence]` Semantic Snapshot Isolation validates the union of branch manifests before merge and extends the manifest when an open-world resource is first accessed.
- `[Direct evidence]` At 128 resource identities and 16 branches, the prototype reported 4.6 microseconds p95 resolution and 88.2 microseconds merge validation.
- `[Direct evidence]` The paper reproduced semantic read skew, compatibility skew, context escape, and merge skew in a controlled LangGraph and Qdrant setting and blocked all four with its protocol.
- `[Coverage gap]` Semantic Snapshot Isolation protects semantic resource versions rather than repository writes or external effects, so it cannot replace filesystem concurrency control.
- `[Cross-paper inference]` Every child should start from an immutable task packet and a pinned semantic manifest instead of inheriting an unbounded parent transcript.
- `[Cross-paper inference]` Context transfer should contain only dependency outputs, relevant repository slices, constraints, and evidence references because full transcript sharing wastes context and can transfer obsolete assumptions.

## Worker communication

- `[Direct evidence]` [CooperBench](https://arxiv.org/abs/2601.13295) evaluates 652 paired-feature tasks across 12 libraries and four languages, with 77.3% of ground-truth feature pairs containing conflicting solutions.
- `[Direct evidence]` CooperBench isolates two agents in separate containers and branches, allows real-time SQL-backed messaging, merges their patches, and scores exact unit tests.
- `[Direct evidence]` Collaboration reduced average success by 30%, and GPT-5 and Claude Sonnet 4.5 agents solved about 25% cooperatively, roughly half their solo rate.
- `[Direct evidence]` Communication reduced textual conflicts without significantly improving task success because messages were often vague, late, incorrect, or based on commitments that were not followed.
- `[Direct evidence]` Success was associated with mutually confirmed role division, precise resource or line boundaries, and explicit negotiation.
- `[Direct evidence]` Scaling a 46-task subset from two to three to four agents reduced success from 68.6% to 46.5% to 30.0%.
- `[Direct evidence]` [STORM](https://arxiv.org/abs/2605.20563) avoids direct peer messaging and instead uses manager-owned decomposition plus structured intent annotations in code comments.
- `[Direct evidence]` [MASAI](https://arxiv.org/abs/2406.11638) coordinates five fixed roles through structured inputs and outputs rather than free-form conversations.
- `[Cross-paper inference]` Workers should communicate through typed artifacts and manager-mediated clarification requests by default, while peer chat should be an admitted exception with a stated coordination purpose.
- `[Cross-paper inference]` A handoff should identify producer, consumer, base state, changed assumptions, patch or artifact digest, verification evidence, and known limitations.

## Workspace isolation, stale state, and integration

- `[Direct evidence]` The asynchronous SWE-agent system gives every engineer a Git worktree and branch, integrates through one main branch, and asks a conflicting worker to pull the latest main state, resolve, and resubmit.
- `[Direct evidence]` With Claude Sonnet on PaperBench, worktrees scored 63.3 versus 57.2 for one agent and 55.5 for instruction-only soft isolation.
- `[Direct evidence]` On Commit0, worktrees scored 59.1 versus 53.1 for one agent and 56.1 for soft isolation.
- `[Direct evidence]` [STORM](https://arxiv.org/abs/2605.20563) instead uses a shared workspace in which every file has a monotonic version and every read records the complete observed version set.
- `[Direct evidence]` STORM accepts a write only when the target and all read dependencies remain unchanged, otherwise returning the current target, a unified diff, and the stale dependency versions.
- `[Direct evidence]` STORM adds a reservation of up to 30 seconds after rejection to prevent workers from repeatedly invalidating each other.
- `[Direct evidence]` On Commit0 with Claude Sonnet, STORM scored 82.5 macro and 46.2 weighted, compared with 66.4 and 20.7 for one agent and 63.8 and 24.6 for Git worktrees.
- `[Direct evidence]` On PaperBench with Claude Sonnet, STORM scored 74.1 versus 72.7 for Git worktrees and 68.7 for one agent.
- `[Direct evidence]` Git worktrees still won on a task whose decomposition aligned with file boundaries, scoring 98.2 on sample-specific-masks versus 72.8 for STORM.
- `[Direct evidence]` STORM's high-coupling Sonnet stratum scored 70.9 versus 36.3 for worktrees and 59.5 for one agent, although the coupling labels were proxy-derived.
- `[Direct evidence]` [CoAgent](https://arxiv.org/abs/2606.15376) assigns a transaction order at launch, requires tools to declare read and write footprints plus inverse actions, and gives reads order-filtered values.
- `[Direct evidence]` CoAgent notifies a higher-order reader when a late lower-order write invalidates its premise, after which the reader judges relevance and selectively repairs.
- `[Direct evidence]` CoAgent undoes and replays misordered invertible writes and delays non-invertible writes until earlier transactions commit.
- `[Direct evidence]` In 100 trials over ten contended task pairs, serial execution achieved 98% correctness, naive parallelism 13%, two-phase locking 96%, optimistic concurrency control 93%, and CoAgent 93%.
- `[Direct evidence]` Relative to serial execution, naive parallelism achieved 1.54 times speed at 1.06 times cost, while CoAgent achieved 1.43 times speed at 1.15 times cost.
- `[Direct evidence]` CoAgent's five failures came from agents misjudging notification relevance, which exposes an unsafe semantic decision inside an otherwise mechanical protocol.
- `[Direct evidence]` [Claim Plane](https://arxiv.org/abs/2607.21909) binds a versioned change intent to an exact base commit, declared operations, dependencies, preservation policy, tests, lease, and fencing token.
- `[Direct evidence]` Claim Plane fails closed on unknown overlap and permits same-file parallel work only for declared disjoint regions followed by final hunk verification.
- `[Direct evidence]` Its integration applies immutable patch digests in producer-first order and invalidates dependent consumers transitively when a premise changes.
- `[Direct evidence]` In a preliminary six-pair, one-seed CooperBench study, static Claim Plane passed all six pairs by serializing all six, dynamic Claim Plane passed three pairs before integration and four after integration while serializing three, and naive execution passed two before and three after integration.
- `[Direct evidence]` The Claim Plane authors state that the sample is too small for comparative performance claims and that its Python-first broker can be bypassed outside enforcement boundaries.
- `[Cross-paper inference]` Worktrees and versioned premises solve different problems, so mutating workers should receive worktree isolation while their outputs also carry read-set or base-state versions checked at integration.
- `[Cross-paper inference]` One integration controller should own the canonical branch and reject late patches whose base commit, semantic manifest, dependency output, or acceptance tests have changed.
- `[Cross-paper inference]` A rejected stale result should be quarantined as evidence for replanning rather than silently rebased or merged.

## Independent verification and completion gates

- `[Direct evidence]` MASAI independently generates a reproduction test, produces five candidate patches, and ranks candidates using the reproduction result.
- `[Direct evidence]` On SWE-bench Lite with GPT-4o, MASAI resolved 28.33%, localized 75%, cost $1.96 on average, and achieved the 95.33% patch-application rate reported in its main results table.
- `[Direct evidence]` MASAI's five-candidate oracle reached 35%, a random candidate reached 22.28%, and ranking with the independently generated reproduction test reached 28.33%.
- `[Direct evidence]` The asynchronous SWE-agent study found that manager review scored 60.2% at 3,689.1 seconds, worker self-verification scored 55.1% at 2,243.9 seconds, and an efficiency-focused prompt scored 54.0% at 1,908.6 seconds.
- `[Direct evidence]` [Proof-or-Stop](https://arxiv.org/abs/2607.14890) accepts completion evidence only when freshness, completeness, integrity, producer authorization, execution attestation, support, and outcome acceptance all hold.
- `[Direct evidence]` Proof-or-Stop binds receipts to material, head, story-file, policy, and command-set hashes plus the command, arguments, working directory, exit status, and output digest.
- `[Direct evidence]` Its done transition requires a full test or build receipt for the current tree, and its merge transition uses compare-and-swap checks for both source and target heads.
- `[Direct evidence]` Across ten engine scenarios and 18 tamper classes, Proof-or-Stop reported zero false completion states and zero false accepts.
- `[Direct evidence]` In a 9,240-cell ablation, a naive loop produced 31 visible-pass and hidden-fail amplifications per 1,800 cells, an advisory reviewer produced 14, and the gated protocol produced two.
- `[Direct evidence]` Bounded reflection retries stop or escalate when their budget expires instead of converting uncertainty into a successful completion state.
- `[Cross-paper inference]` Verification should run in a fresh context against the exact integrated tree and should consume claims plus evidence rather than the worker's persuasive narrative.
- `[Cross-paper inference]` Acceptance should require current-tree tests, patch integrity, scope compliance, and a verifier verdict, with no worker permitted to mark its own integrated result complete.

## Least privilege

- `[Direct evidence]` [ClawArena-Team](https://arxiv.org/abs/2606.31174) lets a manager choose each worker's system prompt, model modality, tool subset, path whitelist, foreground or background mode, and new or resumed session.
- `[Direct evidence]` Every evaluated model in ClawArena-Team had workspace-permission precision below 50%, with granted paths approximately twice the paths actually needed.
- `[Direct evidence]` Read-only compliance and modality-choice accuracy were each at least 92% for the eleven capable ClawArena-Team models, while tool-permission precision was roughly 70% to 80%.
- `[Direct evidence]` ClawArena-Team reports that managers retained stale beliefs across staged updates by advancing before rewriting an earlier deliverable or otherwise carrying obsolete state into later work.
- `[Direct evidence]` This reported failure concerns manager beliefs and deliverable revision rather than demonstrated failure to deliver staged files to active workers.
- `[Direct evidence]` [SkillScope](https://arxiv.org/abs/2605.05868) constructs a graph of instruction and code actions, removes candidate actions by replay, and patches control flow so an action is reachable only under a task-conditioned condition.
- `[Direct evidence]` On 200 manually annotated skills, SkillScope reported 94.53% F1 for identifying task-conditioned privilege needs.
- `[Direct evidence]` Across 68,312 valid real-world skills, SkillScope validated 7,039 as over-privileged and reduced triggered over-privileged action-task instances by 88.56% while preserving all evaluated legitimate tasks.
- `[Coverage gap]` SkillScope evaluates reusable skills rather than repository-editing subagents, so its results support task-conditioned capabilities but not a specific coding-agent sandbox policy.
- `[Cross-paper inference]` Every task packet should carry an expiring capability grant for exact repository paths, tools, command classes, network destinations, and external side effects.
- `[Cross-paper inference]` Capability expansion should require re-admission against the current task version, while unused grants should be measurable as permission-precision failures.

## Cancellation, retries, and lifecycle control

- `[Direct evidence]` SHEPHERD models tasks, effects, and scopes as typed objects and records execution in an immutable Git-like trace.
- `[Direct evidence]` Its supervisor can inject guidance, hand work to another agent, or discard a stuck worker without adding supervisor text to the worker context.
- `[Direct evidence]` A scope fork atomically copies agent and environment state, a discard restores the byte-identical parent, reversible effects roll back, compensable effects call handlers, and irreversible effects remain audited.
- `[Direct evidence]` Fork and revert for a 5.8-gigabyte image took 143 and 147 milliseconds, compared with 725 and 828 milliseconds for Docker commit and 53.5 and 25.9 seconds for a full copy.
- `[Direct evidence]` SHEPHERD reported about 95% cache hits beginning at two concurrent branches.
- `[Direct evidence]` On 479 CooperBench pairs with Claude Haiku 4.5 workers, cooperation scored 28.8%, solo execution 57.2%, a Sonnet supervisor 45.3%, and an Opus supervisor 54.7%.
- `[Direct evidence]` The Opus supervisor closed 91% of the gap between unsupervised cooperation and solo execution, while wall-clock time was 24.18 minutes versus 28.43 minutes for solo execution.
- `[Direct evidence]` SHEPHERD cannot roll back irreversible external effects and depends on the sandbox backend for several guarantees.
- `[Direct evidence]` The asynchronous SWE-agent system stops when all work is integrated or a maximum round or iteration limit is reached, and it removes worker worktrees on completion or exhaustion.
- `[Direct evidence]` Proof-or-Stop distinguishes bounded retry from successful completion and uses current-state receipts to prevent an older passing run from proving a changed tree.
- `[Coverage gap]` The reviewed coding-agent studies rarely measure cancellation propagation latency, leaked subprocesses, late-result rejection, or partial external-effect compensation under injected failures.
- `[Cross-paper inference]` Cancellation should form a tree rooted at the user request, and every child result should carry a generation token that makes output from a cancelled or replaced generation inadmissible.
- `[Cross-paper inference]` Retry policy should distinguish transient tool failure, stale premise, integration conflict, verifier failure, and budget exhaustion because each class requires a different recovery action.
- `[Cross-paper inference]` A retry should inherit immutable task intent and semantic versions but should not inherit hidden mutable workspace state or an unbounded failed transcript.

## Observability and replay

- `[Direct evidence]` SHEPHERD records task state, effects, scopes, evidence, and supervisory interventions in an immutable trace.
- `[Direct evidence]` Its local record overhead was 3.1 milliseconds per event, about 5%, while remote recording was 113 milliseconds per event, about 87% and mostly attributable to network cost.
- `[Direct evidence]` Claim Plane records exact base commits, intent versions, capability leases, fencing tokens, immutable patches, and integration order.
- `[Direct evidence]` Proof-or-Stop records evidence digests and execution receipts that can be rechecked against the current material state.
- `[Direct evidence]` ClawArena-Team measures permission selection, forbidden operations, workflow topology, communication behavior, and staged-update handling rather than final success alone.
- `[Cross-paper inference]` The orchestrator should emit an append-only event stream for admission, dispatch, context manifest, capability grant, tool effect, handoff, stale rejection, cancellation, integration, verification, retry, and terminal state.
- `[Cross-paper inference]` Every event should include task ID, parent ID, generation, base commit, semantic-manifest digest, capability digest, monotonic timestamp, and causal predecessor IDs.
- `[Cross-paper inference]` Replay should reconstruct why a worker was admitted, what it knew, what it could touch, which evidence supported integration, and why a result was accepted or rejected.

## Contrary findings and cases where one agent wins

- `[Direct evidence]` On 30 human-annotated MAST software tasks, Gemini 2.5 Pro single-agent outputs passed 24 tasks under the MAST rubric, while the multi-agent comparisons used stored ChatDev and MetaGPT traces supplied by the MAST repository.
- `[Direct evidence]` Within that comparison, the Gemini single-agent outputs won 15 tasks and lost one against ChatDev traces, while they won 13 and lost none against MetaGPT traces.
- `[Coverage gap]` This 30-task analysis did not match models or harnesses between conditions and does not report repeated runs, so it is not a controlled same-model estimate of single-agent advantage.
- `[Direct evidence]` Adding more debate agents often failed to improve accuracy, and summarization damaged weaker models more than concatenation.
- `[Paper-author interpretation]` The authors of The Illusion of Multi-Agent Advantage interpret their activation patterns and cost results as role redundancy, functional collapse, and architecture bloat that often degenerates into expensive self-consistency.
- `[Direct evidence]` STORM reported the single agent as the most cost-efficient method across all tested models because it paid no coordination overhead.
- `[Direct evidence]` CooperBench showed that isolated branches plus communication can still halve success relative to solo work when features interact semantically.
- `[Direct evidence]` The asynchronous SWE-agent study found that a single-first fallback followed by multi-agent retry largely wasted cost and time, which contrasts with cascades that possess a cheap exact checker.
- `[Direct evidence]` OrchBench's deterministic simulation found that the modeled multi-agent quality advantage nearly disappeared at a 128,000-token context limit and reversed for the 10-task, 20-task, and 50-task graph sizes.
- `[Direct evidence]` Co-Coder found that near-complete coupling removes available parallelism and collapses its schedule toward sequential execution.
- `[Cross-paper inference]` A single agent is favored when the task fits comfortably in context, edits are tightly coupled, correctness is hard to partition, coordination artifacts would exceed useful work, or no independent verifier exists.

## Cross-paper architecture synthesis

- `[Cross-paper inference]` The architecture should contain a router, an orchestrator, at most two initial workers, an integration controller, a capability broker, an evidence store, and a fresh-context verifier.
- `[Cross-paper inference]` The router should select among direct single-agent execution, single-agent execution with verification, and admitted parallel delegation.
- `[Cross-paper inference]` The orchestrator should construct a versioned dependency graph over cohesive change units and should serialize units with dense shared assumptions or overlapping ownership.
- `[Cross-paper inference]` Each mutating worker should receive an isolated worktree, while read-only investigators can share a read-only repository snapshot.
- `[Cross-paper inference]` Every worker should receive one immutable task packet containing objective, non-goals, base commit, dependency versions, allowed paths, allowed tools, acceptance checks, resource budget, and cancellation generation.
- `[Cross-paper inference]` Workers should return typed artifacts containing status, patch digest, files touched, assumptions, commands run, evidence digests, unresolved risks, and requested follow-up.
- `[Cross-paper inference]` The integration controller should be the only component allowed to update the canonical branch and should integrate in dependency order.
- `[Cross-paper inference]` Integration should fail closed when a patch exceeds scope, its base or semantic manifest is stale, a dependency changed, verification evidence is missing, or the exact patch cannot be reproduced.
- `[Cross-paper inference]` The verifier should inspect the integrated state independently and should be able to accept, request bounded rework, or reject without changing the implementation itself.
- `[Cross-paper inference]` The capability broker should issue short-lived, task-version-bound grants and should mediate every mutable repository or external effect that the platform can enforce.
- `[Cross-paper inference]` Cancellation should invalidate the generation before signalling workers so that late completions cannot race into integration.
- `[Cross-paper inference]` Observability should be part of correctness because stale-state rejection, permission precision, evidence freshness, and cancellation behavior cannot be evaluated from final patches alone.

## Minimal experimentally testable architecture

This section defines a falsifiable experimental system rather than an implementation sequence.

- The system has one router-orchestrator, no more than two concurrent mutating workers, one integration controller, and one fresh-context verifier.
- The router first predicts whether direct execution, verified direct execution, or two-worker execution will maximize expected verified success under a fixed cost and latency budget.
- The orchestrator emits a two-level dependency graph whose nodes have one owner and whose edges name the exact artifact or premise transferred.
- A worker receives a fresh context, a worktree rooted at an exact commit, a semantic manifest, a scoped capability grant, a deadline, and a cancellation generation.
- Workers cannot message each other directly in the minimal system and can only return a typed result or request manager-mediated clarification.
- The integration controller checks base commit, read-set or dependency versions, capability compliance, patch digest, declared file scope, and worker evidence before applying a patch.
- The verifier receives the objective, acceptance criteria, integrated tree, and evidence receipts without receiving the worker's hidden reasoning or persuasive summary.
- The verifier can produce only `accept`, `rework` with machine-readable findings, or `reject`, and rework is limited to one retry per node.
- The lifecycle state machine is `proposed`, `admitted`, `running`, `result_pending`, `integrating`, `verifying`, and one of `accepted`, `rework`, `cancelled`, `stale`, or `failed`.
- A cancellation increments the task generation, revokes grants, signals live workers, and makes every later result from the old generation ineligible for integration.
- The experiment forbids recursive grandchildren so that delegation policy, concurrency, and verification effects can be measured without tree-depth confounding.
- The proposed architecture is supported only if it improves verified success or Pareto efficiency over strong single-agent, equal-budget sampling, naive parallel, and fixed-worktree baselines.

## Evaluation methodology

- `[Direct evidence]` OrchBench reports simulator-to-real quality correlations of Pearson 0.816 with p equal to 0.047 and Spearman 0.771, while simulated time and token estimates did not correlate reliably with real execution.
- `[Direct evidence]` OrchBench simulation used about 1.3% of real-agent tokens and 10.3% of real-agent wall time in aggregate, but its task decomposition was supplied rather than discovered.
- `[Direct evidence]` [OrchestraBench](https://arxiv.org/abs/2608.05263) uses 26 aligned and adversarial routing cases and found 23% accuracy for fixed routing, 62% for a flag heuristic, 92% for TF-IDF description matching, and 100% for an LLM router.
- `[Direct evidence]` OrchestraBench's flag heuristic scored 100% on aligned cases and 0% on adversarial cases, demonstrating that ordinary success cases can hide routing brittleness.
- `[Direct evidence]` In 30 real Claude Sonnet trials per arithmetic failure mode, tool failure recovered at 100%, ambiguous failure at 30%, and context pollution, conflicting state, and premature success at 0%.
- `[Direct evidence]` OrchestraBench is a staged single-agent mechanism probe rather than a literal concurrent multi-agent system, so its results motivate failure injection without proving production recovery rates.
- `[Cross-paper inference]` Evaluation should compare a strong single agent, equal-budget best-of-N or self-consistency, naive parallel workers, fixed worktree workers, and the proposed architecture.
- `[Cross-paper inference]` All methods should use the same base model, tool set, starting repository state, aggregate token or dollar cap, wall-clock cap, and retry allowance.
- `[Cross-paper inference]` The task suite should stratify independent edits, moderate coupling, dense coupling, context overflow, staged upstream changes, and injected worker or tool failures.
- `[Cross-paper inference]` Each condition should use repeated seeds and paired task comparisons with confidence intervals rather than one best run.
- `[Cross-paper inference]` Primary outcomes should be hidden-test success, accepted-task rate, cost, wall-clock time, and verified success per dollar.
- `[Cross-paper inference]` Coordination outcomes should include unnecessary delegation, handoff coverage, conflict rate, stale-result rejection, integration rework, duplicate work, and worker-count utilization.
- `[Cross-paper inference]` Safety outcomes should include permission precision and recall, out-of-scope write attempts, forbidden effects, evidence freshness, false completion, cancellation latency, leaked processes, and accepted late results.
- `[Cross-paper inference]` Reliability outcomes should separately inject transient tool failure, worker crash, timeout, stale dependency, merge conflict, verifier disagreement, and orchestrator cancellation.
- `[Cross-paper inference]` Required ablations should remove the router, dependency graph, typed handoff, worktree isolation, version checks, independent verifier, scoped capabilities, and generation-based cancellation one at a time.
- `[Cross-paper inference]` The architecture should be rejected for a task stratum when its confidence interval does not beat the strongest simpler baseline or when its gain requires materially worse safety.

## Traceability matrix

| ID | Design decision | Primary paper evidence | Evidence status |
| --- | --- | --- | --- |
| D1 | Default to one agent and admit delegation conditionally. | The hybrid study found about 80% outcome agreement, large multi-agent token inflation, and routing or cascade gains only under identifiable difficulty or cheap checking, while the Illusion study found broad losses to equal-sample self-consistency. | Direct evidence supports the premise, while the exact admission rule is a cross-paper inference. |
| D2 | Cap the first experiment at two concurrent mutating workers. | CAID degraded at eight workers, CooperBench fell from 68.6% with two agents to 30.0% with four, and Co-Coder collapsed toward sequential work under dense coupling. | The cap is a conservative cross-paper inference. |
| D3 | Schedule only dependency-ready cohesive work units. | CAID dispatches ready dependency-graph nodes, and Co-Coder uses repository dependency communities with one owner per group. | Direct mechanism evidence supports this decision. |
| D4 | Give workers fresh bounded context plus explicit dependency artifacts. | Recursive Agent Harnesses combines fresh worker contexts with several other harness changes without a component ablation, OrchBench's deterministic simulator models selected context transfers, and Semantic Snapshot Isolation pins resource versions across branches. | The component mechanisms are direct evidence, while their effectiveness as one decision is inferred. |
| D5 | Prefer typed manager-mediated handoffs over free-form peer chat. | CooperBench found that communication reduced textual conflicts without significant success gains, while MASAI and STORM coordinate through structured artifacts. | Direct evidence supports the risk and alternatives. |
| D6 | Use worktrees for mutating workers and version checks for their premises. | CAID found worktrees better than soft isolation, while STORM found versioned shared state better than worktrees on coupled tasks and CoAgent exposed stale-read hazards. | The combined defense is a cross-paper inference from contrary isolation results. |
| D7 | Make one integration controller own the canonical branch. | CAID and STORM centralize merge or commit responsibility, while Claim Plane applies exact verified patches in dependency order. | Direct mechanism evidence supports this decision. |
| D8 | Reject stale outputs instead of silently merging them. | STORM validates complete read versions, Claim Plane propagates dependency invalidation, CoAgent repairs ordering violations, and Proof-or-Stop binds evidence to current hashes. | Direct evidence strongly supports this decision. |
| D9 | Verify the exact integrated state in a fresh context. | MASAI improves candidate selection with independent reproduction tests, CAID manager review beats self-verification, and Proof-or-Stop reduces false completion with current-state evidence gates. | Direct evidence supports independent evidence, while fresh-context isolation is inferred. |
| D10 | Bind least-privilege grants to task and version. | ClawArena-Team exposes low path-permission precision, SkillScope reduces triggered over-privileged actions by 88.56%, and Claim Plane binds capabilities to intent versions and leases. | Direct evidence supports the controls, while the coding-agent grant schema is inferred. |
| D11 | Use generation-based cancellation and quarantine late results. | SHEPHERD demonstrates typed discard and rollback, Proof-or-Stop rejects stale receipts, and ClawArena-Team shows that managers can retain stale beliefs or leave earlier deliverables unrevised after staged updates. | Cancellation propagation remains a coverage gap, so this decision is primarily inferred. |
| D12 | Classify retries by failure cause and bound them. | Proof-or-Stop uses bounded reflection and fail-closed stopping, while CoAgent distinguishes repairable order violations from delayed non-invertible effects. | Direct evidence supports bounded and typed recovery, while the proposed taxonomy is inferred. |
| D13 | Record causal, capability, state, and evidence events. | SHEPHERD supplies immutable execution traces, Claim Plane records provenance and fencing, and Proof-or-Stop records command and digest receipts. | Direct mechanism evidence supports this decision. |
| D14 | Evaluate against strong single-agent and equal-budget baselines under failure injection. | The Illusion study shows weak baselines can create false multi-agent gains, OrchBench shows simulator limits, and OrchestraBench shows aligned cases can conceal adversarial routing and recovery failures. | Direct evidence strongly supports this methodology. |

## Unresolved research questions

- `[Coverage gap]` No reviewed study jointly evaluates dynamic routing, worktree isolation, semantic-version pinning, least privilege, cancellation, and independent verification in one coding-agent system.
- `[Coverage gap]` The best online predictor of task coupling remains unknown because file overlap, dependency density, edit locality, and semantic contract overlap have not been compared prospectively.
- `[Coverage gap]` It is unknown whether an orchestrator can predict the value of delegation accurately enough to beat a cheap single-agent-first cascade on open-ended repository tasks.
- `[Coverage gap]` The optimal boundary between shared versioned state and isolated worktrees remains unresolved because CAID and STORM compare different shared-state protections.
- `[Coverage gap]` No strong evidence establishes when direct peer communication adds value beyond typed artifacts and manager-mediated clarification.
- `[Coverage gap]` The reviewed papers do not quantify how much context a child needs to preserve architectural invariants without inheriting distracting parent history.
- `[Coverage gap]` Semantic Snapshot Isolation has not been tested together with mutable repository state, changing tests, or evolving tool implementations during a coding task.
- `[Coverage gap]` Cancellation studies do not yet report propagation latency, subprocess leakage, irreversible effect exposure, or acceptance of late results under adversarial timing.
- `[Coverage gap]` Retry studies rarely distinguish transient infrastructure failures from deterministic reasoning failures, stale premises, and integration conflicts.
- `[Coverage gap]` Least-privilege studies do not yet measure whether narrower grants reduce coding success or merely increase capability-expansion requests.
- `[Coverage gap]` Independent verification can share model blind spots with implementation workers, and the value of model diversity versus fresh context alone remains uncertain.
- `[Coverage gap]` Repository benchmarks rarely include concurrent upstream edits, branch replacement, user cancellation, or tool-version drift despite their importance in interactive coding agents.
- `[Coverage gap]` Multi-agent evaluations need standardized reporting for total tokens, peak concurrency, wall-clock critical path, failed worker cost, integration cost, and verifier cost.
- `[Coverage gap]` The relationship between simulator-selected orchestration and real end-to-end reliability remains uncertain because quality correlations are promising but timing and token fidelity are weak.

## Conclusion

- `[Cross-paper inference]` The literature does not support unconditional subagent use, fixed wide teams, free-form peer chat, or worktrees as a complete concurrency solution.
- `[Cross-paper inference]` The combined evidence supports conditional routing, dependency-aware decomposition, small bounded concurrency, structured artifacts, explicit state validation, centralized integration, and evidence-bound verification.
- `[Cross-paper inference]` A coding agent should treat each subagent as a speculative, scoped, cancellable producer whose output is only a claim until the current integrated state independently verifies it.
- `[Cross-paper inference]` The proposed minimal architecture is intentionally small so its routing, isolation, stale-state, privilege, cancellation, and verification mechanisms can be falsified independently before recursive or high-width delegation is considered.
