import { describe, expect, it } from "vitest";
import {
  isAdkUnknownSessionError,
  parseAdkJsonl,
} from "./parse.js";
import { isSupportedAdkMajor, parseAdkVersionString } from "./version.js";

describe("parseAdkJsonl", () => {
  it("parses ADK 2.x JSONL events with session, usage, and assistant text", () => {
    const stdout = [
      JSON.stringify({
        author: "root_agent",
        session_id: "sess-1",
        id: "evt-1",
        modelVersion: "gemini-2.5-flash",
        content: { parts: [{ text: "Hello from ADK 2" }] },
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 },
        nodeInfo: { path: "root_agent" },
        output: null,
      }),
    ].join("\n");

    const parsed = parseAdkJsonl(stdout);
    expect(parsed.sessionId).toBe("sess-1");
    expect(parsed.model).toBe("gemini-2.5-flash");
    expect(parsed.summary).toBe("Hello from ADK 2");
    expect(parsed.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
    expect(parsed.hitlPaused).toBe(false);
    expect(parsed.eventCount).toBe(1);
  });

  it("detects HITL pauses from longRunningToolIds", () => {
    const stdout = JSON.stringify({
      author: "root_agent",
      session_id: "sess-2",
      longRunningToolIds: ["tool-1"],
      content: { parts: [{ text: "Need confirmation" }] },
    });
    const parsed = parseAdkJsonl(stdout);
    expect(parsed.hitlPaused).toBe(true);
    expect(parsed.summary).toBe("Need confirmation");
  });

  it("falls back to ADK 2 output field when content is empty", () => {
    const stdout = JSON.stringify({
      author: "workflow",
      session_id: "sess-3",
      output: { answer: 42 },
      nodeInfo: { path: "finalize" },
    });
    const parsed = parseAdkJsonl(stdout);
    expect(parsed.summary).toBe('{"answer":42}');
  });
});

describe("isAdkUnknownSessionError", () => {
  it("detects unknown session messages", () => {
    expect(isAdkUnknownSessionError("", "Session not found: abc")).toBe(true);
    expect(isAdkUnknownSessionError("ok", "")).toBe(false);
  });
});

describe("parseAdkVersionString", () => {
  it("requires major >= 2", () => {
    expect(parseAdkVersionString("2.13.0")).toEqual({ version: "2.13.0", major: 2 });
    expect(isSupportedAdkMajor(2)).toBe(true);
    expect(isSupportedAdkMajor(1)).toBe(false);
  });
});
