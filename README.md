# Diagrammer MCP

An MCP server that lets an AI agent create validated diagrams and one-page explainers as standalone HTML files. Each file comes with dark and light themes, motion, and image, SVG and WebM export.

Supported types: `architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `tree`, `class`, `timeline`, `waterfall` and `explainer`.

The server is a thin stdio JSON-RPC wrapper and has no dependencies. Every tool runs the CLI of an installed [Archify](https://github.com/tt-a1i/archify) engine, so the server never re-implements Archify's renderers or quality gates.

## Requirements

- Node.js 18 or newer.
- An installed Archify engine: the folder that contains `bin/archify.mjs`. The default location is `~/.claude/skills/archify`. To use another location, set `DIAGRAM_ENGINE_HOME`.
- A local browser that the engine can drive. `diagram_finalize` uses it for the browser check.

To check the engine:

```bash
node ~/.claude/skills/archify/bin/archify.mjs doctor
```

## Install

```bash
git clone https://github.com/VinodhDeva/diagrammer.git
```

Register the server with Claude Code:

```bash
claude mcp add diagrammer -- node /absolute/path/to/diagrammer/server.mjs
```

You can also register it with a project `.mcp.json`. Change the path in the included file to match your clone:

```json
{
  "mcpServers": {
    "diagrammer": {
      "command": "node",
      "args": ["/absolute/path/to/diagrammer/server.mjs"],
      "env": { "DIAGRAM_ENGINE_HOME": "/absolute/path/to/archify" }
    }
  }
}
```

Restart the client after you register the server.

## Tools

| Tool | Purpose |
|---|---|
| `diagram_guide` | Recommends a diagram type for a scenario or question. |
| `diagram_authoring_context` | Returns the authoring defaults, schemas and examples for a type. Read it before you write a candidate. |
| `diagram_finalize` | Main delivery tool. In one gated run it validates the candidate, renders it, runs strict checks and runs the real-browser check. |
| `diagram_validate` | Validates a candidate only, for diagnosis. |
| `diagram_render` | Renders HTML without quality gates. |
| `diagram_check` | Runs strict artifact checks, or the browser check (`browser: true`), on rendered HTML. |
| `diagram_brands` | Looks up brand marks by name, alias, domain or category. |
| `diagram_doctor` | Verifies the engine installation. |

There are two ways to give a candidate to the tools that take one:

- `candidate`: a JSON object for a diagram, or Markdown text for an explainer.
- `candidate_path`: the path to an existing candidate file.

Optional fields: `work_dir`, `output`, `quality` (`showcase` or `standard`), `repo_root` and `out_dir`.

When the client initializes, the server sends workflow instructions that tell the agent which tools to call and in what order.

## Typical workflow

1. If the type is unclear, call `diagram_guide`.
2. Call `diagram_authoring_context` for the chosen type.
3. Write the complete candidate, then call `diagram_finalize` once.
4. If finalize fails, repair the failed gate and call `diagram_finalize` again. Pass the same `work_dir` and a new `out_dir`, for example `<work_dir>/review-2`.

## Output

Each new artifact gets its own folder at `.diagrams/<type>-<slug>-<YYYYMMDD-HHMMSS>/`. The folder holds the candidate, the HTML file and the receipts.

Folders are created inside the server's working directory. To use a different directory, set `DIAGRAM_WORKDIR`.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DIAGRAM_ENGINE_HOME` | `~/.claude/skills/archify` | Archify engine folder. |
| `DIAGRAM_WORKDIR` | process working directory | Base folder for inputs and outputs. |

## Test

```bash
npm test
```

The test starts the server over stdio and checks the handshake and the tool list. It then renders a sample sequence diagram through all four finalize gates.

## Credits

This server bundles no engine code. At runtime it calls Archify by tt-a1i, which is licensed under the Apache License 2.0. See [NOTICE](NOTICE).
