<!-- KNOWNS GUIDELINES START -->
# Knowns Project

This project uses **Knowns CLI** for task and documentation management.

## Before Starting

Run this command to get usage guidelines:

```bash
knowns agents guideline
```

You MUST call this at session start and follow every rule it outputs.

## Context-Specific Guidelines

Get guidelines for specific workflow stages:

```bash
# Full guidelines (all sections)
knowns agents guideline --full

# Compact (core rules + common mistakes)
knowns agents guideline --compact

# By workflow stage
knowns agents guideline --stage creation    # Creating tasks
knowns agents guideline --stage execution   # Implementing tasks
knowns agents guideline --stage completion  # Completing tasks

# Individual sections
knowns agents guideline --core       # Core rules only
knowns agents guideline --commands   # Commands reference
knowns agents guideline --mistakes   # Common mistakes
```

## Quick Commands

```bash
knowns task list --plain        # List tasks
knowns task <id> --plain        # View task
knowns doc list --plain         # List docs
knowns doc "<path>" --plain     # View doc
knowns search "query" --plain   # Search
```

**Important:** Always read the guidelines before working on tasks.
<!-- KNOWNS GUIDELINES END -->

## Workspace-Aware Tool Execution

This project may be used with multiple local MCP Bridge instances. Treat the target project as the primary semantic context for tool execution.

### Concepts

- **Workspace**: The project the user wants to work with.
- **Bridge**: The local MCP connection that provides tools for a workspace.
- **Scope**: The filesystem boundary allowed by a bridge.
- **Tool**: An operation such as read, search, edit, write, or execute.

### Current workspace mapping

- `mighty-note-backend`
  - Path: `/Users/tranducy/Documents/Project/mighty_note_backend`
  - Workspace ID: `mighty_note_backend`
  - Bridge: `mighty_note_backend`
  - Tool prefix: `mighty_note_backend__<tool>`

- `gpt-inner-call`
  - Path: `/Users/tranducy/Documents/Project/gpt-inner-call`
  - Workspace ID: `gpt_inner_call`
  - Bridge: `gpt_inner_call`
  - Tool prefix: `gpt_inner_call__<tool>`

### Routing rules

Before using a workspace-specific tool:

1. Identify the target workspace.
2. Resolve the workspace to its bridge.
3. Use only that bridge for workspace-specific operations.
4. If an absolute path is provided, resolve the workspace from the path.
5. Never assume different bridges have the same filesystem access.
6. Never access a path outside the bridge's allowed scope.
7. If the workspace is ambiguous, ask the user before modifying files.

### Multiple workspaces

When a request involves multiple workspaces, resolve each workspace independently and use its corresponding bridge. Never force operations for multiple workspaces through one bridge.

### Execution flow

Always reason about tool execution as:

`User Request → Workspace Resolution → Bridge Resolution → Tool Execution`

For modifications, inspect the relevant files first, keep changes minimal, and verify the result through the same workspace bridge.