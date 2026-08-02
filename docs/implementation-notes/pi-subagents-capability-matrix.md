# pi-subagents capability matrix

This matrix records the maintained capability boundaries of `@narumitw/pi-subagents`. The package
README owns public schemas and usage; source and focused tests are the executable authority.

| Capability | Status and boundary | Evidence |
| --- | --- | --- |
| Blocking single/parallel/chain/fan-in | Implemented through `subagent`; the full batch is preflighted before any launch | `src/execution.ts`, `test/subagents.test.ts` |
| Detached addressable agents | Implemented through `subagent_spawn`; completion delivery is next-turn by default or opt-in auto-resume | `src/stateful.ts`, `test/orchestration.test.ts`, `test/completion-delivery.test.ts` |
| Follow-up and retained lifecycle | Implemented through `subagent_send`, `subagent_manage`, and `subagent_mailbox` | `src/stateful.ts`, registry/orchestration tests |
| Metadata-only inspection | `subagent_inspect` is registered in every workflow, including disabled delegation; it never launches children or reads/acknowledges mailbox content | `src/inspect.ts`, `test/inspect.test.ts` |
| Synchronous read-only consultation | `subagent_consult` is registered whenever blocking delegation is enabled; it runs one ephemeral child with extensions disabled and only the effective subset of `read`, `grep`, `find`, and `ls` | `src/consult.ts`, `src/consult-policy.ts`, `test/consult.test.ts` |
| Default tool surface | Seven tools: `subagent`, `subagent_spawn`, `subagent_send`, `subagent_manage`, `subagent_mailbox`, `subagent_inspect`, and `subagent_consult` | `src/subagents.ts`, `test/subagents.test.ts`, `test/tool-rendering.test.ts` |
| Workflow-dependent registration | `all`: seven tools; `async-only`: four detached tools plus inspection; `blocking-only`: blocking, consultation, and inspection; `disabled`: inspection only | exact registration cases in `test/subagents.test.ts` |
| Deterministic timeout and process cleanup | Implemented with process-group termination and bounded settlement/cleanup | `src/runner.ts`, runner and evolution coverage |
| Bounded protocol and output | Implemented at both 50 KB and 2,000-line limits for model-facing content and safe projections | `src/protocol.ts`, `src/limits.ts`, rendering/inspection/consultation tests |
| Abort with partial structured result | Blocking/stateful operations preserve bounded partial results; consultation preserves post-launch evidence/usage and marks the finalized Pi result as an error | runner, consultation, and orchestration tests |
| Recursion guard | Implemented with `PI_SUBAGENT_DEPTH` and `PI_SUBAGENT_MAX_DEPTH` | `src/execution.ts`, `src/runner.ts` |
| Transport abstraction | Subprocess is the default; in-process public-SDK transport is opt-in and never silently widens tools | `src/transport.ts`, transport tests |
| Hierarchical ownership | Parent/root/depth/children metadata and child-first subtree interrupt/close are implemented | `src/registry.ts`, registry/orchestration tests |
| Bounded mailbox | Implemented with acknowledgement and deduplication; inspection exposes only metadata counts | `src/registry.ts`, mailbox/inspection tests |
| Shared-write guard and disposable worktrees | Opt-in conflict guard and clean-Git worktrees are implemented; generated worktrees inherit the approved base target's resolved trust | `src/workspace.ts`, `src/stateful-safety.ts`, orchestration tests |
| Separate active and retained capacity | Implemented with FIFO active-turn scheduling and independent retained limits | `src/registry.ts`, capacity/fairness tests |
| Parent context selection | Supports none/all/summary/recent N/selected entries; projection is text-only, sanitized, and bounded | `src/context.ts`, context protocol tests |
| Target trust resolution | Current workspace uses session trust; external targets use nearest saved `ProjectTrustStore` decision, with nearer denial winning | `src/cwd-policy.ts`, `test/cwd-policy.test.ts` |
| Consultation target policy | Defaults to `anywhere`; an allowed target without effective trust is downgraded to no inherited target/project resources | `src/consult.ts`, consultation cwd/trust tests |
| General delegation target policy | Defaults to `trusted-targets`; every single/batch/stateful target is preflighted, and subprocess/in-process transports receive the same resolved trust | execution/stateful/transport tests |
| Durable logical history | Versioned private state is restored inert; in-process sessions seed bounded prior turn boundaries once | `src/persistence.ts`, persistence/orchestration tests |
| Automatic side-effect resume | Rejected; restored records are inert until explicit follow-up | persistence and lifecycle tests |
| Native transcript switching | Core-blocked because Pi exposes no supported child transcript/session switch handle | public SDK boundary review |
| Approval/sandbox/header inheritance | Unsupported as a general guarantee; reported policy is bounded and explicit | result policy and transport tests |
| Filesystem isolation | Optional disposable worktree only; shared cwd is default and neither target policy nor consultation resource policy is an OS sandbox | `src/workspace.ts`, README security boundary |
| Autonomous recursive teams | Rejected; recursion is bounded and no unbounded scheduler is provided | execution settings and recursion tests |

## Read-only boundary

`subagent_inspect` is side-effect-free at the extension capability boundary: it uses pure settings and
metadata snapshots, applies project-trust gates before project discovery, and omits prompts, history,
context content, mailbox content, credential-bearing model fields, and unsafe paths.

`subagent_consult` is synchronous and non-retained. Missing agent tool configuration selects the
read-only default set; an explicit empty list selects no tools; any explicit list is intersected with
the supported read-only built-ins. Extensions, sessions, lifecycle tools, shell execution, and file
mutation tools are disabled. Pre-launch failures throw. Once a child starts, bounded partial evidence
and nested usage are retained and the finalized Pi tool result is marked as an error.

These are executor and resource-loading guarantees, not filesystem, network, process, or
confidentiality sandboxes. A consultation can read an accessible absolute path when explicitly asked
and calls the configured model over the network.
