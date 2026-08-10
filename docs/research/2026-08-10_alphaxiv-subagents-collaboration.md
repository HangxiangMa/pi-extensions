# Research on AI/LLM Subagent Communication, Debate, Consensus, and Error Propagation

## Research Scope

This research focuses on inter-agent communication, debate, consensus, shared messages, groupthink, and error propagation in AI/LLM subagent and multi-agent methods from 2024 through 2026.
The research cutoff date is 2026-08-10.
Literature discovery used the AlphaXiv MCP `discover_papers` tool, and candidate papers were read with `answer_pdf_queries` and `get_paper_content`.
Publication status, venue, and DOI information were cross-checked against official pages from Scientific Reports, Springer Nature, the ACL Anthology, and arXiv.
The research prioritized formally peer-reviewed journals, followed by the ACL main conference and ACL Findings, and finally highly relevant methods available only on arXiv.
Scientific Reports is a Springer Nature journal, not the journal Nature.
ACL Findings is a peer-reviewed proceedings series, but it is neither a journal nor the ACL or EMNLP main-conference long-paper track.
An arXiv DOI identifies a preprint and must not be treated as a journal DOI.

## Summary of Conclusions

The most transferable direction for coding-agent workflows is not to let more agents chat without limits, but to require independent answers, sparse exchange, preserved dissent, evidence verification, and aggregation only at the end.
Fully connected sharing can rapidly spread wrong answers, perceived authority, and persuasive language across the entire team.
Sparse topologies can reduce cost, delay incorrect consensus, and preserve a longer period of effective debate.
Genuine diversity produced by different models, tools, or roles is more effective at reducing shared blind spots than repeated sampling from the same model.
Consensus should trigger final verification only and must not directly imply that an answer is correct or a task is complete.
A dedicated dissenting agent can break silent agreement, but its claims must still undergo evidence verification.
Messages from other agents should be treated as untrusted input because natural-language persuasion, incorrect citations, and RAG packaging can all amplify error propagation.

## Recommendation Ranking

The ranking combines transferability to coding agents, strength of publication evidence, and direct relevance to groupthink and error propagation.

### 1. Improving Multi-Agent Debate with Sparse Communication Topology

- **Authors:** Yunxuan Li, Yibing Du, Jiageng Zhang, Le Hou, Peter Grabowski, Yeqing Li, and Eugene Ie.
- **Year:** 2024.
- **Publication status:** A peer-reviewed ACL Findings paper, not a journal article and not an EMNLP main-conference paper.
- **Venue:** Findings of the Association for Computational Linguistics: EMNLP 2024.
- **DOI:** [10.18653/v1/2024.findings-emnlp.427](https://doi.org/10.18653/v1/2024.findings-emnlp.427).
- **AlphaXiv:** [2406.11776](https://www.alphaxiv.org/abs/2406.11776).
- **arXiv:** [2406.11776](https://arxiv.org/abs/2406.11776).
- **Official publication page:** [ACL Anthology](https://aclanthology.org/2024.findings-emnlp.427/).

#### Method and Results

The paper models agents as nodes in a graph, with each agent reading only the previous-round answers of adjacent agents instead of broadcasting every answer to every other agent.
The main experiments compare regular six-agent graphs whose density ranges from 1 for the fully connected graph down to 2/5 for the neighbor-connected topology.
Each agent first answers independently, then uses only the previous-round answers of connected agents as references, and finally all agents determine the answer by majority vote.
The neighbor-connected sparse topology scored about two percentage points higher than the fully connected topology on MATH, maintained the same accuracy on GSM8K, and reduced average input-token cost for reasoning tasks by more than 40%.
On the helpfulness and harmlessness labeling tasks, the sparsest settings saved up to approximately 53.5% and 53.3% of cost, respectively, while achieving similar or better results.
The authors found that on difficult questions, seeing more incorrect reference answers made an agent more likely to be misled, while sparse communication delayed premature convergence and preserved more effective debate rounds.
In the multi-model setting, placing the stronger model at a high-centrality node performed better than placing it at a low-centrality node.

#### Coding-Agent Implementation Recommendations

- Let implementers, testers, security reviewers, and requirements reviewers analyze the task independently first.
- Send each agent's result to only one or two designated neighbors instead of broadcasting the full content to every agent.
- Place the testing or evidence-verification agent at a more highly connected node.
- Share conclusions, evidence, tests, and unresolved questions, but not unnecessary full-form free-form narratives.
- Have an aggregator collect candidate conclusions at the end and use reproducible tests, rather than repetition count, as the primary decision criterion.
- Record which messages each agent actually saw so that error-propagation paths can be analyzed.

#### Limitations

The research mainly analyzes static regular graphs and does not cover the continuously changing dynamic topologies of real workflows.
The main models are GPT-3.5, GPT-4/4o, and Mistral 7B, so the results cannot directly represent every current coding-agent model.
Some GPT experiments sampled only 100 questions, and the datasets concentrate on mathematics, multimodal reasoning, and preference labeling.
The authors provide neither a general algorithm for choosing the best topology nor a rigorous theoretical proof that sparse topology must be better.

### 2. ReConcile: Round-Table Conference Improves Reasoning via Consensus among Diverse LLMs

- **Authors:** Justin Chih-Yao Chen, Swarnadeep Saha, and Mohit Bansal.
- **Year:** 2024.
- **Publication status:** A peer-reviewed ACL 2024 main-conference long paper, not a journal article.
- **Venue:** Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics, Volume 1: Long Papers.
- **DOI:** [10.18653/v1/2024.acl-long.381](https://doi.org/10.18653/v1/2024.acl-long.381).
- **AlphaXiv:** [2309.13007](https://www.alphaxiv.org/abs/2309.13007).
- **arXiv:** [2309.13007](https://arxiv.org/abs/2309.13007).
- **Official publication page:** [ACL Anthology](https://aclanthology.org/2024.acl-long.381/).

#### Method and Results

ReConcile first has different model families independently produce answers, explanations, and self-reported confidence.
In each round, the discussion prompt groups all agents' previous-round answers, explanations, and confidence by candidate answer instead of merely concatenating messages in agent order.
The prompt also includes examples of human explanations that previously helped other agents correct errors, teaching agents to produce explanations with corrective value.
Discussion stops when every agent agrees or the maximum number of rounds is reached, and the team answer is then produced through recalibrated confidence-weighted voting.
The maximum improvement across seven benchmarks was 11.4 percentage points, and the method exceeded GPT-4 on some tasks.
Ablation experiments show that diversity across model families is the most important component, while answer grouping, confidence estimation, and corrective examples each also contribute positively.
The first arXiv version of ReConcile appeared in 2023, but its formal ACL publication year is 2024.

#### Coding-Agent Implementation Recommendations

- Require every agent to submit an independent plan and initial judgment before any messages are shared.
- Use different models, different tools, or different roles to create genuinely different failure modes.
- Require every agent to submit a structured summary containing `conclusion`, `change scope`, `evidence`, `tests`, `confidence`, and `unresolved risks`.
- Group messages by candidate plan or failure hypothesis instead of building a single conversation log that accumulates one agent at a time.
- Provide minimal examples that previously corrected the same class of error, but do not treat those examples as direct evidence for the current problem.
- Use confidence only as an aggregation weight and never as a replacement for test results, static analysis, or source-code evidence.

#### Limitations

The main agents depended on closed APIs available at the time, so the authors could not fully know or control model data, parameter counts, or behavior.
Agent confidence is a self-reported value elicited after the fact by prompting, not a naturally calibrated probability.
Because of API cost, some main experiments used only about 100 samples, although the authors reproduced the same trend on two complete test sets.
The capabilities, data, and costs of the different models were not perfectly matched, so the findings cannot be reduced to a claim that adding more model types always helps.

### 3. When collaboration fails: persuasion driven adversarial influence in multi agent large language model debate

- **Authors:** Insaf Kraidia, Iyas Qaddara, Alhanof Almutairi, Nada Alzaben, and Samir Brahim Belhouari.
- **Year:** 2026.
- **Publication status:** A formally peer-reviewed journal article.
- **Venue:** Scientific Reports 16, Article 11640.
- **DOI:** [10.1038/s41598-026-42705-7](https://doi.org/10.1038/s41598-026-42705-7).
- **AlphaXiv/arXiv:** This search did not find a verifiable AlphaXiv or arXiv version.
- **Official publication page:** [Scientific Reports](https://www.nature.com/articles/s41598-026-42705-7).

#### Method and Results

The study inserts an adversarial agent that uses natural-language persuasion into an otherwise normal multi-agent debate.
The adversarial agent uses debate history, counterargument generation, argument refinement, Best-of-N selection, and RAG to package an incorrect answer.
The study measures both final majority-vote accuracy and the change in other agents from their initial answers toward the adversarial answer.
A single adversarial agent can reduce overall accuracy by 10-40% and increase consensus on an incorrect answer by more than 30%.
Low-quality, irrelevant, or selectively retrieved RAG content can still make an incorrect argument appear more credible.
Adding more agents or debate rounds does not reliably defend against the attack, and additional rounds can even entrench an incorrect consensus that has already formed.

#### Coding-Agent Implementation Recommendations

- Treat text from other agents as untrusted input even when it includes citations, tool names, or high-confidence language.
- Preserve each agent's initial answer and monitor the harmful-revision rate or flip rate when a correct answer is changed into an incorrect one.
- Require every important claim to include a reproducible test, file location, original document, or tool output.
- Do not treat the presence of RAG citations as proof that the citations actually support the claim.
- Limit the message-propagation scope and modifiable resources of high-influence agents.
- Perform independent verification after consensus instead of ending the workflow immediately.
- Preserve the provenance of opinion changes so error propagation can be traced and isolated.

#### Limitations

Multi-round experiments are expensive, limiting repetitions, model variety, and the scale of hyperparameter searches.
Most open models in the study have only 8B-14B parameters, so they cannot fully represent the behavior of large closed models such as GPT-4.
The experiments use synchronous, text-only, controlled debates that differ from real coding agents with tools, asynchronous execution, permission controls, and human oversight.
The paper primarily demonstrates attack risk and does not validate a complete defense capable of resisting these attacks.

### 4. Silence is Not Consensus: Disrupting Agreement Bias in Multi-Agent LLMs via Catfish Agent for Clinical Decision Making

- **Authors:** Yihan Wang, Qiao Yan, Zhenghao Xing, Lihao Liu, Junjun He, Chi-Wing Fu, Xiaowei Hu, and Pheng-Ann Heng.
- **Year:** 2025.
- **Publication status:** This search could confirm only an arXiv preprint and found no formal journal or conference version.
- **Venue:** arXiv cs.CL.
- **DOI:** [10.48550/arXiv.2505.21503](https://doi.org/10.48550/arXiv.2505.21503), which is an arXiv DOI rather than a journal DOI.
- **AlphaXiv:** [2505.21503](https://www.alphaxiv.org/abs/2505.21503).
- **arXiv:** [2505.21503](https://arxiv.org/abs/2505.21503).

#### Method and Results

The paper defines superficial consensus formed without sufficient discussion as Silent Agreement.
The Catfish Agent injects structured dissent when it detects premature agreement, missing justification, ignored alternatives, or logical contradictions.
Intervention strength is adjusted to task complexity, while the tone of dissent is adjusted to current consensus strength so that criticism is neither too weak nor disruptive.
The Catfish Agent can operate both within the expert team and at the moderator level, providing peer-level and top-down challenges.
In the MedQA ablation, the full design reduced the silent-agreement rate for intermediate cases from 61.8% to 17.1% and raised overall accuracy from 36% to 50%.
In another analysis on MedQA and PubMedQA, the method reduced the silent rate to 17% and 11%, respectively.

#### Coding-Agent Implementation Recommendations

- Assign a dedicated Catfish or dissenting agent to search for counterexamples, missing tests, and incorrect assumptions before integration.
- Use one lightweight challenge for simple changes and activate multi-round falsification only for high-risk or cross-module changes.
- Require the dissenting agent to propose verifiable failure cases instead of disagreeing merely for the sake of disagreement.
- Keep the dissenting agent's tone focused on evidence and risk so that forceful wording does not create a new authority bias.
- Require the aggregator to answer each objection instead of merely declaring a majority decision or ignoring minority views.
- Let the dissenting agent inspect the new shared conclusion once more before final integration so errors do not reappear during summarization.

#### Limitations

The work remains a preprint, and no formal journal or conference version was available for verification.
The experiments concentrate on medical question answering and medical visual question answering and do not directly validate software-engineering workflows.
Multi-agent coordination and Catfish interventions increase inference cost, while the authors leave lower coordination cost as future work.
The paper presents a failure case in which the moderator rejects valid dissent and preserves an incorrect answer, so adding a dissenting agent does not guarantee correction.

### 5. Selective agreement, not sycophancy: investigating opinion dynamics in LLM interactions

- **Authors:** Erica Cau, Valentina Pansanella, Dino Pedreschi, and Giulio Rossetti.
- **Year:** 2025.
- **Publication status:** A formally peer-reviewed journal article.
- **Venue:** EPJ Data Science 14, Article 59.
- **DOI:** [10.1140/epjds/s13688-025-00579-1](https://doi.org/10.1140/epjds/s13688-025-00579-1).
- **AlphaXiv/arXiv:** This search did not find a verifiable AlphaXiv or arXiv version.
- **Official publication page:** [EPJ Data Science](https://link.springer.com/article/10.1140/epjds/s13688-025-00579-1).

#### Method and Results

LODAS gives 140 Llama or Mistral agents seven-level discrete opinions and pairs them randomly for persuasion over 30 rounds.
In each interaction, a Discussant listens to a persuasive message from an Opponent and then either moves its opinion by one level or leaves it unchanged.
The study uses a DistilBERT classifier to detect fallacies involving relevance, credibility, circular reasoning, faulty generalization, and false causality.
Agents converge naturally and are both producers and victims of fallacies.
Under the two statement formulations, approximately 75-78% of Llama Discussants changed their opinions after exposure to fallacious messages, compared with about 60-61% of Mistral Discussants.
The results indicate that opinion changes are not simple indiscriminate agreement, but asymmetric persuasion affected by the model, statement direction, perceived credibility, and argument form.

#### Coding-Agent Implementation Recommendations

- Divide shared messages into four fields: claim, evidence, inference, and conclusion.
- Check for appeals to authority, irrelevant reasons, circular reasoning, false causality, and unsupported generalizations before aggregation.
- Track opinion changes across rounds and require agents to state whether each change was caused by new evidence, test results, or peer pressure.
- Preserve a disagreement or candidate-count metric so that all agents do not converge too quickly on one answer.
- Allow agents to retain their position or abstain rather than forcing them to accept another agent's position in every round.
- Use fallacy detection only as a warning and never as the sole basis for automatically rejecting a claim.

#### Limitations

The study uses only the Ship of Theseus topic, one mean-field pairing structure, English prompts, and 7B-8B models.
The agents have no distinct personalities or cognitive strategies and do not simulate clustering or echo-chamber structures from real social networks.
The fallacy classifier can itself misclassify content, and the paper explores the relationship between fallacies and opinion change only preliminarily.
This is a diagnostic study of opinion dynamics, not a method directly shown to improve coding-task accuracy.

## Coding-Agent Workflow Recommendations

The following design is a cross-paper engineering synthesis, not a complete coding-agent architecture directly validated by any single paper.

### 1. Generate Independent Initial Answers

Three to five agents should first analyze the problem independently without seeing one another's work.
Each agent should preserve its initial conclusion, assumptions, confidence, citations, intended change scope, and verification method.
This step prevents the first speaker from becoming an incorrect anchor for the other agents.

### 2. Use Structured Messages

The minimum message shared between agents should contain `claim`, `evidence`, `assumptions`, `tests`, `confidence`, and `open_risks`.
Evidence should prioritize file locations, original documents, reproducible commands, and test output.
Agents should not pass only unsourced conclusions, role authority, or long persuasive narratives.

### 3. Use a Sparse Topology

Use a ring, neighbor-connected, or responsibility-partitioned topology by default instead of fully connected broadcasting.
Testing, integration, or evidence agents may occupy higher-centrality nodes, but their claims must still be verified.
Messages need to reach every agent only during low-cost summarization or final integration.

### 4. Preserve Structured Dissent

At least one agent should be responsible for finding counterexamples, missing tests, incorrect assumptions, and overlooked alternatives.
The dissenting agent should adjust intervention depth to task risk and raise objections that can be executed or checked.
The aggregator must answer minority opinions rather than eliminating disagreement through majority vote.

### 5. Independently Verify Shared Claims

The evidence agent should execute tests, read original files, or query official documentation independently instead of merely restating another agent's results.
RAG, citation count, high confidence, and model capability cannot replace primary evidence.
If multiple agents share the same untrusted source, voting does not turn their correlated error into independent evidence.

### 6. Aggregation and Stopping Conditions

Aggregation may consider calibrated confidence, but final weight should depend primarily on tests, source quality, and reproducibility.
Consensus should only enter final verification and must not directly mark the task complete.
The workflow should stop after verification passes, important objections are resolved, or a clearly defined cost limit is reached.

### 7. Track Error Propagation

The system should record when each agent changes its answer, which messages it saw, and which evidence triggered the change.
Corrective revisions from wrong to correct and harmful revisions from correct to wrong should be monitored separately.
When an error spreads through shared messages, the system should be able to isolate the source, retract downstream summaries, and reverify affected conclusions.

## Actual AlphaXiv MCP Search Evidence

### First Discovery Round

The actual call used the following parameters.

```text
tool: mcp__alphaxiv__discover_papers
difficulty: 10
prioritize: recency
published_after: 2024-01-01
published_before: 2026-08-10
keywords:
  AI
  LLM
  subagent
  multi-agent
  communication
  debate
  consensus
  shared messages
  groupthink
  error propagation
question (English translation of the submitted query):
  Recent AI/LLM subagent and multi-agent methods, focusing on inter-agent communication, debate or consensus, shared messages, and preventing groupthink and error propagation
```

The leading returned candidates included the following papers.

```text
2608.03421  When Truth Is Distributed: Misinformation Derails Collective Fact Recovery in LLM-Based Multi-Agent Systems
2608.03648  Group Perspective Matters: Regulating Debate Relationships Can Mitigate Blind Conformity in Multi-Agent Debate
2608.03239  Relational Priors as Convergence Pressure in LLM-Based Multi-Agent Systems
2608.01463  Where Reasoning Diverges: Localized Multi-Agent Debate for Multi-Hop Question Answering
2606.29026  Preventing Error Propagation in Multi-Agent AI through Runtime Monitoring
2603.04474  From Spark to Fire: Modeling and Mitigating Error Cascades in LLM-Based Multi-Agent Collaboration
```

This recency-ranked round returned mostly 2026 preprints, so the search ranking was not treated as a publication-quality ranking.

### Second Discovery Round

The actual call used the following parameters.

```text
tool: mcp__alphaxiv__discover_papers
difficulty: 10
prioritize: popular
published_after: 2024-01-01
published_before: 2026-08-10
keywords:
  LLM
  multi-agent
  debate
  consensus
  groupthink
  error propagation
  peer-reviewed
  journal
  conference
question (English translation of the submitted query):
  In AI/LLM multi-agent methods, inter-agent communication, debate, consensus, shared messages, and avoiding groupthink and error propagation; prioritize well-known peer-reviewed journals, then top conferences, and finally arXiv
```

The leading returned candidates included the following papers.

```text
2505.21503  Silence is Not Consensus: Disrupting Agreement Bias in Multi-Agent LLMs via Catfish Agent for Clinical Decision Making
2603.04474  From Spark to Fire: Modeling and Mitigating Error Cascades in LLM-Based Multi-Agent Collaboration
2508.17536  Debate or Vote: Which Yields Better Decisions in Multi-Agent Large Language Models?
2506.01332  An Empirical Study of Group Conformity in Multi-Agent Systems
2505.22960  Revisiting Multi-Agent Debate as Test-Time Scaling: A Systematic Study of Conditional Effectiveness
```

### AlphaXiv Paper-Content Queries

The following papers were read through `get_paper_content` or `answer_pdf_queries` using exact AlphaXiv URLs.

```text
2309.13007v3  ReConcile
2406.11776v1  Improving Multi-Agent Debate with Sparse Communication Topology
2506.01332v1  An Empirical Study of Group Conformity in Multi-Agent Systems
2505.21503v1  Silence is Not Consensus
```

The PDF queries covered communication or debate methods, quantitative results, error propagation, group conformity, costs, and author-stated limitations.
The batched PDF response was truncated because it was too long, so follow-up queries used exact paper IDs to retrieve methods, numerical results, and limitations one paper at a time.

### Search and Resolution Limitations

When the full title of the Scientific Reports article was passed to AlphaXiv `answer_pdf_queries`, the tool incorrectly resolved it to `2606.19826v1 Heterogeneous LLM Debate Under Adversarial Peers`.
That incorrect resolution was not used as evidence for the Scientific Reports article, whose information was instead verified from the journal's official version.
This search also found no AlphaXiv or arXiv versions for the Scientific Reports and EPJ Data Science journal articles.
The first arXiv version of ReConcile appeared in 2023, so the hard 2024 date filter excluded it even though its formal ACL publication year is 2024.

## Source Classification

### Formally Peer-Reviewed Journals

- [When collaboration fails: persuasion driven adversarial influence in multi agent large language model debate](https://www.nature.com/articles/s41598-026-42705-7).
- [Selective agreement, not sycophancy: investigating opinion dynamics in LLM interactions](https://link.springer.com/article/10.1140/epjds/s13688-025-00579-1).

### Formally Peer-Reviewed Conference and Findings Papers

- [ReConcile: Round-Table Conference Improves Reasoning via Consensus among Diverse LLMs](https://aclanthology.org/2024.acl-long.381/).
- [Improving Multi-Agent Debate with Sparse Communication Topology](https://aclanthology.org/2024.findings-emnlp.427/).

### Preprint

- [Silence is Not Consensus: Disrupting Agreement Bias in Multi-Agent LLMs via Catfish Agent for Clinical Decision Making](https://arxiv.org/abs/2505.21503).

## Final Recommendations

If only one change can be implemented, replace fully connected agent chat with independent drafts followed by sparse, structured message exchange.
If a second change can be implemented, add an independent evidence agent and traceable opinion-flip records.
If the task involves a high-risk merge, security, or architectural decision, also add a Catfish agent that can produce verifiable counterexamples.
Every vote, consensus, or high-confidence output must undergo independent verification against source code, tests, or official documentation.
