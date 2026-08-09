# Coding-Agent Subagents: AlphaXiv Evidence Audit

## Executive finding

The audited literature does not establish that coding subagents generally outperform a strong single coding agent under simultaneously matched model, information, token or dollar budget, wall-clock budget, sampling, and evaluation protocol.
The strongest positive repository-scale result is Co-Coder, which uses the same base model and reports higher test pass rates together with lower observed API cost and latency than its sequential baseline across 28 from-scratch Python repository tasks.
The strongest negative coding evidence is CooperBench, where same-model two-agent teams solved substantially fewer paired features than one agent handling both features, even though the two-agent condition had up to twice the aggregate action allowance.
The strongest broad baseline audit is *The Illusion of Multi-Agent Advantage*, where automatic multi-agent systems failed to beat five-sample self-consistency on SWE-bench Lite across the evaluated GPT-4o, GPT-5, and Gemini 2.5 Pro settings.
Dynamic parent-created delegation remains weakly supported for repository maintenance because the clearest dynamic systems were evaluated on long-context aggregation, mixed workspace management, tool-use workflows, or open-ended optimization rather than repeated real-issue repair with a matched single-agent control.
The defensible conclusion is narrower than the existing notes imply: structured delegation can help when it isolates genuine context pressure, preserves alternative program states, or partitions weakly coupled work, but free-form spawning and additional agents are not independently validated sources of coding quality.

## Evidence labels

**Direct evidence** means a method, number, limitation, or protocol stated in the queried paper PDF, not an independently reproduced result.
**Paper-author claim** means the authors' interpretation of their measurements.
**Audit inference** means a conclusion drawn here from protocol comparison or synthesis across papers.

## Search scope and method

The audit read the two existing local notes in full before searching.
The audit used AlphaXiv MCP `discover_papers` twice at difficulty 10, once for explicit coding subagents, repository-scale coding, dynamic delegation, matched baselines, costs, latency, failures, and benchmark validity, and once specifically for negative results and simple-baseline comparisons.
The discovery calls returned papers on Recursive Agent Harnesses, ClawArena-Team, Software Delegation Contracts, subagent inheritance, Claw-SWE-Bench, multi-agent coding coordination, harness failure attribution, real-world coding-agent failures, automatic-MAS baseline audits, paired noise floors, and related failure studies.
The audit then used AlphaXiv MCP `answer_pdf_queries` on 16 papers to inspect experimental tables, model and budget controls, task scale, repeated-run policy, failure modes, and author-stated limitations.
The 16 queried papers were [Recursive Agent Harnesses](https://arxiv.org/abs/2606.13643), [ClawArena-Team](https://arxiv.org/abs/2606.31174), [SWARMRESEARCH](https://arxiv.org/abs/2607.02807), [MAGIS](https://arxiv.org/abs/2403.17927), [MASAI](https://arxiv.org/abs/2406.11638), [Co-Coder](https://arxiv.org/abs/2606.00953), [The Illusion of Multi-Agent Advantage](https://arxiv.org/abs/2606.13003), [How Much Coordination Gain Is Real?](https://arxiv.org/abs/2606.20695), [CooperBench](https://arxiv.org/abs/2601.13295), [When Child Inherits](https://arxiv.org/abs/2605.08460), [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657), [OrchBench](https://arxiv.org/abs/2607.25656), [OrchestraBench](https://arxiv.org/abs/2608.05263), [CodeDelegator](https://arxiv.org/abs/2601.14914), [Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets](https://arxiv.org/abs/2604.02460), and [Claw-SWE-Bench](https://arxiv.org/abs/2606.12344).
The research cutoff is 2026-08-10.
No factual claim in this report relies on memory.

## What counts as a fair baseline

A matched-model comparison uses the same model version and reasoning setting for the single-agent and multi-agent arms.
A matched-information comparison gives both arms the same issue text, repository state, hints, tests, tools, and external access.
A matched-budget comparison constrains total model calls, generated and input tokens, dollar cost, wall-clock time, retries, and independent samples rather than merely using the same per-call limit.
A matched-harness comparison changes delegation while holding the agent loop, system prompt, tool interface, patch extraction, stopping logic, and evaluator stable.
A strong single-agent baseline may use the same total test-time compute through self-consistency, best-of-N sampling, or sequential refinement.
No explicit repository-scale parent-subagent study in the audited set satisfies all five conditions.

## Audit of representative headline claims in the existing notes

### Recursive Agent Harnesses

- **Direct evidence:** [RAH](https://arxiv.org/abs/2606.13643) reports 81.36% on 199 Oolong-Synthetic instances versus a published GPT-5 Codex-style baseline of 71.75%, with a reported gain of 9.61 points and a bootstrap interval of 4.2 to 14.8 points.
- **Direct evidence:** The parent, subagents, and answer extractor use GPT-5, so model family and version are matched to the imported Codex result.
- **Direct evidence:** The baseline was not rerun by the RAH authors, its per-instance outcomes were unavailable, and the reported difference interval bootstraps only RAH scores while treating the baseline point estimate as fixed.
- **Audit inference:** The same-model headline is real as a model-control claim but is not a matched-compute or paired statistical comparison.
- **Direct evidence:** Exact token and wall-clock profiles were not instrumented, and recursion depth, entries per subagent, and script spawning versus tool spawning were not ablated.
- **Direct evidence:** The paper says both that every evaluated instance produced a task script and that a small number of instances answered directly without spawning, which is an unresolved internal reporting inconsistency.
- **Audit inference:** RAH is evidence for parallel long-context aggregation, not repository issue resolution, code integration, or general coding delegation.

### ClawArena-Team

- **Direct evidence:** [ClawArena-Team](https://arxiv.org/abs/2606.31174) contains 41 scenarios, 258 rounds, and 72 staged updates, and the best manager obtained 60.0% Subagent-Management Score and 74.4% task completion.
- **Direct evidence:** Every manager uses the same locally served worker pool, no manager exceeded 50% workspace-permission precision, and main-agent API cost ranged from about $0.80 to $92.80 while management score ranged from 15.3% to 60.0%.
- **Direct evidence:** Delegation is mandatory because the text-only manager cannot directly access all workspace regions or non-text modalities.
- **Direct evidence:** The study compares manager models in one run each and does not include a no-subagent or single-agent baseline under matched budget.
- **Direct evidence:** Reported dollar cost covers the main-agent API, while the fixed local worker pool is not priced as an equivalent external API workload.
- **Audit inference:** The benchmark credibly measures management behavior under a fixed worker pool but cannot show that a managed team beats a capable single agent.

### SWARMRESEARCH

- **Direct evidence:** [SWARMRESEARCH](https://arxiv.org/abs/2607.02807) reports exceeding or matching EvoX and CORAL on 13 of 15 open-ended optimization tasks and beating the best tested fixed scaling configuration on four of five controlled tasks.
- **Direct evidence:** The primary comparison uses one stochastic run per method and task, gives SWARMRESEARCH and CORAL $50 per task, gives EvoX 100 iterations costing $23.50 on average, and notes that neither SWARMRESEARCH nor CORAL converged within budget.
- **Direct evidence:** The controlled 60-iteration comparison uses Minimax-M2.5 workers in both arms but adds a Claude Sonnet 4.6 orchestrator in the dynamic arm, which increases total output tokens by 7.7%.
- **Audit inference:** The controlled scaling result does not isolate orchestration under a matched-model or matched-token design.
- **Direct evidence:** The speculative-decoding implementation reached 4.58 times vanilla throughput at 60.6% accuracy, while autoresearch reached 1.80 times at 65.8% accuracy and CORAL reached 2.26 times at 58.4% accuracy.
- **Direct evidence:** SWARMRESEARCH used an approximately 11-hour analysis phase followed by an approximately 11-hour solution-generation phase, while the compared methods generated solutions for approximately 12 hours.
- **Audit inference:** The existing note's implication of similar elapsed time omits an additional analysis phase and an accuracy tradeoff, so the 4.58-times result is not a matched-time dominance claim.

### MAGIS

- **Direct evidence:** [MAGIS](https://arxiv.org/abs/2403.17927) reports 13.94% resolved and 97.39% applicable on the 25% SWE-bench subset used by the original GPT-4 study, versus 1.74% resolved for direct GPT-4.
- **Direct evidence:** The evaluation setting provides the files requiring modification, and the full MAGIS configuration also uses pre-commit pull-request comments as hints.
- **Direct evidence:** Removing hints lowers resolution to 10.28%, removing QA lowers it to 10.63%, and removing both lowers it to 8.71%.
- **Direct evidence:** The direct GPT-4 baseline and MAGIS are not matched for model calls, tokens, cost, latency, QA iterations, or auxiliary information.
- **Audit inference:** The roughly eight-fold number demonstrates the value of a larger engineered workflow over a minimal direct call, not a clean causal advantage from multiple agents.

### MASAI

- **Direct evidence:** [MASAI](https://arxiv.org/abs/2406.11638) reports 28.33% resolution, 75.0% file localization, 95.33% patch application, and $1.96 average cost on 300 SWE-bench Lite issues from 11 Python repositories.
- **Direct evidence:** Five GPT-4o subagents form a fixed pipeline, and the Fixer samples five patches before the Ranker uses a generated reproduction test.
- **Direct evidence:** Random five-way selection reaches 22.28%, model ranking without the generated test reaches 23.33%, and test-informed ranking reaches 28.33%.
- **Audit inference:** This is useful direct evidence that executable test evidence improves candidate selection inside the pipeline.
- **Direct evidence:** The leaderboard comparisons mix models, hints, testing assumptions, tools, and harnesses, and no same-model equal-budget single-agent or best-of-five ablation reproduces the full MASAI workload.
- **Audit inference:** MASAI supports fixed specialization and test-guided selection but does not validate dynamic parent-to-subagent delegation.

### Co-Coder

- **Direct evidence:** [Co-Coder](https://arxiv.org/abs/2606.00953) evaluates 28 from-scratch Python repository-generation tasks over three independent runs per repository with GPT-5-mini as the base model for all methods.
- **Direct evidence:** On DevEval, Co-Coder reports 68.1% average pass rate, 442 seconds, and $0.18 per task, versus 56.8%, 800 seconds, and $0.25 for the sequential OpenHands baseline.
- **Direct evidence:** On CodeProjectEval, Co-Coder reports 34.1%, 1,315 seconds, and $0.67, versus 20.1%, 2,756 seconds, and $1.03 for the sequential baseline.
- **Direct evidence:** Naive file parallelism costs 44% more than sequential on DevEval and 60% more on CodeProjectEval for only 0.9-point and 3.2-point average pass-rate gains.
- **Direct evidence:** Claude Code Agent Teams is faster and cheaper but scores below sequential on both benchmarks, at 54.1% versus 56.8% and 16.3% versus 20.1%.
- **Audit inference:** Co-Coder is the strongest audited positive evidence because the same-model main comparison improves quality, observed cost, and latency at once.
- **Direct evidence:** The tasks generate repositories averaging 3.1 files and 243 lines on DevEval and 11.9 files and 2,371 lines on CodeProjectEval rather than repairing mature repositories.
- **Direct evidence:** Co-Coder and sequential use the same OpenHands SDK, while the Agent Teams reference uses a different Claude Code harness, and the paper does not impose an equal-token or equal-dollar ceiling.
- **Audit inference:** The result supports cohesion-aware partitioning for bounded from-scratch generation but does not establish a general parent-subagent advantage for issue repair.

### MAST failure taxonomy

- **Direct evidence:** [MAST](https://arxiv.org/abs/2503.13657) analyzes 1,642 traces from seven systems across coding, mathematics, and general-agent tasks and reports system failure rates from 41.0% to 86.7% on different benchmarks.
- **Direct evidence:** Its pooled taxonomy assigns 44.2% of observed failure labels to system design, 32.3% to inter-agent misalignment, and 23.5% to task verification.
- **Direct evidence:** Human development of the taxonomy reached kappa 0.88, while the scalable few-shot LLM annotator reached kappa 0.77 against human labels.
- **Direct evidence:** The repository-repair component is only 30 HyperAgent traces on SWE-bench Lite, while most labels come from other systems and tasks.
- **Direct evidence:** The reported 9.4-point and 15.6-point ChatDev interventions are on small from-scratch ProgramDev studies rather than repository maintenance.
- **Audit inference:** MAST is strong evidence that coordination and verification failures are common, but its pooled percentages should not be presented as coding-subagent-specific rates.

### OrchBench and OrchestraBench

- **Direct evidence:** [OrchBench](https://arxiv.org/abs/2607.25656) simulates fixed task DAGs rather than discovering decompositions or executing repository workers.
- **Direct evidence:** Its final simulated score correlates with real Claude Code quality at Pearson 0.816 with a two-sided permutation p-value of 0.047 across six model-level points, while Spearman 0.771 has p-value 0.103.
- **Direct evidence:** Simulated time and token measures do not reliably correlate with real resource consumption, and cross-framework time correlation is negative 0.104.
- **Direct evidence:** The reported multi-agent quality advantage falls from 0.302 at a 16K simulated context limit to 0.007 at 128K.
- **Audit inference:** This supports the hypothesis that context pressure creates a delegation regime, but it is indirect evidence because the effect is produced by the simulator's explicit compression and transfer rules.
- **Direct evidence:** [OrchestraBench](https://arxiv.org/abs/2608.05263) uses controlled arithmetic chains, author-labelled routing cases, and prompt-level fault injection for its headline experiments.
- **Direct evidence:** The paper explicitly states that the core failure experiments use one Claude agent over a staged chain rather than a literal multi-agent system.
- **Direct evidence:** Tool faults recover at 1.0, ambiguous delegation recovers at 0.30, and three latent or semantic failures recover at 0.0 in the main arithmetic probe.
- **Direct evidence:** Removing trusted upstream state collapses the apparent LLM-router latent recovery from 0.67 to 0.08, near the baseline level.
- **Audit inference:** OrchestraBench is useful mechanistic counterevidence against blind retries, but its headline results should not be described as observed production multi-agent or coding behavior.

## Materially relevant papers missed by the existing notes

### The Illusion of Multi-Agent Advantage

- **Direct evidence:** [The Illusion of Multi-Agent Advantage](https://arxiv.org/abs/2606.13003) compares six automatic multi-agent frameworks with chain-of-thought and five-sample self-consistency across reasoning, browsing, and 168 SWE-bench Lite test tasks.
- **Direct evidence:** Results average three runs except the Gemini 2.5 Pro cells, which use one run because of cost.
- **Direct evidence:** On SWE-bench Lite with GPT-5, self-consistency scores 57.09% at $286.40, while DyLAN scores 55.97% at $227.40 and the other automatic systems score from 27.23% to 45.52% at costs from $83.50 to $998.20.
- **Direct evidence:** On SWE-bench Lite with GPT-4o, self-consistency scores 22.01% at $168.30, while all automatic systems score lower at 8.97% to 19.28% with costs from $35.60 to $1,210.90.
- **Direct evidence:** On SWE-bench Lite with Gemini 2.5 Pro, direct chain-of-thought scores 28.70% at $47.17, while the evaluated automatic systems score from 0.00% to 27.60% at $206.27 to $434.00.
- **Paper-author claim:** Current automatic architectures exhibit role redundancy, functional collapse, and architectural bloat that fails to convert extra inference into useful coordination.
- **Audit inference:** This is direct contradictory evidence for automatic multi-agent coding, although it does not rule out carefully hand-designed systems such as Co-Coder or MASAI.

### CooperBench

- **Direct evidence:** [CooperBench](https://arxiv.org/abs/2601.13295) contains 652 paired-feature tasks over 12 open-source repositories in Python, TypeScript, Go, and Rust, with 77.3% of tasks having conflicting ground-truth edits.
- **Direct evidence:** Under the same model, GPT-5 scores 48% solo versus 28% with two agents, Claude Sonnet 4.5 scores 47% versus 26%, and MiniMax-M2 scores 36% versus 14%.
- **Direct evidence:** Each agent in the cooperative condition may take up to 100 actions, while one solo agent handles both features under the same per-agent cap, so the team has more aggregate action capacity rather than a stricter matched budget.
- **Direct evidence:** Adding natural-language communication reduces raw merge conflicts but does not significantly improve final cooperation success, and the final average communication effect after merge resolution is negative 0.5 points.
- **Direct evidence:** On a 46-task subset, success falls from 68.6% with two agents to 46.5% with three and 30.0% with four.
- **Paper-author claim:** Vague or late messages, broken commitments, and incorrect beliefs about peers create a curse of coordination.
- **Audit inference:** CooperBench is not a parent-subagent system, but it directly falsifies the assumption that parallel coding agents naturally combine into a stronger repository result.

### CodeDelegator

- **Direct evidence:** [CodeDelegator](https://arxiv.org/abs/2601.14914) implements an explicit persistent Delegator that creates fresh ephemeral Coder agents with isolated execution contexts and structured artifacts.
- **Direct evidence:** With DeepSeekV3.2, it scores 82.0% versus 79.6% for ReAct on tau2-bench retail, 63.5% versus 58.5% on airline, and 38.4% versus 25.8% on 127 MCPMark tasks.
- **Direct evidence:** The PostgreSQL MCPMark domain is a negative case where ReAct scores 52.4% and CodeDelegator scores 41.7%.
- **Direct evidence:** The same backbone is used within each comparison, but baselines allow 200 interaction steps while CodeDelegator allows up to 100 dispatch rounds with 20 Coder iterations each.
- **Direct evidence:** The paper reports no total token, dollar, or wall-clock comparison and supports only sequential decomposition.
- **Audit inference:** CodeDelegator is relevant architecture evidence for isolated parent-to-child handoffs, but it is not repository coding evidence and does not survive a matched-compute test.

### Equal-thinking-token single-agent comparison

- **Direct evidence:** [Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets](https://arxiv.org/abs/2604.02460) compares sequential, subtask-parallel, role-parallel, debate, and ensemble systems with single agents across Qwen3, DeepSeek-R1-Distill-Llama, and Gemini 2.5.
- **Direct evidence:** At a nominal 1,000-token budget, the cross-model and cross-dataset average is 0.418 for the single agent versus 0.388 for the strongest multi-agent average, which is debate.
- **Direct evidence:** At 2,000 tokens, the average is 0.421 for the single agent versus 0.403 for the strongest multi-agent average, again debate.
- **Direct evidence:** Actual thinking-token use often falls below or exceeds requested budgets, especially through Gemini API accounting, and the paper treats these artifacts as a validity problem.
- **Audit inference:** This is the clearest matched-token counterevidence but covers multi-hop question answering rather than coding, so it supports evaluation methodology more strongly than a coding conclusion.

### Claw-SWE-Bench

- **Direct evidence:** [Claw-SWE-Bench](https://arxiv.org/abs/2606.12344) standardizes 350 GitHub issue-resolution tasks across eight languages and 43 repositories with a fixed prompt, one-hour outer timeout, workspace contract, patch extraction, and evaluator.
- **Direct evidence:** With the same GLM 5.1 model and tasks, a bare direct-diff adapter scores 19.1% with 69.1% patch-application failures, while the full repository-editing adapter scores 73.4% with fewer than 1.5% application failures.
- **Direct evidence:** Holding model fixed, harness choice changes Pass@1 by as much as 27.4 points, and the study reports only one run per cell.
- **Paper-author claim:** Model, harness, task, and cost must be separated because a single resolved rate conflates all four.
- **Audit inference:** Cross-paper multi-agent gains smaller than plausible harness effects are not attributable unless prompt, patch extraction, stopping, tools, and outer budget are controlled.

### Subagent inheritance security

- **Direct evidence:** [When Child Inherits](https://arxiv.org/abs/2605.08460) demonstrates OpenClaw proofs of concept for full parent-memory inheritance, excessive child tool access, stale asynchronous state, and unauthorized sibling termination.
- **Direct evidence:** The core attacks reproduce across MiniMax M2.5, Llama 4 Maverick, Qwen3.5 Plus, DeepSeek V3.2, and GPT-5.2 Codex according to the paper's model sweep.
- **Direct evidence:** Agent Zero and Hermes narrow inherited prompts but still exhibit post-spawn state divergence because executing children do not receive later parent corrections.
- **Audit inference:** This paper provides no coding-quality comparison, but it shows that unrestricted context inheritance and authority are concrete failure surfaces for parent-subagent coding systems.

### Paired benchmark noise floor

- **Direct evidence:** [How Much Coordination Gain Is Real?](https://arxiv.org/abs/2606.20695) finds a pooled configuration-equivalent paired gap of 5 points with a 95% interval from negative 2 to positive 12 points across two 100-task seeds on tau2-bench retail.
- **Direct evidence:** A positive 18-point single-seed contrast reverses to negative 3 points at the second seed and is not significant when pooled.
- **Direct evidence:** The authors explicitly limit the estimated envelope to one model, domain, harness, and protocol, and cross-model or cross-domain probes do not preserve it.
- **Audit inference:** This is not a coding result, but it shows why single-run architectural deltas of a few points should not be treated as stable gains without paired replication.

## Evidence-quality table

Confidence grades the strength of the cited paper for the narrow claim in this audit rather than the overall quality of the paper.

| Paper and arXiv link | Queried version date | Task scale | Baseline fairness | Quantitative result | Principal caveat | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| [Recursive Agent Harnesses, 2606.13643](https://arxiv.org/abs/2606.13643) | 2026-06-11 | 199 synthetic long-context aggregation tasks | Same GPT-5, but imported baseline and unmatched compute | 81.36% versus 71.75% | Not repository coding, no cost profile, and no paired baseline outcomes | Medium for long-context delegation and low for coding |
| [ClawArena-Team, 2606.31174](https://arxiv.org/abs/2606.31174) | 2026-07-02 | 41 mixed workspace scenarios and 258 rounds | Fixed workers across managers, but no single-agent control | Best SMS 60.0% and TCR 74.4% | Delegation is mandatory and each model has one run | Medium for management diagnosis |
| [SWARMRESEARCH, 2607.02807](https://arxiv.org/abs/2607.02807) | 2026-07-02 | 15 open-ended optimization tasks plus five controlled tasks | Partly dollar-matched, but models, repetitions, and case-study time differ | Better or comparable on 13 of 15 and better fixed scaling on four of five | One run per main task and non-converged search | Low to medium |
| [MAGIS, 2403.17927](https://arxiv.org/abs/2403.17927) | 2024-06-27 | 25% of 2,294 SWE-bench issues | Same base model family, but oracle files, hints, and compute differ | 13.94% versus direct GPT-4 at 1.74% | Eight-fold claim is heavily scaffold-confounded | Low for agent-count causality |
| [MASAI, 2406.11638](https://arxiv.org/abs/2406.11638) | 2024-06-17 | 300 SWE-bench Lite issues | Heterogeneous leaderboard baselines and no equal-budget single agent | 28.33% resolved at $1.96 per issue | Fixed pipeline on an older benchmark | Medium for test-guided modularity |
| [Co-Coder, 2606.00953](https://arxiv.org/abs/2606.00953) | 2026-05-31 | 28 Python repository-generation tasks with three runs each | Same GPT-5-mini and shared blueprint for main baselines | 68.1% versus 56.8% and 34.1% versus 20.1%, with lower cost and time | From-scratch generation and small project count | High for bounded cohesion-aware generation |
| [MAST, 2503.13657](https://arxiv.org/abs/2503.13657) | 2025-10-26 | 1,642 traces from seven systems | Diagnostic corpus rather than a single-agent comparison | Failure categories 44.2%, 32.3%, and 23.5% | Coding-specific subset is small and most labels are automated | Medium for general failure taxonomy |
| [The Illusion of Multi-Agent Advantage, 2606.13003](https://arxiv.org/abs/2606.13003) | 2026-06-13 | 168 SWE-bench Lite test tasks plus four other benchmarks | Same backbone with a strong self-consistency baseline, but costs are observed rather than exactly matched | GPT-5 SWE 57.09% for self-consistency versus at most 55.97% for automatic MAS | Tests automatic frameworks, not all hand-designed architectures | High for negative automatic-MAS evidence |
| [CooperBench, 2601.13295](https://arxiv.org/abs/2601.13295) | 2026-01-26 | 652 paired-feature tasks across 12 repositories | Same model and workload, but teams have more aggregate actions | GPT-5 48% solo versus 28% team and Claude 47% versus 26% | Peer collaboration rather than parent-subagent delegation | High for coordination failure |
| [CodeDelegator, 2601.14914](https://arxiv.org/abs/2601.14914) | 2026-01-21 | 165 tau2-bench tasks and 127 MCPMark tasks | Same model, but interaction caps and total compute are unmatched | MCPMark 38.4% versus ReAct 25.8% | Tool workflows rather than repository coding | Medium for isolated delegation architecture |
| [Equal Thinking Token Budgets, 2604.02460](https://arxiv.org/abs/2604.02460) | 2026-04-11 | FRAMES and MuSiQue across three model families | Nominal thinking tokens matched, with documented API accounting artifacts | At 1,000 tokens, single-agent average 0.418 versus best MAS average 0.388 | No coding tasks | Medium for matched-budget methodology |
| [OrchBench, 2607.25656](https://arxiv.org/abs/2607.25656) | 2026-07-28 | 240 generated DAGs plus limited real validation | Deterministic simulation with a modeled single-agent reference | Multi-agent quality gain drops from 0.302 at 16K to 0.007 at 128K | Fixed decompositions and simulator-defined costs | Low for real coding outcomes |
| [OrchestraBench, 2608.05263](https://arxiv.org/abs/2608.05263) | 2026-08-05 | Synthetic arithmetic chains and 26 routing cases | Controlled probes without a real multi-agent control | Recovery 1.0 for tool faults, 0.30 for ambiguity, and 0.0 for three latent faults | One agent simulates a staged chain | Low for literal subagent behavior |
| [Claw-SWE-Bench, 2606.12344](https://arxiv.org/abs/2606.12344) | 2026-06-10 | 350 issues across eight languages and 43 repositories | Fixed outer protocol with model or harness sweeps | Same-model adapter change raises 19.1% to 73.4% | Single runs and adapter comparison is not a component ablation | High for harness-confound evidence |
| [When Child Inherits, 2605.08460](https://arxiv.org/abs/2605.08460) | 2026-05-08 | Three framework inspections and five-model attack sweep | Security proofs of concept without quality baseline | All five tested models reproduce core framework vulnerabilities | No task-success or coding benchmark | Medium for security failure surfaces |
| [Paired Noise-Floor Protocol, 2606.20695](https://arxiv.org/abs/2606.20695) | 2026-06-15 | Two 100-task seeds on tau2-bench retail | Same-model paired configuration-equivalent protocols | Pooled gap 5 points with interval negative 2 to positive 12 | Local to one benchmark, model, and harness | Medium for replication methodology |

## Matched-model and matched-budget synthesis

- **Direct evidence:** Co-Coder holds the base model fixed and reports a Pareto improvement over a sequential baseline, but it does not enforce equal total tokens or dollars and evaluates from-scratch repository generation.
- **Direct evidence:** RAH holds GPT-5 fixed but imports the baseline, adds many subagent calls, and does not instrument total cost or latency.
- **Direct evidence:** CodeDelegator holds the backbone fixed but gives its hierarchy a potentially much larger aggregate interaction allowance and reports no resource totals.
- **Direct evidence:** MAGIS and MASAI do not provide a full same-model, equal-information, equal-budget single-agent control for their headline repository results.
- **Direct evidence:** The automatic-MAS audit shows that simple self-consistency beats all evaluated automatic systems on SWE-bench Lite, although the self-consistency and MAS arms do not all spend identical dollars.
- **Direct evidence:** The equal-thinking-token study finds single agents match or beat five multi-agent structures on non-coding tasks, with API token-control artifacts explicitly documented.
- **Audit inference:** Same-model matching alone is insufficient because subagent systems commonly multiply calls, contexts, retries, or samples.
- **Audit inference:** Observed Pareto dominance, as in Co-Coder, is more informative than an equal-cost ceiling when a system simultaneously improves measured quality, cost, and time, but it still needs replication on maintenance tasks.
- **Audit inference:** The audited evidence does not show that dynamic delegation itself survives a strong repository-scale best-of-N or self-consistency baseline under equal total compute.

## Failure modes supported by direct evidence

- **Direct evidence:** Naive file parallelism creates interface conflicts and redundant repair costs in Co-Coder's baselines.
- **Direct evidence:** Peer coding agents send vague or late messages, break commitments, and mispredict partner behavior in CooperBench.
- **Direct evidence:** MAST observes repeated steps, task and role violations, lost history, ignored input, premature termination, and inadequate verification across seven systems.
- **Direct evidence:** ClawArena managers over-grant files and tools, preserve stale beliefs across updates, and take incorrect text shortcuts on multimodal tasks.
- **Direct evidence:** SWARMRESEARCH's Shepherd tends to collapse onto one approach, prescribe ideas, rarely merge branches, and struggles to synthesize limitations into strategic prompts.
- **Direct evidence:** RAH sometimes skips delegation, provides no measured budget guard, and depends on generating valid spawning scripts.
- **Direct evidence:** CodeDelegator loses to ReAct on PostgreSQL workflows, showing that code-loop delegation can conflict with transactional boundaries.
- **Direct evidence:** OpenClaw-style subagents can inherit malicious parent context, excessive tools, stale state, and unsafe termination authority.
- **Direct evidence:** OrchestraBench shows that retry can repair transient tool faults while reproducing latent semantic corruption when trusted state is not restored.
- **Audit inference:** Context isolation creates an information-transfer obligation, and failures shift from context pollution to missing, stale, or unsafe handoffs when isolation is added without a strong protocol.

## Benchmark-validity findings

- **Direct evidence:** Claw-SWE-Bench shows a 54.3-point same-model change from adapter design alone, which is larger than most reported multi-agent gains.
- **Direct evidence:** RAH's confidence interval excludes uncertainty in the imported baseline because per-instance baseline outcomes were unavailable.
- **Direct evidence:** ClawArena and the main SWARMRESEARCH comparison use one run per model or method despite stochastic execution.
- **Direct evidence:** The paired-noise study demonstrates that a positive 18-point single-seed result can reverse sign on replication in an agent benchmark.
- **Direct evidence:** MAGIS uses oracle modified-file input and its full system uses pull-request comments, while several SWE-bench Lite systems compared by MASAI use different hints and test commands.
- **Direct evidence:** OrchBench's simulated resource measures do not predict real framework cost or time reliably.
- **Direct evidence:** OrchestraBench's main chain is partly deterministic by construction and is executed by one agent rather than a real team.
- **Audit inference:** A credible future benchmark must pair identical tasks and seeds, rerun both arms, preserve per-instance outcomes, and report confidence intervals for the paired difference.
- **Audit inference:** It must also fix or disclose model version, harness, prompt, tools, patch extraction, hints, test visibility, context limits, retries, concurrency, cache pricing, and total model usage.

## Overall conclusion

The existing notes are directionally right that useful subagents require bounded roles, isolated state, structured artifacts, dependency-aware scheduling, and executable verification.
They are too optimistic when they treat same-model results as sufficient evidence, describe synthetic orchestration probes as real multi-agent behavior, or omit unmatched analysis time, auxiliary information, model tiers, and total compute.
Direct repository evidence favors carefully engineered partitioning and verification rather than agent count or open-ended conversation.
Direct contradictory evidence shows that naive or automatically generated teams can cost more, solve less, communicate ineffectively, and become less reliable as agent count rises.
The current literature therefore supports selective delegation under identifiable context or dependency pressure, not a general presumption that a coding parent should spawn subagents.
The most important missing experiment is a paired, repeated repository-maintenance evaluation that compares one strong model in one harness against dynamic parent-subagent delegation, self-consistency, and naive parallelism under the same information, total token or dollar budget, wall-clock ceiling, and patch evaluator.

## Limitations of this audit

AlphaXiv discovery is ranked rather than exhaustive, and its two-search-per-message constraint required broad queries rather than a formal systematic-review search string over every synonym.
AlphaXiv covers arXiv and related indexed papers but not all peer-reviewed venues, industry evaluations, unpublished negative results, or product telemetry.
Several 2026 papers are recent preprints whose tables, titles, code, or conclusions may change after the cutoff.
The audit verified paper text but did not reproduce code, rerun benchmarks, inspect released datasets, or validate provider billing logs.
Reported dollar costs are not directly comparable across papers because models, provider prices, cache discounts, local workers, and accounting boundaries differ.
The audit deliberately treats task scale, baseline fairness, and external validity separately, so a low confidence grade does not imply that a paper's internal measurements are false.
The audit searched actively for contradiction, which improves balance but cannot prove that every relevant positive or negative paper was found.
