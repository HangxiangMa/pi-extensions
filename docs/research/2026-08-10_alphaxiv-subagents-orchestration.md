# Research on AI/LLM Subagent Multi-Agent Orchestration Methods

## Abstract

This research reviews five representative papers from 2024–2025 that are directly relevant to AI/LLM subagent multi-agent orchestration.
It focuses on task decomposition, role specialization, model and workflow routing, dynamic team formation, communication cost, and execution latency.
AlphaXiv MCP was the primary source for literature discovery and paper-content verification.
Publication status, venue, and DOI were cross-checked separately against publisher pages or official conference proceedings.
The research cutoff is 2026-08-10.

Among the five selected papers, only TDAG is a formally peer-reviewed journal article.
MasRouter, DynTaskMAS, AgentPrune, and GPTSwarm are all formally peer-reviewed conference papers rather than journal articles.
This research does not present an arXiv preprint or an arXiv DOI as a formal journal or conference DOI.

## Recommendation Ranking

The ranking considers evidence quality, transferability to coding agents, and coverage of task decomposition, routing, cost, and latency.

1. **TDAG**: The only selected formal journal article, and the best fit for dynamic task decomposition and on-demand subagent generation.
2. **MasRouter**: The most complete coverage of collaboration modes, team size, role allocation, model routing, and cost.
3. **DynTaskMAS**: The most direct treatment of dynamic DAGs, asynchronous parallel execution, resource utilization, and latency.
4. **AgentPrune**: The best fit for reducing multi-agent communication tokens and inference cost.
5. **GPTSwarm**: The best fit for automatically searching workflows with offline evaluation, although the optimization itself can be expensive.

## Paper Comparison

| Rank | Paper | Year | Publication status | Venue | DOI |
| --- | --- | --- | --- | --- | --- |
| 1 | TDAG | 2025 | Peer-reviewed journal article | *Neural Networks*, 185, 107200 | [10.1016/j.neunet.2025.107200](https://doi.org/10.1016/j.neunet.2025.107200) |
| 2 | MasRouter | 2025 | Peer-reviewed long conference paper | ACL 2025 | [10.18653/v1/2025.acl-long.757](https://doi.org/10.18653/v1/2025.acl-long.757) |
| 3 | DynTaskMAS | 2025 | Peer-reviewed conference paper | ICAPS 2025 | [10.1609/icaps.v35i1.36130](https://doi.org/10.1609/icaps.v35i1.36130) |
| 4 | AgentPrune | 2025 | Peer-reviewed conference paper | ICLR 2025 | No DOI listed in the official proceedings |
| 5 | GPTSwarm | 2024 | Peer-reviewed conference paper and ICML Oral | ICML 2024, PMLR 235 | No DOI listed on the official PMLR page |

## 1. TDAG

### Publication Metadata

- **Title:** *TDAG: A Multi-Agent Framework based on Dynamic Task Decomposition and Agent Generation*.
- **Authors:** Yaoxiang Wang, Zhiyong Wu, Junfeng Yao, and Jinsong Su.
- **Year:** The first arXiv version appeared in 2024, and the formal journal article was published in 2025.
- **Publication status:** Formally peer-reviewed journal article.
- **Venue:** *Neural Networks*, Volume 185, Article 107200.
- **DOI:** [10.1016/j.neunet.2025.107200](https://doi.org/10.1016/j.neunet.2025.107200).
- **AlphaXiv:** [2402.10178](https://www.alphaxiv.org/abs/2402.10178).
- **arXiv:** [2402.10178](https://arxiv.org/abs/2402.10178).
- **Formal publication page:** [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0893608025000796).

### Method

TDAG begins with a main agent that decomposes a complex task into a sequence of subtasks.
These subtasks are not generated once and then kept unchanged.
After each subtask finishes, the main agent uses the actual result to revise the tasks that have not yet run.
This design aims to reduce the risk that an early error propagates forward and invalidates an entire fixed plan.

Each subtask receives a dedicated subagent generated dynamically through an LLM prompt.
The subagent receives tool documentation reorganized for that specific subtask.
After successful execution, the subagent summarizes its execution method as a skill and submits it to a skill library.
Later tasks use SentenceBERT to retrieve the most relevant skill, while another agent continuously updates the library and removes duplicate skills.

### Experimental Evidence

- TDAG achieves an average score of 49.08 on ItineraryBench.
- ADAPT achieves an average score of 44.74 in the same comparison.
- Removing agent generation lowers the average score to 46.69.
- Removing dynamic decomposition lowers the average score to 46.23.
- TDAG also outperforms the comparison methods used by the paper on WebShop and TextCraft.
- The paper does not report token consumption, API cost, or wall-clock latency.

### Coding-Agent Implementation Recommendations

- Let an orchestrator create the initial issue checklist, but allow it to rewrite steps that have not run after every verification result.
- Give each subagent only its current subtask, required upstream artifacts, and relevant tools.
- Treat build, test, typecheck, or runtime smoke results as replanning signals.
- When an intermediate assumption fails, rebuild downstream tasks instead of continuing with a plan known to be stale.
- Store repair methods that pass tests as retrievable skills.
- Do not write untested results or results that only the model itself declares successful into a permanent skill library.
- Restrict skill content to reusable operational patterns, preconditions, commands, and verification methods.

### Limitations

- The primary experiments use GPT-3.5-turbo-16k.
- The core benchmark is a controlled travel-planning simulator rather than a large software repository.
- In the WebShop and TextCraft experiments, the authors do not use dynamic agent generation because tool documentation is unavailable or the tasks are too monotonous.
- Skill correctness cannot be guaranteed as directly by the environment as executable program correctness can.
- The system still exhibits commonsense errors, external-information misalignment, hallucinations, and constraint violations.
- The paper's workflow executes subtasks primarily in sequence, so it does not show that dynamic decomposition can reduce coding-agent wall-clock latency.

## 2. MasRouter

### Publication Metadata

- **Title:** *MasRouter: Learning to Route LLMs for Multi-Agent Systems*.
- **Authors:** Yanwei Yue, Guibin Zhang, Boyang Liu, Guancheng Wan, Kun Wang, Dawei Cheng, and Yiyan Qi.
- **Year:** 2025.
- **Publication status:** Formally peer-reviewed long conference paper, not a journal article.
- **Venue:** ACL 2025, Volume 1: Long Papers, pages 15549–15572.
- **DOI:** [10.18653/v1/2025.acl-long.757](https://doi.org/10.18653/v1/2025.acl-long.757).
- **AlphaXiv:** [2502.11133](https://www.alphaxiv.org/abs/2502.11133).
- **arXiv:** [2502.11133](https://arxiv.org/abs/2502.11133).
- **Formal publication page:** [ACL Anthology](https://aclanthology.org/2025.acl-long.757/).

### Method

MasRouter divides multi-agent routing into three dependent decision stages covering collaboration mode, roles, and LLMs.
The collaboration-mode determiner uses a variational latent-variable model to choose among candidate modes such as chain, reflection, self-consistency, and debate.
The system dynamically determines the number of agents from input complexity, with a maximum of six agents in the experiments.
The role allocator uses the input, collaboration mode, and previously selected roles to construct a mutually compatible sequence of roles.
The LLM router then assigns different models to different agents according to the task, collaboration mode, and roles.

The complete cascaded controller is trained with policy gradient.
The optimization objective includes both correctness utility and penalties for LLM calls, API cost, or token cost.
The cost weight controls how much additional spending the system will accept in exchange for higher result quality.

### Experimental Evidence

- The paper reports that HumanEval cost decreases from USD 0.363 to USD 0.185.
- The abstract reports an overhead reduction of up to 52.07% relative to comparison methods.
- Cost decreases by 17.21%–28.17% when MasRouter is integrated with existing multi-agent methods.
- On MBPP, MasRouter outperforms AgentPrune and AFlow by 8.20 and 1.80 percentage points, respectively.
- Increasing the maximum number of agents from six to ten yields only a small performance gain but increases per-query inference cost by approximately 1.5 times.
- The paper does not report complete wall-clock latency.

### Coding-Agent Implementation Recommendations

- Start with a lightweight classifier that decides whether a request needs a subagent instead of launching the same team for every task.
- Form teams on demand from a role pool such as repository researcher, planner, implementer, reviewer, and tester.
- Keep simple documentation or single-file changes on one low-cost model.
- Add reviewers and testers only for cross-module refactors, unknown APIs, or high-risk changes.
- Use models with different prices or capabilities for research, implementation, testing, and summarization roles.
- Treat sequential, parallel, review-loop, and debate structures as workflow topologies that can be routed.
- Before formally training a router, use interpretable rules to establish complexity, risk, and uncertainty thresholds.
- Include the quality-cost Pareto frontier in routing regression tests.

### Limitations

- Collaboration modes, roles, and models all come from predefined candidate pools.
- The controller requires training data with oracle answers or a computable utility.
- Policy-gradient search itself introduces additional model calls and training cost.
- The experimental benchmarks mainly cover general reasoning, mathematics, and function-level code generation.
- The paper does not evaluate file localization, merge conflicts, or long-running builds in mature repositories.
- The experiments use at most six agents, so they do not demonstrate scalability to large teams.
- Existing routers may require recalibration after model prices, API behavior, or model capabilities change.

## 3. DynTaskMAS

### Publication Metadata

- **Title:** *DynTaskMAS: A Dynamic Task Graph-driven Framework for Asynchronous and Parallel LLM-based Multi-Agent Systems*.
- **Authors:** Junwei Yu, Yepeng Ding, and Hiroyuki Sato.
- **Year:** 2025.
- **Publication status:** Formally peer-reviewed conference paper, not a journal article.
- **Venue:** ICAPS 2025, Algorithmic Papers, pages 288–296.
- **DOI:** [10.1609/icaps.v35i1.36130](https://doi.org/10.1609/icaps.v35i1.36130).
- **AlphaXiv:** [2503.07675](https://www.alphaxiv.org/abs/2503.07675).
- **arXiv:** [2503.07675](https://arxiv.org/abs/2503.07675).
- **Formal publication page:** [ICAPS Proceedings](https://ojs.aaai.org/index.php/ICAPS/article/view/36130).

### Method

DynTaskMAS consists of a Dynamic Task Graph Generator, an Asynchronous Parallel Execution Engine, a Semantic-Aware Context Management System, and an Adaptive Workflow Manager.
The Task Graph Generator decomposes tasks into a DAG with dependencies and updates the DAG when inputs or execution state change.
Each edge weight accounts for downstream computational complexity and context-transfer time.

The Parallel Execution Engine schedules only dependency-ready nodes.
Its priority queue considers computational cost, downstream paths, and current load.
The agent-pool manager then assigns nodes to available agents according to capability and load.

The context manager uses semantic relevance to determine which information to send to which agents.
The workflow manager continuously observes throughput, latency, agent utilization, and task completion, then adjusts workflow and resource allocation.

### Experimental Evidence

- Relative to the serial baseline, simple-task execution time decreases from 4.7 seconds to 3.7 seconds, an improvement of 21.3%.
- Medium-task execution time decreases from 9.8 seconds to 7.1 seconds, an improvement of 27.6%.
- Complex-task execution time decreases from 18.5 seconds to 12.4 seconds, an improvement of 33.0%.
- GPU utilization increases from 65% to 88%.
- Throughput with four agents is 12.3 tasks per second.
- Throughput with sixteen agents is 42.7 tasks per second, a relative increase of 3.47 times.
- Latency with thirty-two agents is 104.2 ms, compared with 81.3 ms with four agents.
- At thirty-two agents, marginal benefits have already declined because of shared-context and scheduler contention.

### Coding-Agent Implementation Recommendations

- Represent independent work such as repository search, documentation verification, API-type confirmation, and test preparation as parallelizable DAG nodes.
- Explicitly record dependencies among implementation, build, test, review, and final integration.
- Require each node to declare its inputs, outputs, resource class, deadline, retry policy, and cancellation owner.
- Add a node to the ready queue only after every required upstream node has succeeded and been revalidated.
- Prioritize critical-path work that blocks multiple downstream tasks.
- Limit concurrency to avoid API rate limits, test interference, filesystem contention, or build-cache contamination.
- Pass only required artifacts, conclusions, and provenance instead of copying every agent conversation in full.
- An agent failure should explicitly mark the node as failed and trigger replanning rather than leaving the entire workflow waiting indefinitely.

### Limitations

- The experiments use only Llama-3.1-8B, TensorRT-LLM, and four RTX 3090 GPUs.
- The main case is a controlled travel-planning system rather than repository-level coding.
- The primary latency comparison is against serial processing and does not cover multiple mature multi-agent runtimes.
- The paper does not provide validation across models, hardware platforms, or remote-API latency conditions.
- The paper does not provide a code-quality, test-pass-rate, or repository-correctness benchmark.
- As more agents are added, shared-context and scheduler overhead reduce scaling efficiency.
- Context relevance, complexity estimation, and task granularity all require additional implementation before they can work reliably in a real coding agent.

## 4. AgentPrune

### Publication Metadata

- **Title:** *Cut the Crap: An Economical Communication Pipeline for LLM-based Multi-Agent Systems*.
- **Method name:** AgentPrune.
- **Authors:** Guibin Zhang, Yanwei Yue, Zhixun Li, Sukwon Yun, Guancheng Wan, Kun Wang, Dawei Cheng, Jeffrey Yu, and Tianlong Chen.
- **Author-name note:** The AlphaXiv PDF renders Jeffrey Yu as Jeffrey Xu Yu.
- **Year:** 2025.
- **Publication status:** Formally peer-reviewed conference paper, not a journal article.
- **Venue:** ICLR 2025.
- **DOI:** The official ICLR proceedings do not list a DOI, so this research does not present the arXiv DOI as a conference DOI.
- **AlphaXiv:** [2410.02506](https://www.alphaxiv.org/abs/2410.02506).
- **arXiv:** [2410.02506](https://arxiv.org/abs/2410.02506).
- **Formal publication page:** [ICLR Proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html).

### Method

AgentPrune represents multi-agent communication as a spatial-temporal message graph.
Spatial edges represent agent-to-agent messages within the same round.
Temporal edges represent whether messages from an earlier round are passed into the next round.

The system first converts the original binary edges into learnable continuous graph masks.
Policy gradient makes the retained communication structure improve task utility.
Low-rank regularization encourages sparse graph masks and reduces redundancy.
After several optimization rounds, the system uses one-shot magnitude pruning to retain the most important edges.
The resulting sparse topology remains fixed during subsequent rounds.

### Experimental Evidence

- The paper reports that AgentPrune costs approximately USD 5.6 at comparable quality, while comparison topologies cost approximately USD 43.7.
- Token consumption decreases by 28.1%–72.8% after integration with existing multi-agent frameworks.
- Randomly removing some communication edges sometimes improves performance, supporting the hypothesis that existing topologies contain communication redundancy.
- The experiments include MMLU, GSM8K, MultiArith, SVAMP, AQuA, and HumanEval.
- The paper does not provide sufficiently complete measurements to determine production wall-clock latency.

### Coding-Agent Implementation Recommendations

- First record which agent messages actually change downstream patches, test results, or decisions.
- Send only patches, test-failure summaries, API contracts, unresolved questions, or required provenance to relevant roles.
- Avoid making every agent read the complete transcripts of every other agent.
- Treat communication as a directed edge with token, latency, and attention costs.
- Use a fixed regression suite to determine whether removing an edge preserves success rate.
- Learn or configure communication policy separately for each workflow or task class.
- Start with an interpretable artifact allowlist before considering automatic pruning with policy gradient.
- Make the context budget and maximum payload per edge part of the runtime contract.

### Limitations

- The authors explicitly state that the method generally requires more than three agents.
- The original communication topology must be complex enough to contain redundancy worth pruning.
- Simple chain or direct-output workflows are not applicable.
- Before pruning, the method still incurs model-interaction, utility-evaluation, and graph-mask optimization costs.
- The topology is fixed after pruning, so it may fail to retain necessary information when the task distribution changes.
- The experiments mainly cover general reasoning, mathematics, and function-level code generation.
- The paper does not evaluate the transfer requirements of repository-level artifacts, separate sessions, or mutable filesystem state.

## 5. GPTSwarm

### Publication Metadata

- **Title:** *GPTSwarm: Language Agents as Optimizable Graphs*.
- **Authors:** Mingchen Zhuge, Wenyi Wang, Louis Kirsch, Francesco Faccio, Dmitrii Khizbullin, and Jürgen Schmidhuber.
- **Year:** 2024.
- **Publication status:** Formally peer-reviewed conference paper and ICML Oral, but not a journal article.
- **Venue:** ICML 2024, PMLR 235, pages 62743–62767.
- **DOI:** The official PMLR page does not list a DOI, so this research does not present the arXiv DOI as an ICML DOI.
- **AlphaXiv:** [2402.16823](https://www.alphaxiv.org/abs/2402.16823).
- **arXiv:** [2402.16823](https://arxiv.org/abs/2402.16823).
- **Formal publication page:** [PMLR](https://proceedings.mlr.press/v235/zhuge24a.html).
- **Conference status:** [ICML Oral](https://icml.cc/virtual/2024/oral/35447).

### Method

GPTSwarm represents LLM calls, tools, functions, and other operations as graph nodes.
A single agent is a directed acyclic graph composed of multiple nodes.
Multiple agents form a composite graph, and cross-agent edges represent communication and collaboration.

Node optimization uses existing prompt-optimization methods to improve each node's prompt.
Edge optimization uses REINFORCE to sample candidate graph connectivity and adjust edge probabilities according to task utility.
This representation can combine existing Chain-of-Thought, Tree-of-Thought, Reflection, and other workflow components.

### Experimental Evidence

- In one MMLU comparison, GPTSwarm optimization costs approximately USD 5.32 and inference costs approximately USD 1.82.
- In the same comparison, DyLAN optimization costs approximately USD 105.93 and inference costs approximately USD 14.99.
- Mini Crosswords edge optimization uses more than fifty million prompt tokens and costs USD 77.42.
- On GAIA, a single ToT takes approximately 71.31 seconds, while a three-agent ToT takes approximately 198.50 seconds.
- On GAIA, a seven-agent ToT takes approximately 414.89 seconds.
- These results show that graph optimization can improve quality or find a better topology, but multi-agent execution is not inherently a low-latency approach.

### Coding-Agent Implementation Recommendations

- Represent search, edit, build, test, review, and final synthesis as testable nodes with explicit inputs and outputs.
- Use benchmark repositories, historical issues, or synthetic tasks as an offline workflow-evaluation set.
- Search for the edge, role, prompt, and tool combinations that pass the same tests at lower cost.
- Fix a repeatedly validated successful DAG as the production workflow.
- Do not perform expensive graph search again for every user request.
- Separate node optimization from edge optimization so the source of improvement can be attributed to prompts or orchestration.
- Calculate optimization cost together with the amortization horizon.
- Revalidate a fixed graph for a new repository, model, or tool version.

### Limitations

- Graph search and node optimization can consume far more tokens and money than one production inference.
- Dense or large graphs increase computational and communication cost.
- The primary experiments use older GPT-3.5-Turbo and GPT-4-Turbo APIs.
- Different benchmarks use different graphs and aggregation logic, so there is no single universally optimal topology.
- The GAIA results show that adding agents can substantially increase wall-clock time.
- The authors state that communication efficiency and system robustness become major challenges beyond one hundred agents.
- The paper does not evaluate branch isolation, merge conflicts, or concurrent edits in mature repositories.

## Integrated Design Recommendations

These five papers do not jointly establish one best multi-agent topology.
A more reliable implementation approach is to treat them as complementary parts of a four-layer control problem.

### 1. Admission and Routing

- First determine whether the task actually needs a subagent.
- Include task complexity, cross-module scope, unknown APIs, verification cost, and risk in the admission decision.
- Keep simple tasks on one agent to avoid fixed coordination costs.
- Select the number of agents, roles, models, and collaboration mode on demand only for complex tasks.

### 2. Dynamic Task DAG

- Decompose the task into a DAG with dependencies and verification conditions.
- Run only nodes whose dependencies are complete.
- Revalidate the unexecuted plan after every subagent, tool, or test completes.
- Intermediate failures should update the DAG instead of only retrying the same prompt.

### 3. Artifact and Context Protocol

- Require each agent to produce a structured artifact instead of only a natural-language status report.
- Artifacts should include results, evidence, unresolved questions, sources, and scope of applicability.
- Downstream agents should receive only the artifacts required for their current tasks.
- Raw transcripts, complete repository context, and unrelated agent outputs should not be broadcast by default.

### 4. Cost, Latency, and Quality Control

- Track task success, test results, tokens, API cost, wall-clock latency, and retry count together.
- Parallelize only work that has no shared mutable state or that can be isolated explicitly.
- Beyond the concurrency sweet spot, new agents can create negative effects through context, scheduler, rate-limit, or filesystem contention.
- Learned routing, graph search, or pruning must amortize training cost across the expected number of uses.
- Every automatically optimized workflow must pass a fixed regression suite.

## Recommended Coding-Agent Workflow

1. Use a low-cost admission router to decide whether to start a multi-agent workflow.
2. When needed, use a TDAG-style planner to create a revisable task DAG.
3. Apply MasRouter principles to select agent count, roles, models, and collaboration mode.
4. Apply DynTaskMAS principles to run only dependency-ready nodes in parallel.
5. Apply AgentPrune principles to constrain the content and token budget of each communication edge.
6. Use tests, typecheck, lint, runtime smoke tests, and review findings to calculate node utility.
7. Use GPTSwarm-style offline search only for high-frequency, expensive workflows that can be evaluated repeatedly.
8. After every wait completes, revalidate the session, branch, artifact, mutable state, and whether the original plan remains valid.
9. Stop expanding the team when another agent no longer improves the critical path, quality, or risk.
10. Version validated workflows and reevaluate them when models, tools, or repository structure change.

## Research Conclusion

Useful dynamic behavior is not limited to creating more agents at runtime.
It also includes redecomposing tasks, selecting roles and models on demand, adjusting the DAG, stopping low-value agents, and removing ineffective messages.

Task decomposition and verification should take priority over role-play.
Explicit dependencies and an artifact protocol should take priority over unrestricted agent conversation.
Cost routing and communication pruning can reduce tokens but may add training or optimization cost.
An asynchronous DAG can reduce wall-clock time, but only when work can be parallelized safely and resources are not saturated.
More agents do not necessarily produce lower latency, lower cost, or higher quality.

The most practical current coding-agent design is a small, on-demand, replannable team of specialized roles.
This team should share compact global state, use isolated local contexts, transfer verifiable artifacts, and control integration and stopping conditions through executable checks.

## AlphaXiv MCP Search Evidence

This research actually used the AlphaXiv MCP tools `discover_papers`, `get_paper_content`, and `answer_pdf_queries`.

### First Discovery Search

The first search prioritized the newest work from 2024–2026.

```yaml
tool: mcp__alphaxiv__discover_papers
difficulty: 10
prioritize: recency
published_after: 2024-01-01
published_before: 2026-08-10
keywords:
  - AI
  - LLM
  - subagent
  - multi-agent
  - task decomposition
  - role assignment
  - routing
  - dynamic team
  - cost
  - latency
question: >-
  Recent AI/LLM subagent multi-agent methods, focusing on task decomposition,
  role specialization, routing, dynamic team formation, cost, and latency;
  prioritize well-known peer-reviewed journals, and label top conferences or
  arXiv-only work accurately
```

The leading results from the first search were as follows.

```text
2606.31174  ClawArena-Team: Benchmarking Subagent Orchestration and Dynamic Workflows in Language-Model Agents
2607.22465  TRACE-ROUTER: Task-Consistent and Adaptive Online Routing for Agentic AI
2607.25446  Toward an Organizational Science of Multi-Agent LLM Systems
2606.20629  Specialize Roles, Mix Deployments: Pushing the Cost-Accuracy Frontier of LLM Agent Teams
2606.12950  Maestro: Workload-Aware Cross-Cluster Scheduling for LLM-Based Multi-Agent Systems
2606.11440  INFRAMIND: Infrastructure-Aware Multi-Agent Orchestration
```

These results are primarily new 2026 preprints.
To avoid treating the newest preprints as the strongest formal evidence, this research did not select papers by recency alone.

### Second Search for Mature Work

The second search instead prioritized mature work from 2024–2025 that might already have a formal venue.

```yaml
tool: mcp__alphaxiv__discover_papers
difficulty: 10
prioritize: historical
published_after: 2024-01-01
published_before: 2025-12-31
keywords:
  - LLM
  - subagent
  - multi-agent
  - task decomposition
  - role assignment
  - routing
  - dynamic team
  - cost
  - latency
question: >-
  AI/LLM subagent multi-agent methods, focusing on task decomposition, role
  specialization, routing, dynamic team formation, cost, and latency; find
  representative 2024–2025 methods that are mature and have peer-reviewed venues
```

The leading results from the second search were as follows.

```text
2512.11426  AgentBalance: Backbone-then-Topology Design for Cost-Effective Multi-Agent Systems under Budget Constraints
2502.11133  MasRouter: Learning to Route LLMs for Multi-Agent Systems
2508.04903  RCR-Router: Efficient Role-Aware Context Routing for Multi-Agent LLM Systems with Structured Memory
2503.07675  DynTaskMAS: A Dynamic Task Graph-driven Framework for Asynchronous and Parallel LLM-based Multi-Agent Systems
2402.10178  TDAG: A Multi-Agent Framework based on Dynamic Task Decomposition and Agent Generation
2511.01149  Modular Task Decomposition and Dynamic Collaboration in Multi-Agent Systems Driven by Large Language Models
2504.02051  Self-Resource Allocation in Multi-Agent LLM Systems
```

### Papers Actually Read

The following papers were actually read through the AlphaXiv MCP `get_paper_content` or `answer_pdf_queries` tools.

```text
2402.10178  TDAG
2502.11133  MasRouter
2503.07675  DynTaskMAS
2410.02506  AgentPrune
2402.16823  GPTSwarm
```

Queries for each paper covered methods, task decomposition, roles, routing, dynamic teams, token or monetary cost, latency, limitations, and whether the PDF stated a venue or DOI.
AlphaXiv PDFs or reports were used to verify paper methods, numerical results, and author-stated limitations.
Formal publication status, venue, and DOI were verified against official pages from Neural Networks, ACL Anthology, ICLR, PMLR, ICML, and ICAPS.

## Sources

- [TDAG on AlphaXiv](https://www.alphaxiv.org/abs/2402.10178).
- [TDAG in Neural Networks](https://www.sciencedirect.com/science/article/pii/S0893608025000796).
- [MasRouter on AlphaXiv](https://www.alphaxiv.org/abs/2502.11133).
- [MasRouter in ACL Anthology](https://aclanthology.org/2025.acl-long.757/).
- [DynTaskMAS on AlphaXiv](https://www.alphaxiv.org/abs/2503.07675).
- [DynTaskMAS in ICAPS Proceedings](https://ojs.aaai.org/index.php/ICAPS/article/view/36130).
- [AgentPrune on AlphaXiv](https://www.alphaxiv.org/abs/2410.02506).
- [AgentPrune in ICLR Proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html).
- [GPTSwarm on AlphaXiv](https://www.alphaxiv.org/abs/2402.16823).
- [GPTSwarm in PMLR](https://proceedings.mlr.press/v235/zhuge24a.html).
- [GPTSwarm at ICML 2024](https://icml.cc/virtual/2024/oral/35447).
