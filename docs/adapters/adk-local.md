---
title: Google ADK
summary: Run Google ADK Python 2.x agents locally or on Google Agent Runtime
---

The `adk_local` adapter wakes Google Agent Development Kit agents from Paperclip heartbeats. It supports two **ADK runtimes**:

| `runtime` | What runs | When to use |
|-----------|-----------|-------------|
| `local` (default) | Host `adk run <agentDir> --jsonl` | ADK package on the Paperclip machine |
| `agent_runtime` | Google Agent Runtime / Reasoning Engine HTTP API | Agent already deployed with `adk deploy agent_engine` |

Both paths require **Google ADK Python 2.x** semantics (local installs must be `google-adk>=2`).

## Prerequisites

### Local runtime

- Python 3.11+
- `pip install "google-adk>=2"`
- An ADK agent package exporting `root_agent`
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` (Paperclip mirrors either name into the other for ADK)

### Agent Runtime

- A deployed Reasoning Engine (`adk deploy agent_engine ...`)
- Auth: `GOOGLE_ACCESS_TOKEN` (ADC bearer) **or** Express-mode API key (`GOOGLE_API_KEY` / `GEMINI_API_KEY`)
- Config: `resourceName`, or `project` + `agentEngineId` (+ optional `location`)

## Configuration

| Field | Runtime | Description |
|-------|---------|-------------|
| `runtime` | both | `local` or `agent_runtime` |
| `agentDir` | local | Absolute ADK package path |
| `resourceName` | agent_runtime | `projects/.../reasoningEngines/...` or Express engine id |
| `project` / `location` / `agentEngineId` | agent_runtime | Alternative to `resourceName` |
| `userId` | agent_runtime | Session user id (defaults to Paperclip agent id) |
| `promptTemplate` / `instructionsFilePath` | both | Wake prompt inputs |
| `model` | local | `--default_llm_model` |
| `env` | both | Env / secret refs |
| `timeoutSec` / `graceSec` | both / local | Timeouts |

## Local flow

```bash
adk run <agentDir> "<prompt>" --jsonl --session_id <id> [--default_llm_model <model>]
```

Paperclip parses ADK 2.x JSONL (`nodeInfo`, `output`, usage).  
If the CLI exits `0` but emits `errorMessage` / `errorCode` (common for missing API keys), the run is still marked failed.

## Agent Runtime flow

1. `async_create_session` via `:query` (when no stored session)
2. `async_stream_query` via `:streamQuery?alt=sse` (falls back to `:query`)
3. Normalize SSE/JSON payloads into the same transcript parser
4. Persist `sessionId` + resource identity for the next heartbeat

## Example configs

Local:

```json
{
  "runtime": "local",
  "agentDir": "/abs/path/to/my_adk_agent",
  "model": "gemini-2.5-flash",
  "env": { "GEMINI_API_KEY": "${secrets.google_api_key}" }
}
```

Agent Runtime:

```json
{
  "runtime": "agent_runtime",
  "resourceName": "projects/my-proj/locations/us-central1/reasoningEngines/123456",
  "env": { "GOOGLE_ACCESS_TOKEN": "${secrets.gcp_access_token}" }
}
```
