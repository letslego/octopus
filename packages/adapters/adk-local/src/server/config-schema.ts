import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { DEFAULT_ADK_LOCAL_MODEL } from "../index.js";

const localOnly = { visibleWhen: { key: "runtime", values: ["local"] } };
const runtimeOnly = { visibleWhen: { key: "runtime", values: ["agent_runtime"] } };

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "runtime",
        label: "ADK runtime",
        type: "select",
        default: "local",
        options: [
          { value: "local", label: "Local ADK CLI (`adk run`)" },
          { value: "agent_runtime", label: "Google Agent Runtime (Reasoning Engine)" },
        ],
        hint: "Local runs google-adk 2.x on the host. Agent Runtime queries a deployed Reasoning Engine over the Vertex/Agent Platform API.",
      },
      {
        key: "agentDir",
        label: "ADK agent directory",
        type: "text",
        required: true,
        hint: "Absolute path to the Google ADK agent package (folder with agent.py exporting root_agent). Required for local runtime.",
        meta: localOnly,
      },
      {
        key: "resourceName",
        label: "Agent Runtime resource name",
        type: "text",
        hint: "Full resource name `projects/.../locations/.../reasoningEngines/...`, or a bare engine id for Express mode.",
        meta: runtimeOnly,
      },
      {
        key: "project",
        label: "GCP project",
        type: "text",
        hint: "Used with agentEngineId when resourceName is not set.",
        meta: runtimeOnly,
      },
      {
        key: "location",
        label: "GCP location",
        type: "text",
        default: "us-central1",
        hint: "Agent Runtime region (default us-central1).",
        meta: runtimeOnly,
      },
      {
        key: "agentEngineId",
        label: "Agent Engine ID",
        type: "text",
        hint: "Reasoning Engine resource id when not using resourceName.",
        meta: runtimeOnly,
      },
      {
        key: "userId",
        label: "ADK user id",
        type: "text",
        hint: "Session user id for Agent Runtime. Defaults to the Paperclip agent id.",
        meta: runtimeOnly,
      },
      {
        key: "model",
        label: "Default LLM model",
        type: "text",
        default: DEFAULT_ADK_LOCAL_MODEL,
        hint: "Passed to `adk run --default_llm_model` for local runtime when the agent does not set a model.",
        meta: localOnly,
      },
      {
        key: "command",
        label: "ADK CLI command",
        type: "text",
        default: "adk",
        hint: "Defaults to `adk` from PATH (requires google-adk 2.x).",
        meta: localOnly,
      },
      {
        key: "pythonCommand",
        label: "Python command",
        type: "text",
        default: "python3",
        hint: "Used to probe `google-adk` package version (must be 2.x).",
        meta: localOnly,
      },
      {
        key: "sessionServiceUri",
        label: "Session service URI",
        type: "text",
        hint: "Optional. Forwarded as `--session_service_uri` (sqlite://..., memory://, agentengine://...).",
        meta: localOnly,
      },
      {
        key: "useLocalStorage",
        label: "Use local .adk storage",
        type: "toggle",
        default: true,
        hint: "Keep ADK local session storage under the agent directory when no explicit session URI is set.",
        meta: localOnly,
      },
      {
        key: "timeoutSec",
        label: "Timeout seconds",
        type: "number",
        default: 0,
        hint: "0 means no adapter wall-clock timeout for local CLI; Agent Runtime defaults to 120s when unset/0.",
      },
      {
        key: "graceSec",
        label: "Grace seconds",
        type: "number",
        default: 15,
        hint: "Seconds to wait after SIGTERM before killing the local ADK process.",
        meta: localOnly,
      },
    ],
  };
}
