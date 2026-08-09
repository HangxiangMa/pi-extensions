# Coding-Agent Subagents and Multi-Agent Orchestration on arXiv

## Methodology and scope

This survey covers recent arXiv literature on subagents for coding agents, hierarchical or multi-agent software-engineering systems, delegation and planning, and agent orchestration.
The literature search used the AlphaXiv MCP `discover_papers` tool as the required primary discovery source.
Paper metadata, architecture claims, evaluation results, and limitations were checked against paper text retrieved through the AlphaXiv MCP `answer_pdf_queries` tool.
The search prioritized recent work and included earlier repository-level systems when they provided direct evidence about explicit software-engineering subagents.
The research cutoff is 2026-08-10.
The selected papers are divided by whether they explicitly implement identifiable subagents or instead evaluate broader multi-agent teams, orchestration plans, or pipeline behavior.
An explicit subagent system must name subordinate agents or workers and define how a parent, manager, orchestrator, or fixed composition delegates work to them.
A broader multi-agent system may coordinate several agents or evaluate orchestration without implementing runtime parent-to-subagent delegation.
The newest 2026 papers are recent preprints, so their results should be treated as preliminary until they receive broader replication.

## Explicit subagent systems

### Recursive Agent Harnesses

- **Title:** Recursive Agent Harnesses.
- **arXiv:** [2606.13643](https://arxiv.org/abs/2606.13643).
- **Date:** 2026-06-11.
- **Classification:** This is an explicit, dynamic, and recursive subagent system.
- **Approach:** A parent coding agent writes and executes orchestration code that launches parallel subagents as complete agent harnesses with planning, filesystem tools, code execution, and isolated contexts.
- **Approach:** Small workloads use structured `Task` calls, while large workloads use generated asynchronous scripts that can launch thousands of subagent harnesses without a per-turn tool-call limit.
- **Approach:** Each subagent can use the same spawning capability to create grandchildren, with recursion bounded by a configurable depth limit whose default is three.
- **Evaluation:** On 199 Oolong-Synthetic instances spanning 13 context-length buckets from 1K to 4M tokens, GPT-5 RAH scored 81.36 percent.
- **Evaluation:** The same-model Codex-style coding-agent baseline scored 71.75 percent, giving RAH a gain of 9.61 percentage points with a reported 95 percent bootstrap confidence interval of 4.2 to 14.8 points.
- **Evaluation:** The recursive-language-model baseline scored 64.38 percent, while the same RAH design reached 89.77 percent with Claude Sonnet 4.5.
- **Limitation:** The evaluation measures long-context aggregation rather than repository issue resolution or general software development.
- **Limitation:** Exact token and wall-clock profiles were not instrumented, and the paper did not ablate recursion depth, entries per subagent, or script-based spawning against tool-call spawning.
- **Implication:** Recursing over complete tool-bearing harnesses can outperform both a single coding harness and recursion over bare model calls when independent evidence exceeds one context window.

### ClawArena-Team: Benchmarking Subagent Orchestration and Dynamic Workflows in Language-Model Agents

- **Title:** ClawArena-Team: Benchmarking Subagent Orchestration and Dynamic Workflows in Language-Model Agents.
- **arXiv:** [2606.31174](https://arxiv.org/abs/2606.31174).
- **Date:** First posted 2026-06-30, with the queried v2 PDF dated 2026-07-02.
- **Classification:** This is an explicit runtime manager-to-subagent benchmark.
- **Approach:** A text-only main agent creates and configures LLM, vision, or multimodal subagents from a fixed locally served worker pool.
- **Approach:** The manager chooses tools, workspace paths, foreground or background execution, session reuse, and JavaScript-style parallel or pipeline workflows.
- **Approach:** The worker pool remains fixed across runs so score differences isolate the main model's management ability rather than worker capability.
- **Evaluation:** The benchmark contains 41 multimodal and multi-directory scenarios, 258 evaluation rounds, and 72 staged workspace updates.
- **Evaluation:** Among 12 manager models, the best run achieved a 60.0 percent Subagent-Management Score and a 74.4 percent task-completion rate.
- **Evaluation:** No evaluated manager exceeded 50 percent workspace-permission precision, which means workers were routinely granted about twice the files they actually accessed.
- **Evaluation:** Main-agent API cost varied by more than 100 times, while the overall management score varied by less than four times.
- **Evaluation:** Ten middle-ranked models occupied a narrow 43.9 to 53.8 percent score band even though their forbidden-access rates and workflow behavior differed by more than an order of magnitude.
- **Limitation:** The fixed worker pool couples the findings to one particular worker capability level.
- **Limitation:** The 41-scenario sample is modest, and execution-based checks can under-reward correct conditional reasoning that does not match the expected artifact form.
- **Implication:** Subagent benchmarks should score least-privilege delegation, modality routing, scheduling, and state integration rather than final task correctness alone.

### SWARMRESEARCH: Orchestrating Coding Agents for Open-Ended Discovery

- **Title:** SWARMRESEARCH: Orchestrating Coding Agents for Open-Ended Discovery.
- **arXiv:** [2607.02807](https://arxiv.org/abs/2607.02807).
- **Date:** 2026-07-02.
- **Classification:** This is an explicit dynamic orchestrator-to-coding-subagent system.
- **Approach:** A Shepherd Agent maintains global search context and spawns Explorer or Optimizer Search Agents in isolated Git branches and worktrees.
- **Approach:** Explorer agents receive fresh contexts to pursue different high-level approaches, while Optimizer agents inherit a parent's conversation history to continue a promising lineage.
- **Approach:** The Shepherd controls parent-branch selection, subagent type, prompts, and the balance between parallel breadth and serial depth.
- **Evaluation:** Across 15 open-ended mathematics, systems, and heuristic optimization tasks, SWARMRESEARCH exceeded or matched the EvoX and CORAL comparison methods on 13 tasks.
- **Evaluation:** In a controlled 60-iteration study, orchestrator-guided scaling beat the best tested fixed serial-and-parallel configuration on four of five tasks.
- **Evaluation:** In the speculative-decoding case study, the discovered implementation produced 4.58 times the vanilla token throughput, compared with 1.80 times for autoresearch and 2.26 times for CORAL after similar elapsed time.
- **Evaluation:** The orchestrator added only 7.7 percent output tokens over the 60 subagent calls in the controlled scaling study.
- **Limitation:** The primary 15-task comparison used one long run per method and task because repeated runs were prohibitively expensive.
- **Limitation:** SWARMRESEARCH and CORAL each received a 50-dollar budget per task, baseline model choices were not fully matched, and performance had not converged when the budget ended.
- **Implication:** A manager can improve coding exploration by controlling context lineage and preserving alternative program states instead of letting peer agents converge on the current best branch.

### MAGIS: LLM-Based Multi-Agent Framework for GitHub Issue Resolution

- **Title:** MAGIS: LLM-Based Multi-Agent Framework for GitHub Issue Resolution.
- **arXiv:** [2403.17927](https://arxiv.org/abs/2403.17927).
- **Date:** First posted 2024-03-27, with the queried v2 PDF dated 2024-06-27.
- **Classification:** This is an explicit hierarchical software-engineering subagent system.
- **Approach:** A Repository Custodian localizes candidate files, and a Manager decomposes the issue into tasks and creates a matching team of Developer agents.
- **Approach:** Developers implement assigned changes, while a Quality Assurance Engineer reviews each change and can request revisions before integration.
- **Evaluation:** On the paper's 25 percent SWE-bench subset, MAGIS resolved 13.94 percent of issues and applied patches successfully in 97.39 percent of cases.
- **Evaluation:** Direct GPT-4 resolved 1.74 percent on the same comparison, so MAGIS reported roughly an eight-fold resolution improvement.
- **Evaluation:** Removing both QA and pull-request hints reduced resolution to 8.71 percent, while removing only QA produced 10.63 percent and removing only hints produced 10.28 percent.
- **Limitation:** The experiment used an early SWE-bench subset rather than the later SWE-bench Lite or Verified protocols.
- **Limitation:** The headline configuration used pull-request hints, and the paper did not report a detailed cost comparison in the queried evaluation text.
- **Implication:** Repository localization, manager-authored task decomposition, delegated editing, and review can materially outperform direct model application, but auxiliary information affects the measured gain.

### MASAI: Modular Architecture for Software-engineering AI Agents

- **Title:** MASAI: Modular Architecture for Software-engineering AI Agents.
- **arXiv:** [2406.11638](https://arxiv.org/abs/2406.11638).
- **Date:** 2024-06-17.
- **Classification:** This explicitly implements subagents, but they form a fixed non-recursive pipeline rather than a runtime manager-created hierarchy.
- **Approach:** Five named subagents handle test-template generation, issue reproduction, edit localization, candidate patch generation, and patch ranking.
- **Approach:** Each subagent has its own objective, tools, inputs, outputs, and reasoning strategy, and agents communicate by passing structured outputs rather than by open-ended conversation.
- **Evaluation:** On 300 SWE-bench Lite issues, MASAI resolved 28.33 percent, tying CodeR for the best reported resolution rate in the paper's comparison.
- **Evaluation:** MASAI localized all ground-truth patch files in 75.0 percent of cases and generated applicable patches in 95.33 percent of cases.
- **Evaluation:** The average inference cost was 1.96 dollars per issue.
- **Evaluation:** Its reproduction-test-aware ranker selected from five candidate patches to reach 28.33 percent, compared with 23.33 percent for selection without the generated test.
- **Limitation:** The architecture is predetermined, so it does not test whether a manager can choose the number, roles, topology, or recursion depth of subagents at runtime.
- **Limitation:** The results use the older SWE-bench Lite benchmark and GPT-4o throughout the pipeline.
- **Implication:** Specialized short trajectories and machine-executed test feedback can make a fixed subagent pipeline effective even without adaptive orchestration.

## Broader multi-agent orchestration systems and benchmarks

### An Empirical Study of Coordination Mode as the First-Class Citizen in From-Scratch Multi-Agent Coding

- **Title:** An Empirical Study of Coordination Mode as the First-Class Citizen in From-Scratch Multi-Agent Coding.
- **arXiv:** [2607.27877](https://arxiv.org/abs/2607.27877).
- **Date:** 2026-07-30.
- **Classification:** This is a broader fixed-team multi-agent coding study rather than a general parent-to-subagent system.
- **Approach:** MSEval combines ten real full-stack project specifications with ten four-agent collaboration topologies, including feature squads, layer specialists, pipelines, swarming, rotation, project-manager oversight, QA-first work, open-source review, adversarial testing, and competing teams.
- **Approach:** LegoGent provides isolated resumable agent processes, periodic status synchronization, targeted peer messages, shared repositories, and CI/CD deployment.
- **Approach:** TAgent evaluates deployed UI, API, and code behavior against weighted deterministic requirements and returns evidence for up to three repair rounds.
- **Evaluation:** Holding tasks and models fixed, changing coordination topology shifted functional scores by more than 30 points and could double wall-clock time.
- **Evaluation:** On the instant-messaging project, DeepSeek v4 Pro ranged from 89.9 under pipeline coordination to 43.0 under open-source review.
- **Evaluation:** Across the ten-project aggregate cited by the authors, QA-first and rotation tied at 83.3 while open-source review scored 73.5.
- **Evaluation:** Across 600 adjacent refinement transitions, 82.0 percent improved, and 94.7 percent of runs finished the third round above the first round.
- **Limitation:** The projects come from university capstone assignments, so they do not directly represent maintenance of mature production repositories.
- **Limitation:** Some transport and security checks depend on the benchmark's fixed deployment infrastructure, which creates a ceiling unrelated to agent coding quality.
- **Implication:** Team topology can rival model capability, and clear ownership plus early executable validation generally beats diffuse collaboration or heavy managerial oversight.

### OrchBench: Evaluating Multi-Agent Orchestration Plans in Isolation via Deterministic Simulation

- **Title:** OrchBench: Evaluating Multi-Agent Orchestration Plans in Isolation via Deterministic Simulation.
- **arXiv:** [2607.25656](https://arxiv.org/abs/2607.25656).
- **Date:** 2026-07-28.
- **Classification:** This evaluates multi-agent plans without running actual subagent workers during benchmark scoring.
- **Approach:** A planner receives a fixed task-dependency graph, context limit, and agent budget, then assigns tasks to agents and specifies cross-agent information transfers and retention ratios.
- **Approach:** A deterministic simulator measures terminal-result quality, critical-path efficiency, token efficiency, missing transfers, and context-compression loss.
- **Evaluation:** Simulated final scores correlated with Claude Code execution quality at Pearson r equals 0.816 and Spearman rho equals 0.771.
- **Evaluation:** The simulator used 1.3 percent of the real-execution tokens and 10.3 percent of the wall-clock time in the headline comparison.
- **Evaluation:** At a 16K context limit, simulated multi-agent quality exceeded the single-agent baseline by 0.302, but the advantage fell to 0.007 at 128K.
- **Evaluation:** Adding one simulator-selected handoff raised mean real MultiAgentBench execution score from 3.754 to 4.150 out of five.
- **Limitation:** Task decomposition and dependencies are supplied rather than discovered by the planner.
- **Limitation:** Simulated time and token metrics did not correlate reliably with real framework consumption, so target-framework validation remains necessary.
- **Implication:** Additional agents help most when working state exceeds one context window, while preserving dependency information matters more than maximizing agent count.

### OrchestraBench: Evaluating Multi-Agent Orchestration Failure Modes, Recovery, and Decomposition Quality

- **Title:** OrchestraBench: Evaluating Multi-Agent Orchestration Failure Modes, Recovery, and Decomposition Quality.
- **arXiv:** [2608.05263](https://arxiv.org/abs/2608.05263).
- **Date:** 2026-08-05.
- **Classification:** This studies controlled multi-agent pipelines and failure handling rather than runtime parent-created coding subagents.
- **Approach:** The benchmark injects seeded routing, delegation, tool, context, conflicting-output, and premature-action failures into reproducible workflow chains.
- **Approach:** It measures routing accuracy, per-failure-mode recovery, cascade radius, time to detection, and decomposition fidelity.
- **Evaluation:** On a 26-case routing diagnostic, a keyword-and-flag heuristic scored zero percent on adversarial cases, while both an intent-reading TF-IDF router and an LLM router scored 100 percent.
- **Evaluation:** In the arithmetic-chain probe, tool-invocation failures recovered at 1.00, ambiguous delegation recovered at 0.30, and context pollution, conflicting outputs, and premature action recovered at 0.00.
- **Evaluation:** Mean latent-failure cascade radius grew from 0.93 at pipeline depth three to 4.67 at depth seven, while tool-failure cascade radius remained zero.
- **Evaluation:** A decomposition policy achieved 1.00 delegation fidelity versus 0.37 for a monolithic policy even though both produced correct final answers.
- **Limitation:** The routing diagnostic contains only 26 author-labelled cases and saturates for description-reading routers.
- **Limitation:** Most failure experiments use synthetic arithmetic chains and Claude-family models, so broader production and cross-provider validation remains future work.
- **Implication:** Routing should inspect task intent, and blind retries cannot repair corrupted shared state because reliable containment requires detection, attribution, and trustworthy state repair.

## Synthesis

The literature supports a spectrum rather than one uniform definition of a coding subagent.
Recursive Agent Harnesses and SWARMRESEARCH provide the clearest evidence for dynamic runtime delegation in which a manager chooses and launches subordinate coding harnesses.
MAGIS also uses a true hierarchy because its Manager decomposes repository issues and creates Developer agents for the resulting tasks.
MASAI explicitly names and implements subagents, but its contribution is fixed role specialization rather than adaptive spawning or orchestration.
MSEval, OrchBench, and OrchestraBench provide important orchestration evidence without demonstrating the same parent-created subagent architecture.
Across these categories, extra agents are most useful when they isolate context, tools, program branches, modalities, or narrowly defined responsibilities.
More agents alone do not guarantee better outcomes because missing handoffs, ambiguous ownership, over-broad permissions, stale state, and merge contention can erase the benefit of parallelism.
The strongest recurring design pattern is a manager with global but compact state that delegates bounded tasks to workers with isolated local contexts and integrates machine-verifiable outputs.
Executable tests, deployment checks, and structured artifacts provide more reliable coordination signals than self-reported completion or unconstrained inter-agent conversation.
Dynamic orchestration appears most valuable for open-ended exploration and work that exceeds one context window, while fixed pipelines remain competitive for predictable repository-repair stages.
Current evidence does not establish a universal best topology because results depend strongly on task structure, context pressure, model choice, worker capability, budget, and evaluation protocol.
Future evaluations should jointly report task quality, cost, latency, information-transfer fidelity, permission precision, recovery behavior, and the marginal benefit over a matched single-agent baseline.
