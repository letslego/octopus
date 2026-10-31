import { describe, expect, it } from "vitest";
import {
  normalizeAgentRuntimeEventsToJsonl,
  resolveAgentRuntimeEndpoint,
} from "./agent-runtime.js";
import { parseAdkJsonl } from "./parse.js";

describe("resolveAgentRuntimeEndpoint", () => {
  it("builds Vertex URLs from project/location/id", () => {
    const endpoint = resolveAgentRuntimeEndpoint({
      project: "demo-proj",
      location: "us-central1",
      agentEngineId: "123",
    });
    expect(endpoint.resourceName).toBe(
      "projects/demo-proj/locations/us-central1/reasoningEngines/123",
    );
    expect(endpoint.queryUrl).toContain("us-central1-aiplatform.googleapis.com");
    expect(endpoint.queryUrl.endsWith(":query")).toBe(true);
    expect(endpoint.streamQueryUrl).toContain("streamQuery?alt=sse");
  });

  it("accepts a full resourceName", () => {
    const endpoint = resolveAgentRuntimeEndpoint({
      resourceName: "projects/p/locations/europe-west1/reasoningEngines/9",
    });
    expect(endpoint.queryUrl).toContain("europe-west1-aiplatform.googleapis.com");
  });
});

describe("normalizeAgentRuntimeEventsToJsonl", () => {
  it("parses SSE content parts into ADK JSONL the shared parser understands", () => {
    const raw = [
      'data: {"role":"model","parts":[{"text":"hello from agent runtime"}]}',
      'data: {"role":"model","parts":[{"text":" done"}]}',
    ].join("\n");
    const jsonl = normalizeAgentRuntimeEventsToJsonl(raw, "sess-runtime-1");
    const parsed = parseAdkJsonl(jsonl);
    expect(parsed.sessionId).toBe("sess-runtime-1");
    expect(parsed.eventCount).toBe(2);
    expect(parsed.summary).toBeTruthy();
    expect(jsonl).toContain("hello from agent runtime");
    expect(parsed.errorMessage).toBeNull();
  });
});

describe("local JSONL error events", () => {
  it("surfaces API key errors even when the CLI exits 0", () => {
    const stdout = JSON.stringify({
      author: "hello_agent",
      session_id: "test-sess-1",
      errorCode: "ValueError",
      errorMessage: "No API key was provided. Please pass a valid API key.",
      nodeInfo: { path: "hello_agent@1" },
    });
    const parsed = parseAdkJsonl(stdout);
    expect(parsed.errorMessage).toMatch(/No API key was provided/);
    expect(parsed.sessionId).toBe("test-sess-1");
  });
});
