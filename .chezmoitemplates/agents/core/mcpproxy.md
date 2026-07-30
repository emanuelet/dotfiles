## MCPProxy Usage

Source reference: `https://docs.mcpproxy.app/llms.txt`

### Default workflow
1. Discover first with `mcpproxy_retrieve_tools`.
2. Use the exact returned tool `name`.
3. Follow the returned `call_with` field:
   - read-only → `mcpproxy_call_tool_read`
   - state-changing → `mcpproxy_call_tool_write`
   - destructive / irreversible → `mcpproxy_call_tool_destructive`
4. Pass `intent_reason` and, when relevant, `intent_data_sensitivity`.

### Safety rules
- Never guess MCP server names or tool names.
- Default to read-only discovery: use `read_only_only` and/or `exclude_destructive` when possible.
- Treat write/destructive operations as high-friction: only use them when the user explicitly wants a change.
- Check `session_risk` from `mcpproxy_retrieve_tools` and self-restrict when risk is high.
- Prefer `mcpproxy_*` tools over the generic `mcp` gateway unless there is a specific reason to use raw MCP.

### Discovery and server management
- Find registries with `mcpproxy_list_registries`.
- Search registries with `mcpproxy_search_servers`.
- Add servers with `mcpproxy_upstream_servers` using `add_from_registry` when possible.
- Newly added servers are quarantined by default; inspect and approve tools with `mcpproxy_quarantine_security`.
- Use `mcpproxy_upstream_servers` for `list`, `patch`, `update`, and `tail_log`.
- Use `mcpproxy_set_profile` to scope discovery/calls to a profile when needed.

### Truncation and pagination
- If mcpproxy reports truncated results, continue with `mcpproxy_read_cache` using the provided cache key.

### Code execution
- `mcpproxy_code_execution` is for orchestrating multiple MCP tools with JavaScript/TypeScript, but it may be disabled by config. Check before relying on it.

### MCP tool naming
- Direct MCP servers and MCPproxy are separate catalogs. Use `codebase-memory-mcp:*` and `brave-devtools:*` for the direct servers.
- MCPproxy tools must use the exact fully qualified name returned by discovery: `server:tool`.
- Never call a proxied tool with only the upstream tool name. Examples: `basic-memory:read_content`, `basic-memory:build_context`, `reactive-resume:read_resume`.
- Use these exact MCPproxy server names; do not change spelling, case, spaces, or punctuation: `basic-memory`, `brave-devtools`, `contextqmd`, `coolify`, `obsidian`, `reactive-resume`, `searxng`, `sparkyfitness`, `time`.

### MCPproxy profiles
- Profiles are overlapping server groups selected per MCP session with `set_profile`.
- Use `research` for `basic-memory`, `contextqmd`, `obsidian`, `searxng`, and `time`.
- Use `resume` for `basic-memory`, `obsidian`, and `reactive-resume`.
- Use `development` for `contextqmd`, `coolify`, and `searxng`.
- Use `fitness` for `sparkyfitness` and `time`.
- Use `browser` for proxied `brave-devtools` and `searxng`; direct `brave-devtools` remains available separately.
- Select a profile before discovery when the task clearly matches one: `set_profile({"profile":"resume"})`.
- Clear profile selection after a focused workflow with `set_profile({"profile":""})` when the full catalog is needed.

### Basic Memory parameters
- For `basic-memory:build_context`, do not use `timeframe: "all"`; it is rejected by the upstream validator.
- Omit `timeframe` when the default is sufficient, otherwise use the exact supported duration/date format from the discovered schema.
