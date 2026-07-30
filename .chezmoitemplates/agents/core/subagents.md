## Subagents

Use 2+ subagents or none. NEVER launch exactly 1 subagent.

The main agent is a builder, not a dispatcher. Work first, delegate second. Use subagents proactively, but only after scoping has split the work into tracks ready for parallel execution. Prefer spawning the sub-agents in opencode.

- Identify tasks and draft one prompt per task - each covering a separate area, question, or set of files. Keep scoping in the main agent until you have 2+ prompts ready.
- Each track must complete without the results of the others. If a track depends on another's findings, handle it in the main agent.
- Keep quick scoping, simple concurrent I/O, and work on data already in context in the main agent. Use parallel tool calls when helpful.
- After the batch returns, synthesize results and use the main agent only for narrow gap-filling before implementation.
