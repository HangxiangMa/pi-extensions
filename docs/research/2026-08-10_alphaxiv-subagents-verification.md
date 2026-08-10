# AI/LLM Subagent Verification and Multi-Agent Methods

## Executive conclusion

Multi-agent workflows sometimes outperform one-shot single-agent generation, but the evidence does not support a general rule that more agents are better.
Independent sampling followed by voting often improves accuracy, but its token and latency costs usually grow with the number of samples.
Multi-agent debate does not reliably beat equal-compute self-consistency, best-of-N sampling, or a stronger single agent.
The most defensible benefits come from independent generation, heterogeneous perspectives, externally verifiable evidence, calibrated aggregation, and explicit stopping conditions.
Unstructured reflection can turn a correct answer into an incorrect one, so a critic should not merely reread the original model's reasoning.
Multi-agent designs also introduce role violations, information loss, mutual anchoring, error propagation, verification failures, security risks, and termination failures.
For coding agents, the strongest default is a primary implementer, an independent reviewer, and deterministic tool-based verification rather than an unrestricted agent debate.

## Scope and evidence policy

This review prioritizes work formally published from 2024 through 2026 and uses earlier arXiv submission dates only when the formal publication occurred within that period.
Publication status, venue, and DOI were verified against official ACL Anthology, NeurIPS Proceedings, or OpenReview pages.
AlphaXiv was used for literature discovery and direct PDF-page queries.
AlphaXiv primarily indexes arXiv material, so an AlphaXiv or arXiv page alone was not treated as evidence of peer review.
All five selected papers have a peer-reviewed publication, but only *More Agents Is All You Need* is a journal article.
ACL, ICLR, NeurIPS, and Findings papers are identified as conference proceedings rather than journals.
The research cutoff is 2026-08-10.

## Recommendation ranking

The ranking weighs coding-agent relevance, evidence quality, failure coverage, and practical usefulness rather than venue prestige alone.

### 1. Why Do Multi-Agent LLM Systems Fail?

- **Title:** *Why Do Multi-Agent LLM Systems Fail?*
- **Authors:** Mert Cemri, Melissa Z. Pan, Shuyi Yang, Lakshya A. Agrawal, Bhavya Chopra, Rishabh Tiwari, Kurt Keutzer, Aditya Parameswaran, Dan Klein, Kannan Ramchandran, Matei A. Zaharia, Joseph E. Gonzalez, and Ion Stoica.
- **Year:** 2025.
- **Publication status:** Formally published peer-reviewed conference paper.
- **Venue:** NeurIPS 2025 Datasets and Benchmarks Track.
- **DOI:** [10.52202/085713-4082](https://doi.org/10.52202/085713-4082).
- **AlphaXiv:** [https://www.alphaxiv.org/abs/2503.13657](https://www.alphaxiv.org/abs/2503.13657).
- **arXiv:** [https://arxiv.org/abs/2503.13657](https://arxiv.org/abs/2503.13657).
- **Official venue page:** [NeurIPS Proceedings](https://proceedings.neurips.cc/paper_files/paper/2025/hash/b1041e52d3be19f0a9bc491657488e4a-Abstract-Datasets_and_Benchmarks_Track.html).

#### Method and findings

The paper introduces MAST, a taxonomy derived from 1,642 execution traces across seven multi-agent frameworks.
The taxonomy contains 14 failure modes grouped into system design, inter-agent misalignment, and task verification.
The studied systems showed failure rates ranging from 41% to 86.7%.
Relevant observed failure modes include unawareness of termination conditions at 12.4%, premature termination at 6.2%, no or incomplete verification at 8.2%, and incorrect verification at 9.1%.
The taxonomy development used six expert annotators and reached inter-annotator agreement of kappa 0.88.
An LLM-as-a-judge annotation pipeline reached kappa 0.77 against human labels and kappa 0.79 on two unseen systems and benchmarks.
A ChatDev role-specification intervention improved task success by 9.4 percentage points.
Adding high-level task-objective verification to ChatDev improved task success by 15.6 percentage points.
The paper does not establish that multi-agent systems generally outperform matched single-agent systems.

#### Coding-agent implementation guidance

- Record every planner, implementer, reviewer, and verifier input, output, tool result, state transition, and termination reason.
- Verify low-level correctness such as compilation together with high-level acceptance criteria and runtime behavior.
- Give only one designated verifier or orchestrator authority to declare completion.
- Detect repeated steps, context loss, ignored feedback, missing clarification, premature completion, and incomplete verification as explicit events.
- Classify failed trajectories by failure mode instead of relying only on aggregate pass rates.
- Revalidate task state and evidence after each asynchronous handoff.

#### Limitations

- MAST is a failure analysis rather than an equal-budget single-agent versus multi-agent experiment.
- The taxonomy is empirically grounded but does not claim to cover every possible failure.
- Most large-scale labels come from a proprietary LLM judge, while the fully human-annotated subset is much smaller.
- Frameworks were evaluated on different tasks and models, so raw failure counts are not a valid framework leaderboard.
- The coding tasks include from-scratch programming and only a limited repository-repair component.

### 2. ReConcile: Round-Table Conference Improves Reasoning via Consensus among Diverse LLMs

- **Title:** *ReConcile: Round-Table Conference Improves Reasoning via Consensus among Diverse LLMs*.
- **Authors:** Justin Chih-Yao Chen, Swarnadeep Saha, and Mohit Bansal.
- **Year:** Formally published in 2024 after an initial 2023 arXiv submission.
- **Publication status:** Formally published peer-reviewed ACL main-conference long paper.
- **Venue:** Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics, Volume 1: Long Papers.
- **DOI:** [10.18653/v1/2024.acl-long.381](https://doi.org/10.18653/v1/2024.acl-long.381).
- **AlphaXiv:** [https://www.alphaxiv.org/abs/2309.13007](https://www.alphaxiv.org/abs/2309.13007).
- **arXiv:** [https://arxiv.org/abs/2309.13007](https://arxiv.org/abs/2309.13007).
- **Official venue page:** [ACL Anthology](https://aclanthology.org/2024.acl-long.381/).

#### Method and findings

ReConcile begins with heterogeneous model families independently producing an answer, explanation, and confidence score.
Each subsequent round lets every agent review the other agents' previous answers and explanations before retaining or revising its position.
The method rescales self-reported confidence through manually designed buckets and uses confidence-weighted voting for the team answer.
The discussion stops when all agents reach the same answer or when the configured maximum of three rounds is reached.
Across seven reasoning benchmarks, the method outperformed prior single-agent and multi-agent baselines by as much as 11.4 percentage points.
The study compares against self-consistency with approximately the same average number of model calls and also reports a nine-way self-consistency comparison.
The paper attributes a substantial part of the gain to diversity across different model families rather than multiple copies of one model.

#### Coding-agent implementation guidance

- Require implementers and reviewers to analyze the task independently before exposing them to each other's conclusions.
- Use different prompts, tools, model families, or review specialties when genuine diversity is needed.
- Require reviewers to identify the exact point of agreement or disagreement and attach reproducible evidence.
- Treat confidence as a secondary weight behind tests, type checks, static analysis, runtime evidence, and acceptance criteria.
- Stop when all acceptance gates pass and no unresolved high-confidence issue remains.
- Impose a hard maximum of two or three review rounds to prevent endless discussion.

#### Limitations

- Most experiments use only 100 samples because of API cost, although two datasets also receive full-test-set evaluation.
- The evaluated ChatGPT, Bard, and Claude 2 versions are older than current production models.
- Self-reported confidence is overconfident and requires a hand-designed recalibration function.
- The strongest configuration uses selected human-written convincing examples.
- The evaluation focuses on reasoning benchmarks rather than complete software-engineering tasks.

### 3. Large Language Models Cannot Self-Correct Reasoning Yet

- **Title:** *Large Language Models Cannot Self-Correct Reasoning Yet*.
- **Authors:** Jie Huang, Xinyun Chen, Swaroop Mishra, Huaixiu Steven Zheng, Adams Wei Yu, Xinying Song, and Denny Zhou.
- **Year:** Formally published in 2024 after an initial 2023 arXiv submission.
- **Publication status:** Formally published peer-reviewed conference paper.
- **Venue:** ICLR 2024 poster.
- **DOI:** The official publication record does not list a DOI.
- **AlphaXiv:** [https://www.alphaxiv.org/abs/2310.01798](https://www.alphaxiv.org/abs/2310.01798).
- **arXiv:** [https://arxiv.org/abs/2310.01798](https://arxiv.org/abs/2310.01798).
- **Official venue page:** [OpenReview](https://openreview.net/forum?id=IkmD3fKBPQ).

#### Method and findings

The paper distinguishes intrinsic self-correction without external information from correction guided by an oracle label, another model, a tool, or human feedback.
It evaluates up to two self-correction rounds on GSM8K, CommonSenseQA, and HotpotQA.
GPT-3.5 accuracy on GSM8K falls from 75.9% with standard prompting to 74.7% after two intrinsic correction rounds.
GPT-4 accuracy on GSM8K falls from 95.5% to 89.0% after two intrinsic correction rounds.
The model sometimes changes a correct answer into an incorrect one because it cannot reliably judge its own reasoning correctness.
Under an equal-response comparison, multi-agent debate performs no better than self-consistency.
External execution results, tests, search, calculators, or trained verifiers provide more reliable correction signals than ungrounded introspection.

#### Coding-agent implementation guidance

- Do not treat a prompt such as “review your answer again” as independent verification.
- Give the reviewer new evidence such as unit-test output, compiler diagnostics, static-analysis findings, runtime reproduction, or a fresh requirements comparison.
- Do not modify a previously correct result merely because an ungrounded reviewer expresses doubt.
- Keep the original answer and revised answer so the adjudicator can detect regressions.
- Compare a multi-agent design against equal-token best-of-N, self-consistency, and sequential-refinement baselines.

#### Limitations

- The study covers selected reasoning tasks rather than all forms of reflection or correction.
- The evaluated models are GPT-3.5, GPT-4, GPT-4 Turbo, and Llama 2 versions available during the study.
- The conclusions do not rule out useful self-correction for safety, style, formatting, or other easily judged preferences.
- OpenReview feedback notes that the broad title is stronger than the experimental coverage supports.

### 4. Red-Teaming LLM Multi-Agent Systems via Communication Attacks

- **Title:** *Red-Teaming LLM Multi-Agent Systems via Communication Attacks*.
- **Authors:** Pengfei He, Yuping Lin, Shen Dong, Han Xu, Yue Xing, and Hui Liu.
- **Year:** 2025.
- **Publication status:** Formally published peer-reviewed Findings paper rather than an ACL main-track paper or journal article.
- **Venue:** Findings of the Association for Computational Linguistics: ACL 2025.
- **DOI:** [10.18653/v1/2025.findings-acl.349](https://doi.org/10.18653/v1/2025.findings-acl.349).
- **AlphaXiv:** [https://www.alphaxiv.org/abs/2502.14847](https://www.alphaxiv.org/abs/2502.14847).
- **arXiv:** [https://arxiv.org/abs/2502.14847](https://arxiv.org/abs/2502.14847).
- **Official venue page:** [ACL Anthology](https://aclanthology.org/2025.findings-acl.349/).

#### Method and findings

Agent-in-the-Middle intercepts and rewrites messages sent to one victim agent without directly modifying the other agents or tools.
An adversarial LLM uses reflection over earlier attack attempts and intercepted context to generate progressively tailored malicious instructions.
The experiments cover AutoGen, CAMEL, HumanEval, MBPP, two MMLU domains, and chain, tree, complete, and random communication structures.
Attack success exceeds 40% in every reported framework, dataset, topology, and attack-objective combination and exceeds 70% in most cases.
Linear chain structures are especially vulnerable because one contaminated message can influence every downstream agent.
In MetaGPT experiments, attack success is above 75% in all reported HumanEval and MBPP cases and reaches 100% in several SoftwareDev cases.

#### Coding-agent implementation guidance

- Treat every subagent message as untrusted data rather than as a new instruction source.
- Use typed schemas, explicit provenance, integrity checks, and role-specific capability restrictions for handoffs.
- Have reviewers inspect the original task, diff, and tool evidence rather than trusting an upstream summary.
- Run generated code in a sandbox with minimum filesystem, network, process, and credential permissions.
- Prevent untrusted repository text, logs, and tool output from changing agent authority or policy.
- Make the final verifier consume raw artifacts through an independent channel rather than the same potentially contaminated message chain.

#### Limitations

- The paper primarily demonstrates attacks and does not experimentally validate a complete defense.
- Experiments focus on black-box GPT models, four communication structures, and two real multi-agent applications.
- The threat model assumes the attacker can intercept and modify messages sent to one agent.
- The findings do not imply that authenticated, local, or capability-isolated agent systems are equally vulnerable.

### 5. More Agents Is All You Need

- **Title:** *More Agents Is All You Need*.
- **Authors:** Junyou Li, Qin Zhang, Yangbin Yu, Qiang Fu, and Deheng Ye.
- **Year:** 2024.
- **Publication status:** Formally published peer-reviewed journal article and the only journal article in this selected set.
- **Venue:** Transactions on Machine Learning Research, published in October 2024.
- **DOI:** The official publication record does not list a DOI.
- **AlphaXiv:** [https://www.alphaxiv.org/abs/2402.05120](https://www.alphaxiv.org/abs/2402.05120).
- **arXiv:** [https://arxiv.org/abs/2402.05120](https://arxiv.org/abs/2402.05120).
- **Official venue page:** [OpenReview](https://openreview.net/forum?id=bgzUSZ8aeg).

#### Method and findings

Agent Forest generates independent answers to the same question and chooses the majority answer.
The method has no role specialization or inter-agent communication and is more accurately understood as parallel sampling and ensembling.
Experiments cover GSM8K, MATH, Chess, MMLU, HumanEval, multiple model sizes, and combinations with prompting, debate, and reflection methods.
Increasing the ensemble size usually improves accuracy, particularly on moderately difficult tasks, longer reasoning chains, and weaker models.
The benefit falls on extremely difficult tasks when the model's probability of producing a correct answer becomes too low.
The HumanEval experiments show that debate with Llama 2 can fail because exposing agents to other answers introduces noise into code logic.
Token usage grows proportionally with the ensemble size.

#### Coding-agent implementation guidance

- Generate two or three isolated candidate designs before comparison when a decision is high risk and objectively testable.
- Prefer independent generation followed by evidence-based selection over unrestricted debate when interaction is likely to cause anchoring.
- Use deterministic tests or acceptance criteria rather than majority vote when candidate correctness can be executed or measured.
- Allocate additional samples only to uncertain or high-impact steps.
- Keep easy and directly verifiable tasks on a single-agent path.

#### Limitations

- Model calls and token use grow approximately linearly with the number of samples.
- The study does not establish superiority over a stronger single agent under matched money, latency, and token budgets.
- Majority voting depends on partially independent errors and on the correct answer having enough probability to become the modal answer.
- The method does not provide a complete adaptive stopping or abstention policy.
- Calling independent samples “agents” can obscure the distinction from stateful, role-based subagent systems.

## Cross-paper answer: do multiple agents really beat one agent?

The answer depends on the baseline and the source of additional information.
Multiple independent samples commonly beat one sample, but this demonstrates test-time ensembling rather than a unique benefit from agent communication.
ReConcile shows that heterogeneous models, independent initial answers, calibrated aggregation, and bounded discussion can outperform comparable reasoning baselines on its selected tasks.
The self-correction study shows that multi-agent debate may not beat self-consistency when the number of responses is matched.
MAST shows that orchestration creates substantial new failure surfaces, including incomplete verification and incorrect stopping.
The communication-attack study shows that collaboration channels can propagate malicious or simply incorrect instructions through the system.
The overall evidence therefore supports conditional escalation rather than multi-agent execution by default.
A system should add agents only when their independence, specialization, parallelism, or access to new evidence offsets the coordination cost and failure risk.

## Recommended coding-agent workflow

### 1. Admission decision

Use a single agent for small, local, directly testable changes.
Add a reviewer when the change has meaningful correctness, lifecycle, security, concurrency, compatibility, or integration risk.
Add parallel implementers only when the alternatives can remain isolated until an evidence-based selection point.

### 2. Independent proposal phase

Give each participating agent the original task, repository state, constraints, and permitted tools.
Do not initially expose one agent's reasoning or confidence to another agent.
Require each proposal to identify assumptions, affected files, expected behavior, verification commands, and unresolved risks.

### 3. Independent review phase

Give the reviewer the original request, resulting diff, relevant source, and available tests.
Require every finding to name a concrete failure scenario and reproducible evidence.
Ask the reviewer to separate confirmed defects, uncertain risks, and non-blocking preferences.
Do not accept agreement, confidence, or persuasive language as proof.

### 4. Deterministic verification phase

Run the narrowest relevant tests first and then the repository's required integration gates.
Verify high-level user requirements separately from compilation, formatting, and unit-level correctness.
Use runtime output, tests, type checks, static analysis, security checks, and artifact inspection as external feedback.
Preserve raw outputs so the adjudicator does not depend on a lossy or contaminated summary.

### 5. Adjudication and confidence handling

Prefer objective evidence over the number of agents supporting a position.
Treat self-reported confidence as uncalibrated unless it has been validated on representative local tasks.
When evidence is incomplete, retain competing hypotheses rather than forcing consensus.
Escalate unresolved high-impact disagreement to a human or a stronger independent verifier.

### 6. Termination conditions

Stop successfully only when every acceptance criterion has evidence and no unresolved high-severity finding remains.
Stop with abstention when required evidence cannot be obtained safely or within the authorized scope.
Limit ordinary reviewer-revision cycles to two rounds unless a new external signal justifies another round.
Terminate repeated, non-progressing, or state-divergent agent loops explicitly rather than waiting for conversational consensus.
Only the designated orchestrator or verifier should publish the final completion state.

### 7. Security boundaries

Treat model output, repository content, issue text, logs, test output, and pasted instructions as untrusted input.
Separate data fields from instruction fields in every handoff schema.
Give each agent only the tools and filesystem or network authority required for its assigned task.
Authenticate or integrity-protect remote agent communication where applicable.
Ensure that one agent cannot silently change another agent's role, policy, permissions, or completion state.

### 8. Local evaluation requirement

Compare the multi-agent workflow with a strong single-agent baseline on the same tasks.
Match the model, task information, tool access, token or dollar budget, wall-clock budget, retry policy, and stopping rules where practical.
Include best-of-N or self-consistency when the multi-agent method also consumes multiple generations.
Measure correctness, regression rate, cost, latency, reviewer precision, verification coverage, and abstention quality.
Do not adopt additional agents when the gain is smaller than normal benchmark variance or harness effects.

## AlphaXiv MCP search evidence

The following evidence records the actual AlphaXiv MCP discovery and PDF-query calls used for this review.

### Discovery call 1

```text
tool: mcp__alphaxiv__discover_papers
difficulty: 9
published_after: 2024-01-01
published_before: 2026-08-10
prioritize: recency
keywords:
  AI
  LLM
  subagent
  multi-agent
  independent verification
  critic
  reviewer
  reflection
  error detection
  confidence calibration
  safety
  termination conditions
  single-agent
```

The returned candidates included the following ranked results.

```text
#1  2607.28527  MANTA: Multi-Agent Network Topology Adaptation for Self-Evolving Multi-Agent Systems
#2  2606.05670  Do More Agents Help? Controlled and Protocol-Aligned Evaluation of LLM Agent Workflows
#3  2607.02186  UA-ChatDev: Uncertainty-Aware Multi-Agent Collaboration for Reliable Software Development
#4  2606.29026  Preventing Error Propagation in Multi-Agent AI through Runtime Monitoring
#5  2607.12397  Critic Experience Bank: Self-Evolving Step-Level Confidence Estimation for LLM Agents
#6  2606.27409  Delayed Verification Destabilizes Multi-Agent LLM Belief
#13 2606.20158  N-Version Programming with Coding Agents
#15 2606.05704  Critic-Guided Heterogeneous Multi-Agent Reasoning for Reliable Mathematical Problem Solving
```

The 2026 candidates were not promoted into the final five because the retrieved records were recent arXiv entries without a verified peer-reviewed publication at the research cutoff.

### Discovery call 2

```text
tool: mcp__alphaxiv__discover_papers
difficulty: 9
published_after: 2024-01-01
published_before: 2025-12-31
prioritize: historical
keywords:
  LLM
  multi-agent
  independent verification
  critic
  reviewer
  reflection
  error detection
  confidence calibration
  safety
  termination conditions
  single-agent
```

The returned candidates included the following ranked results.

```text
#1  2503.13657  Why Do Multi-Agent LLM Systems Fail?
#2  2505.18286  Single-agent or Multi-agent Systems? Why Not Both?
#5  2505.00212  Which Agent Causes Task Failures and When?
#8  2412.01928  MALT: Improving Reasoning with Multi-Agent LLM Training
#13 2502.14847  Red-Teaming LLM Multi-Agent Systems via Communication Attacks
#14 2505.22960  Revisiting Multi-Agent Debate as Test-Time Scaling
```

### Direct PDF queries

The review then called `mcp__alphaxiv__answer_pdf_queries` for each selected paper.

```text
2503.13657 -> <paper id="2503.13657v3"> -> pages 1, 2, 7, 8, 26, and related appendix pages
2402.05120 -> <paper id="2402.05120v2"> -> pages 1, 7, 8, 10, 11, and 12
2309.13007 -> <paper id="2309.13007v3"> -> pages 1, 2, 6, 9, and 15
2310.01798 -> <paper id="2310.01798v2"> -> pages 1 through 6, 8, and 9
2502.14847 -> <paper id="2502.14847v2"> -> pages 1 through 6 and 9
```

The PDF queries requested exact title and authors, publication claims printed in the paper, methods, single-agent comparisons, confidence handling, verification, stopping behavior, security findings, quantitative results, and limitations.
Venue and DOI metadata were subsequently checked against the official publication pages listed in each paper entry.

## Final recommendation

Start with one capable coding agent and deterministic external verification.
Add one independent reviewer when a separate failure-detection perspective is justified.
Use multiple implementers only for separable work or genuinely different candidate approaches.
Do not let agents debate indefinitely or treat consensus as correctness.
Require evidence-backed acceptance gates, a single completion authority, a bounded retry policy, and explicit abstention.
Before adopting a multi-agent workflow, verify that it beats an equal-budget single-agent or best-of-N baseline on representative repository tasks.
