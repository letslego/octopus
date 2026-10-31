import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { getConfigSchema } from "./config-schema.js";
export {
  parseAdkJsonl,
  isAdkUnknownSessionError,
  isAdkVersionIncompatibleError,
} from "./parse.js";
export {
  parseAdkVersionString,
  isSupportedAdkMajor,
  summarizeAdkVersionProbe,
} from "./version.js";
export {
  resolveAgentRuntimeEndpoint,
  normalizeAgentRuntimeEventsToJsonl,
  executeAgentRuntimeQuery,
} from "./agent-runtime.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sessionId =
      readNonEmptyString(record.sessionId) ??
      readNonEmptyString(record.session_id) ??
      readNonEmptyString(record.sessionID);
    if (!sessionId) return null;
    const agentDir =
      readNonEmptyString(record.agentDir) ??
      readNonEmptyString(record.agent_dir);
    const cwd =
      readNonEmptyString(record.cwd) ??
      readNonEmptyString(record.workdir);
    return {
      sessionId,
      ...(agentDir ? { agentDir } : {}),
      ...(cwd ? { cwd } : {}),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const sessionId =
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id) ??
      readNonEmptyString(params.sessionID);
    if (!sessionId) return null;
    const agentDir =
      readNonEmptyString(params.agentDir) ??
      readNonEmptyString(params.agent_dir);
    const cwd =
      readNonEmptyString(params.cwd) ??
      readNonEmptyString(params.workdir);
    return {
      sessionId,
      ...(agentDir ? { agentDir } : {}),
      ...(cwd ? { cwd } : {}),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id) ??
      readNonEmptyString(params.sessionID)
    );
  },
};
