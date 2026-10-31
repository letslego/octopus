import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { parseAdkJsonl, type AdkParseResult } from "./parse.js";

export type AdkAgentRuntimeConfig = {
  resourceName: string;
  userId: string;
  expressApiKey: string | null;
  accessToken: string | null;
  timeoutMs: number;
};

export type AdkAgentRuntimeResult = {
  sessionId: string;
  parsed: AdkParseResult;
  rawEvents: string;
  httpStatus: number;
};

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Build Vertex / Express Reasoning Engine base URL (without :query). */
export function resolveAgentRuntimeEndpoint(config: Record<string, unknown>): {
  resourceName: string;
  queryUrl: string;
  streamQueryUrl: string;
} {
  const resourceName = asString(config.resourceName, asString(config.agentEngineResourceName, "")).trim();
  if (resourceName) {
    const name = resourceName.replace(/^\/+/, "");
    if (name.startsWith("projects/")) {
      // projects/P/locations/L/reasoningEngines/R
      const parts = name.split("/");
      const location = parts[3] ?? "us-central1";
      const host = `${location}-aiplatform.googleapis.com`;
      const base = `https://${host}/v1/${name}`;
      return {
        resourceName: name,
        queryUrl: `${base}:query`,
        streamQueryUrl: `${base}:streamQuery?alt=sse`,
      };
    }
    // Bare resource id with express mode
    const base = `https://aiplatform.googleapis.com/v1/reasoningEngines/${name}`;
    return {
      resourceName: name,
      queryUrl: `${base}:query`,
      streamQueryUrl: `${base}:streamQuery?alt=sse`,
    };
  }

  const project = asString(config.project, asString(config.googleCloudProject, "")).trim();
  const location = asString(config.location, asString(config.region, "us-central1")).trim() || "us-central1";
  const engineId = asString(config.agentEngineId, asString(config.resourceId, "")).trim();
  if (!project || !engineId) {
    throw new Error(
      "adk_local agent_runtime requires resourceName, or project + agentEngineId (and optional location)",
    );
  }
  const name = `projects/${project}/locations/${location}/reasoningEngines/${engineId}`;
  const host = `${location}-aiplatform.googleapis.com`;
  const base = `https://${host}/v1/${name}`;
  return {
    resourceName: name,
    queryUrl: `${base}:query`,
    streamQueryUrl: `${base}:streamQuery?alt=sse`,
  };
}

export function readAgentRuntimeConfig(
  config: Record<string, unknown>,
  env: Record<string, string>,
): AdkAgentRuntimeConfig {
  const endpoints = resolveAgentRuntimeEndpoint(config);
  const userId =
    asString(config.userId, "").trim() ||
    asString(env.PAPERCLIP_AGENT_ID, "").trim() ||
    "paperclip";
  const expressApiKey =
    asString(config.expressApiKey, "").trim() ||
    asString(env.GOOGLE_API_KEY, "").trim() ||
    asString(env.GEMINI_API_KEY, "").trim() ||
    null;
  const accessToken =
    asString(config.accessToken, "").trim() ||
    asString(env.GOOGLE_ACCESS_TOKEN, "").trim() ||
    asString(env.CLOUDSDK_AUTH_ACCESS_TOKEN, "").trim() ||
    null;
  const timeoutSec = Number(config.timeoutSec ?? 0);
  return {
    resourceName: endpoints.resourceName,
    userId,
    expressApiKey,
    accessToken,
    timeoutMs: Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : 120_000,
  };
}

function authHeaders(runtime: AdkAgentRuntimeConfig): Record<string, string> {
  if (runtime.expressApiKey && !runtime.resourceName.startsWith("projects/")) {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": runtime.expressApiKey,
    };
  }
  if (runtime.accessToken) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.accessToken}`,
    };
  }
  if (runtime.expressApiKey) {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": runtime.expressApiKey,
    };
  }
  throw new Error(
    "Agent Runtime auth missing: set GOOGLE_ACCESS_TOKEN (ADC bearer) or GOOGLE_API_KEY / expressApiKey",
  );
}

async function postJson(
  url: string,
  runtime: AdkAgentRuntimeConfig,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string; json: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(runtime),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { status: res.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

function extractSessionId(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const output = parseObject(payload.output);
  return (
    asString(output.id, "").trim() ||
    asString(payload.id, "").trim() ||
    asString(payload.session_id, "").trim() ||
    null
  );
}

/** Convert Agent Runtime stream/query payloads into JSONL for the shared parser. */
export function normalizeAgentRuntimeEventsToJsonl(
  raw: string,
  sessionId: string,
): string {
  const lines: string[] = [];
  const chunks = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const data = chunk.startsWith("data:") ? chunk.slice(5).trim() : chunk;
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          lines.push(JSON.stringify(enrichRuntimeEvent(item, sessionId)));
        }
        continue;
      }
      if (typeof parsed === "object" && parsed !== null) {
        const rec = parsed as Record<string, unknown>;
        // streamQuery often returns Content-shaped objects {role, parts}
        if (rec.parts || rec.role || rec.content || rec.author || rec.error || rec.errorMessage) {
          lines.push(JSON.stringify(enrichRuntimeEvent(rec, sessionId)));
          continue;
        }
        if (rec.output !== undefined) {
          lines.push(JSON.stringify(enrichRuntimeEvent(rec.output, sessionId)));
          continue;
        }
      }
      lines.push(JSON.stringify({ author: "agent", session_id: sessionId, content: { parts: [{ text: String(data) }] } }));
    } catch {
      lines.push(
        JSON.stringify({
          author: "agent",
          session_id: sessionId,
          content: { parts: [{ text: data }] },
        }),
      );
    }
  }
  return lines.join("\n");
}

function enrichRuntimeEvent(value: unknown, sessionId: string): Record<string, unknown> {
  if (typeof value === "string") {
    return { author: "agent", session_id: sessionId, content: { parts: [{ text: value }] } };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { author: "agent", session_id: sessionId, output: value };
  }
  const rec = { ...(value as Record<string, unknown>) };
  if (!rec.session_id && !rec.sessionId) rec.session_id = sessionId;
  if (!rec.author) {
    const role = asString(rec.role, "").toLowerCase();
    rec.author = role === "user" || role === "human" ? "user" : "agent";
  }
  if (!rec.content && Array.isArray(rec.parts)) {
    rec.content = { parts: rec.parts };
  }
  if (rec.error && !rec.errorMessage) {
    rec.errorMessage = typeof rec.error === "string" ? rec.error : JSON.stringify(rec.error);
  }
  return rec;
}

export async function executeAgentRuntimeQuery(input: {
  config: Record<string, unknown>;
  env: Record<string, string>;
  message: string;
  sessionId: string | null;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<AdkAgentRuntimeResult> {
  const runtime = readAgentRuntimeConfig(input.config, input.env);
  const endpoints = resolveAgentRuntimeEndpoint(input.config);

  await input.onLog(
    "stderr",
    `[paperclip] adk_local invoking Google Agent Runtime: ${trimSlash(endpoints.resourceName)}\n`,
  );

  let sessionId = input.sessionId;
  if (!sessionId) {
    const created = await postJson(endpoints.queryUrl, runtime, {
      class_method: "async_create_session",
      input: { user_id: runtime.userId },
    });
    if (created.status < 200 || created.status >= 300) {
      throw new Error(
        `Agent Runtime create_session failed (${created.status}): ${created.text.slice(0, 500)}`,
      );
    }
    sessionId = extractSessionId(created.json);
    if (!sessionId) {
      throw new Error("Agent Runtime create_session did not return a session id");
    }
    await input.onLog("stderr", `[paperclip] Agent Runtime session created: ${sessionId}\n`);
  }

  const streamed = await postJson(endpoints.streamQueryUrl, runtime, {
    class_method: "async_stream_query",
    input: {
      user_id: runtime.userId,
      session_id: sessionId,
      message: input.message,
    },
  });

  // Some deployments only expose :query (non-streaming). Fall back.
  let rawEvents = streamed.text;
  let httpStatus = streamed.status;
  if (streamed.status === 404 || streamed.status === 400) {
    const queried = await postJson(endpoints.queryUrl, runtime, {
      class_method: "async_stream_query",
      input: {
        user_id: runtime.userId,
        session_id: sessionId,
        message: input.message,
      },
    });
    if (queried.status >= 200 && queried.status < 300) {
      rawEvents = queried.text;
      httpStatus = queried.status;
    } else if (streamed.status < 200 || streamed.status >= 300) {
      throw new Error(
        `Agent Runtime query failed (${streamed.status}): ${streamed.text.slice(0, 500)}`,
      );
    }
  } else if (streamed.status < 200 || streamed.status >= 300) {
    throw new Error(
      `Agent Runtime streamQuery failed (${streamed.status}): ${streamed.text.slice(0, 500)}`,
    );
  }

  await input.onLog("stdout", rawEvents.endsWith("\n") ? rawEvents : `${rawEvents}\n`);
  const jsonl = normalizeAgentRuntimeEventsToJsonl(rawEvents, sessionId);
  const parsed = parseAdkJsonl(jsonl);
  return {
    sessionId: parsed.sessionId ?? sessionId,
    parsed,
    rawEvents,
    httpStatus,
  };
}
