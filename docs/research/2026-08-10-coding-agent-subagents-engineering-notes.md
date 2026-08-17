# Coding-Agent Subagents: Engineering Evidence and Recommendations

> **Historical research input:** Role names and automation described here summarize research-era options and do not define current `pi-subagents` built-ins or routing; see the [current direction](../implementation-notes/pi-subagents-current-direction.md).

## Methodology and scope

This synthesis uses the AlphaXiv MCP paper-discovery and PDF-query tools as its required and primary evidence source.
The search focused on coding-agent subagents and adjacent multi-agent orchestration research covering delegation, context isolation, communication, parallelism, verification, benchmarks, costs, and failures.
Claims in the direct-evidence section come from the papers' reported methods, measurements, or stated limitations.
The recommendations section is explicitly inferential and combines patterns across papers rather than presenting them as directly tested conclusions.
Several cited 2026 papers are recent preprints, so their findings should be replicated before being treated as settled engineering results.

## Summary

Subagents help most when work has genuinely distinct roles, separable context, or a dependency structure that supports useful parallel execution.
Adding agents without structural guidance often increases communication cost, loses task-critical information, creates interface conflicts, and weakens verification.
The most defensible system pattern is a dependency-aware orchestrator with isolated worker contexts, structured artifact handoffs, bounded authority, and independent executable verification.

## Direct evidence

### AgentCoder

[AgentCoder: Multi-Agent Code Generation with Effective Testing and Self-optimisation](https://arxiv.org/abs/2312.13010) is arXiv:2312.13010, with the examined v3 dated 2024-05-24.
AgentCoder uses three roles consisting of a programmer, an independent test designer, and a test executor.
The test designer creates tests without seeing the generated implementation, which is intended to reduce correlated blind spots between code and tests.
The test executor runs the generated tests and returns concrete failures to the programmer until the code passes or the iteration budget ends.
With GPT-4, AgentCoder reported 96.3% pass@1 on HumanEval and 91.8% on MBPP, compared with reported prior-best values of 90.2% and 78.9%.
It reported aggregate token overheads of 56.9K on HumanEval and 66.3K on MBPP, compared with 138.2K and 206.5K for MetaGPT and still higher totals for ChatDev and AgentVerse.
Its test designer reported 89.6% and 91.4% test accuracy and 91.7% and 92.3% line coverage on HumanEval and MBPP.
The main limitation is that HumanEval and MBPP are function-level benchmarks, so the results do not directly establish repository-scale effectiveness or parallel speedups.

### MASAI

[MASAI: Modular Architecture for Software-engineering AI Agents](https://arxiv.org/abs/2406.11638) is arXiv:2406.11638, dated 2024-06-17.
MASAI defines each subagent with an explicit input, problem-solving strategy, and output specification.
Its five specialized subagents generate a test template, reproduce the issue, localize edits, generate candidate fixes, and rank those fixes.
Subagents communicate by passing specified artifacts to later stages instead of holding free-form one-to-one or group conversations.
MASAI reported a 28.33% resolution rate on the 300-task SWE-bench Lite benchmark, a 75% file-localization rate, and an average cost of $1.96 per issue.
Sampling five candidate patches raised oracle resolution from 23.33% with one sample to 35% with five samples.
Random selection achieved 22.28%, LLM ranking without test evidence achieved 23.33%, and ranking with an independently generated reproduction test achieved 28.33%.
These results support executable evidence over model self-evaluation when selecting among candidate patches.
The evaluation used GPT-4o on an early SWE-bench Lite setup, and the architecture is primarily a staged pipeline rather than an experiment in wall-clock parallelism.

### MAST failure taxonomy

[Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) is arXiv:2503.13657, with the examined v3 dated 2025-10-26.
The MAST study analyzes 1,642 traces from seven multi-agent systems across coding, mathematics, and general-agent tasks.
Observed system failure rates ranged from 41% to 86.7% across the evaluated systems.
The taxonomy contains 14 failure modes grouped into system-design problems at 44.2%, inter-agent misalignment at 32.3%, and task-verification problems at 23.5%.
Reported modes include disobeying task or role specifications, repeated steps, lost conversation history, conversation resets, information withholding, ignored agent input, premature termination, and missing or incorrect verification.
The taxonomy was developed with human inter-annotator agreement of kappa 0.88.
A workflow correction that restored the intended decision authority in ChatDev contributed to a reported 9.4% increase in task success.
The authors caution that isolated prompt or workflow fixes are often insufficient because many failures arise from structural system design.
The taxonomy is not claimed to be exhaustive, and much of the full dataset was labeled by an LLM annotator calibrated against a smaller human-labeled set.

### Cohesion-aware parallel coding

[When Parallelism Pays Off: Cohesion-Aware Task Partitioning for Multi-Agent Coding](https://arxiv.org/abs/2606.00953) is arXiv:2606.00953, dated 2026-05-31.
Co-Coder models a repository as a weighted dependency graph whose nodes represent work and whose cross-partition edges approximate communication cost.
It isolates structural hub files, groups strongly coupled files, exposes safe latent parallelism, and schedules ready work without global synchronization barriers.
A leader runs the test suite after generation and sends repair work only to the partition that owns the implicated files.
Across 28 Python repository-generation tasks, Co-Coder improved DevEval average pass rate from 56.8% to 68.1%, reduced mean latency from 800 to 442 seconds, and reduced mean API cost from $0.25 to $0.18.
On CodeProjectEval, it improved average pass rate from 20.1% to 34.1%, reduced mean latency from 2,756 to 1,315 seconds, and reduced mean cost from $1.03 to $0.67.
These values correspond to as much as a 2.10-times wall-clock speedup and a 35% cost reduction relative to sequential execution.
Naive file-based parallelism increased cost by 44% on DevEval and 60% on CodeProjectEval while producing only small average quality gains.
The evaluated Claude Code Agent Teams configuration was faster and cheaper but had lower average pass rates than the sequential baseline on both benchmarks.
Co-Coder becomes effectively sequential when nearly every file is tightly coupled, and the reported evaluation covers only Python repositories.

### Software delegation contracts

[Software Delegation Contracts: Measuring Reviewability in AI Coding-Agent Work](https://arxiv.org/abs/2606.17099) is arXiv:2606.17099, dated 2026-06-14.
The paper defines a delegation contract as the task, granted authority, returned work package, and acceptance context around a coding-agent run.
Its explicit contracts specify objectives, non-goals, allowed paths and commands, forbidden actions, expected tests, required evidence, and acceptance criteria.
Across 64 runs on ten small TypeScript tasks, every condition passed hidden acceptance checks and produced no scope violation, so contracts did not improve objective correctness in this saturated setting.
Contracts increased evidence sufficiency by 0.83 on a five-point scale, improved 22 of 30 paired comparisons without worsening any, and reduced reviewer ambiguity.
Changed-file lists with reasons increased from 7% to 93%, commands-run reporting increased from 7% to 70%, and known-limitations sections increased from 0% to 80%.
Contracts increased agent tokens by 13%, wall-clock time by 38.3%, and tool invocations by 23.3%.
The effect on reviewability was roughly twice as large for the weaker model tier.
The study is a small pilot on a roughly 600-line toy repository, objective outcomes reached a ceiling, and the blinded reviewers were models rather than humans.

### OrchBench

[OrchBench: Evaluating Multi-Agent Orchestration Plans in Isolation via Deterministic Simulation](https://arxiv.org/abs/2607.25656) is arXiv:2607.25656, dated 2026-07-28.
OrchBench evaluates task assignments, dependency scheduling, information transfers, compression, makespan, and tokens without executing worker agents.
Its simulated orchestration scores correlated with Claude Code execution quality at Pearson r equals 0.816 while requiring 1.3% of the tokens and 10.3% of the wall-clock time.
Transfer coverage correlated with quality between 0.614 and 0.952 across tested workflow sizes.
At 100 tasks, agent count was almost uncorrelated with quality at negative 0.021, while missing-transfer counts ranged from 0.07 to 22.70 across planners.
Increasing the maximum agent cap from 16 to 64 more than doubled the selected agent count while leaving scores nearly unchanged.
Multi-agent execution improved quality over single-agent execution by 0.302 under a 16K context limit, but the advantage fell to 0.007 under a 128K limit.
At 1,000 tasks, two tested planners accumulated more than 870 missing transfers while another preserved complete transfer coverage, showing that coordination quality can diverge sharply at scale.
Adding one simulator-selected handoff increased mean real-execution evaluation scores from 3.754 to 4.150 out of five on 20 tasks.
The simulator is useful for plan screening, but its simulated time and token measures did not correlate reliably with real framework costs, and it assumes a fixed task decomposition rather than evaluating decomposition itself.

### OrchestraBench

[OrchestraBench: Evaluating Multi-Agent Orchestration Failure Modes, Recovery, and Decomposition Quality](https://arxiv.org/abs/2608.05263) is arXiv:2608.05263, dated 2026-08-05.
OrchestraBench uses controlled failure injection to measure routing accuracy, recovery by failure mode, cascade radius, time to detection, and delegation fidelity.
In a 26-case routing diagnostic, a keyword and flag heuristic scored 0% on adversarial cases while a TF-IDF router that read the task description and an LLM router each scored 100%.
This result favors intent-aware routing but does not establish that expensive LLM routing is necessary.
In controlled dependency chains, tool faults recovered at 1.0, ambiguous delegation recovered at 0.30, and three latent or semantic failure classes recovered at 0.0.
Blind retries reproduced latent failures instead of repairing them and only increased time to detection.
Mean cascade radius grew from 0.9 to 4.7 as pipeline depth increased from three to seven stages.
The routing diagnostic is small and author-labeled, and the recovery experiments are controlled arithmetic-chain probes rather than broad coding workloads.

## Cross-paper engineering lessons from direct evidence

Delegation performs best when roles correspond to different strategies or evidence sources rather than cosmetic personas.
Independent test generation and execution provide more useful selection signals than model-only review of candidate patches.
Context isolation can reduce correlated errors and long-trajectory noise, but every isolated context creates an information-transfer obligation.
Structured artifact handoffs make missing information visible and reduce the ambiguity of free-form conversational coordination.
Raw agent count is a weak optimization target because useful concurrency depends on dependency structure, context pressure, and communication cost.
Parallel work is most effective when strongly coupled code remains under one owner and only dependency-ready tasks execute concurrently.
Blind retry is appropriate for transient tool faults but is ineffective against latent semantic errors, bad delegation, or corrupted shared state.
Delegation contracts improve the review surface, especially for weaker or cheaper workers, but impose measurable token and latency overhead.
Simulation can cheaply screen orchestration plans, but final validation must still execute the target coding system in its real environment.

## Inferred practical recommendations

The recommendations below are engineering inferences drawn across the direct evidence rather than conclusions tested by one paper end to end.

### Delegate selectively

Use a subagent when it supplies a distinct problem-solving strategy, independent verification, necessary context isolation, or meaningful critical-path parallelism.
Keep work in one agent when the relevant state fits comfortably in one context and the task has dense shared dependencies.
Require the orchestrator to record why delegation is expected to improve quality, latency, context pressure, or verification before launching another worker.

### Partition by cohesion and dependencies

Build or infer a dependency graph before assigning repository work.
Keep files with dense shared interfaces, types, or call relationships under one owner.
Assign independent leaves or weakly coupled modules to separate workers only when the expected latency reduction exceeds handoff and integration cost.
Release work when its actual upstream artifacts are ready instead of launching all planned workers simultaneously.
Use a bounded dynamic concurrency limit derived from ready work rather than treating the configured maximum as a target.

### Make delegation contractual

Every request should specify a task identifier, objective, non-goals, writable scope, allowed tools, dependencies, required inputs, acceptance checks, and deadline or budget.
Grant each worker only the paths, tools, credentials, and destructive authority necessary for its task.
Every result should report status, changed paths, artifact or patch reference, claims, tests run, raw evidence, limitations, unresolved dependencies, and token and time usage.
Require explicit acknowledgement or rejection when a worker lacks required context, authority, tools, or verification capability.

### Isolate context while preserving provenance

Give workers minimal task-specific contexts instead of cloning the entire parent conversation by default.
Pass immutable source references and structured upstream artifacts rather than compressed conversational summaries whenever practical.
Mark each transferred claim as observed, inferred, or unverified and attach the producing task and artifact version.
Reject or revalidate results produced from stale repository generations, invalidated dependencies, or superseded plans.

### Separate generation, integration, and verification

Do not let the implementation worker provide the only acceptance evidence for its own change.
Use an independently contextualized verifier for tests, compilation, static analysis, security checks, or behavioral evaluation.
For uncertain fixes, generate diverse candidates independently and rank them with executable evidence rather than self-reported confidence.
Give one integration owner authority to resolve cross-partition interfaces and require it to rerun repository-level checks on the assembled state.

### Make recovery failure-specific

Retry transient transport, rate-limit, or tool failures within a bounded policy.
For missing context, issue a structured request for the exact absent dependency instead of replaying the same prompt.
For semantic or verification failures, restore trusted state, revise the plan, change the worker or verifier, and rerun acceptance checks.
For repeated task derailment or ignored input, terminate the worker and preserve its trace for diagnosis rather than allowing an unbounded loop.

### Observe orchestration as a first-class system

Record every delegation decision, worker assignment, dependency, context transfer, tool action, artifact version, verification result, retry, cancellation, and termination reason.
Classify incidents using a stable taxonomy covering specification failure, role failure, history loss, information withholding, ignored input, premature termination, and incomplete verification.
Track missing transfers and cascade radius so a plausible final answer cannot hide upstream coordination failures.

### Benchmark against credible alternatives

Compare the subagent system with a strong single agent, equal-budget best-of-N sampling, naive parallelism, and an ablated orchestrator.
Report resolved-task rate, wall-clock latency, total tokens, monetary cost, peak concurrency, context transferred, conflicting edits, verification failures, and reviewability.
Evaluate both loosely coupled and densely coupled repository tasks because average results can hide where parallelism collapses.
Use deterministic orchestration simulation for cheap stress tests and parameter sweeps, then confirm selected designs with repeated end-to-end runs in the target framework.

## Recommended minimum architecture

The orchestrator should construct the task graph, decide whether delegation is justified, issue bounded contracts, and schedule only dependency-ready work.
Each worker should own a cohesive scope, operate in an isolated context and workspace, and return a structured artifact with evidence.
The communication layer should provide versioned request, result, acknowledgement, rejection, cancellation, and invalidation messages.
The integration owner should assemble compatible artifacts, detect ownership conflicts, and invalidate downstream work when an upstream contract changes.
The verifier should independently execute acceptance checks against the integrated state and attribute failures to responsible tasks or handoffs.
The observability layer should preserve sufficient traces to measure cost, locate missing transfers, classify failures, and reproduce cascades.

## Conclusion

The literature does not support a general rule that more coding agents produce better software.
It supports a narrower rule that specialized, dependency-aware, independently verified delegation can improve quality or latency when context and communication are engineered as carefully as code execution.
The central design problem is therefore not spawning subagents but deciding when to delegate, defining what information crosses each boundary, and proving that the assembled result is correct.
