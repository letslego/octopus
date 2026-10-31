export const type = "adk_local";
export const label = "Google ADK";

/** Minimum supported google-adk major version (Python). */
export const MIN_ADK_MAJOR_VERSION = 2;

export const DEFAULT_ADK_LOCAL_MODEL = "gemini-3.5-flash";

export const models = [
  { id: DEFAULT_ADK_LOCAL_MODEL, label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];

export const agentConfigurationDoc = `# adk_local agent configuration

Adapter: adk_local

Use when:
- You already have agents built with Google Agent Development Kit (ADK) Python 2.x
- You want Paperclip to wake them through the **ADK runtime**:
  - \`runtime: "local"\` → \`adk run <agentDir> --jsonl\` on the host
  - \`runtime: "agent_runtime"\` → Google Agent Runtime / Reasoning Engine HTTP API
- You need session continuity across Paperclip heartbeats

Don't use when:
- You only need Gemini CLI coding harness behavior (use gemini_local)
- The agent is a generic webhook (use http)
- google-adk is not installed for local mode, or is pinned below 2.0

Core fields:
- runtime (string, optional): \`local\` (default) or \`agent_runtime\`
- agentDir (string, required for local): absolute ADK agent package path
- resourceName / project+location+agentEngineId (required for agent_runtime)
- promptTemplate / instructionsFilePath (optional)
- model (optional, local): \`--default_llm_model\`
- command / pythonCommand (optional, local)
- env (object, optional): supports GEMINI_API_KEY / GOOGLE_API_KEY (mirrored for ADK)
- userId (optional, agent_runtime): defaults to Paperclip agent id

Operational fields:
- timeoutSec / graceSec

Notes:
- Requires Google ADK Python **2.x** for local mode.
- Local mode treats JSONL \`errorMessage\`/\`errorCode\` as failures even when \`adk\` exits 0.
- Agent Runtime auth: \`GOOGLE_ACCESS_TOKEN\` (ADC bearer) or Express \`GOOGLE_API_KEY\` / \`GEMINI_API_KEY\`.
- HITL pauses (exit code 2 / longRunningToolIds) keep the session for the next wake.
`;
