import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function extractText(content: unknown): string {
  const rec = asRecord(content);
  if (!rec) return typeof content === "string" ? content : "";
  if (typeof rec.text === "string") return rec.text;
  const parts = Array.isArray(rec.parts) ? rec.parts : [];
  const chunks: string[] = [];
  for (const partRaw of parts) {
    const part = asRecord(partRaw);
    if (!part) continue;
    const text = asString(part.text).trim();
    if (text) chunks.push(text);
    const fnCall = asRecord(part.functionCall) ?? asRecord(part.function_call);
    if (fnCall) {
      chunks.push(`[tool_call:${asString(fnCall.name, "tool")}]`);
    }
    const fnResp = asRecord(part.functionResponse) ?? asRecord(part.function_response);
    if (fnResp) {
      chunks.push(`[tool_result:${asString(fnResp.name, "tool")}]`);
    }
  }
  return chunks.join("\n");
}

export function parseAdkStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith("{")) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const parsed = safeJsonParse(trimmed);
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const entries: TranscriptEntry[] = [];
  const author = asString(parsed.author).trim();
  const sessionId =
    asString(parsed.session_id).trim() || asString(parsed.sessionId).trim() || undefined;
  const model =
    asString(parsed.modelVersion).trim() || asString(parsed.model_version).trim() || undefined;
  const nodePath =
    asString(parsed.node_path).trim() ||
    asString(asRecord(parsed.nodeInfo)?.path).trim() ||
    asString(asRecord(parsed.node_info)?.path).trim() ||
    undefined;

  if (sessionId || model) {
    entries.push({
      kind: "init",
      ts,
      model: model ?? "",
      sessionId: sessionId ?? "",
    });
  } else if (nodePath) {
    entries.push({ kind: "system", ts, text: `ADK node ${nodePath}` });
  }

  const text = extractText(parsed.content);
  const authorLower = author.toLowerCase();
  if (text) {
    if (authorLower === "user" || authorLower === "human") {
      entries.push({ kind: "user", ts, text });
    } else if (text.includes("[tool_call:")) {
      const nameMatch = text.match(/\[tool_call:([^\]]+)\]/);
      entries.push({
        kind: "tool_call",
        ts,
        name: nameMatch?.[1] ?? "tool",
        input: parsed.content ?? {},
      });
    } else if (text.includes("[tool_result:")) {
      entries.push({
        kind: "tool_result",
        ts,
        toolUseId: asString(parsed.id, "adk-tool"),
        content: text,
        isError: Boolean(parsed.errorMessage || parsed.error_message),
      });
    } else {
      entries.push({ kind: "assistant", ts, text });
    }
  }

  const usage = asRecord(parsed.usageMetadata) ?? asRecord(parsed.usage_metadata);
  if (usage) {
    const errorText =
      asString(parsed.errorMessage) || asString(parsed.error_message);
    entries.push({
      kind: "result",
      ts,
      text: text || "Run completed",
      inputTokens: asNumber(usage.promptTokenCount, asNumber(usage.input_tokens, 0)),
      outputTokens: asNumber(usage.candidatesTokenCount, asNumber(usage.output_tokens, 0)),
      cachedTokens: asNumber(usage.cachedContentTokenCount, 0),
      costUsd: 0,
      subtype: "end",
      isError: Boolean(errorText),
      errors: errorText ? [errorText] : [],
    });
  }

  if (entries.length === 0) {
    entries.push({ kind: "stdout", ts, text: line });
  }
  return entries;
}
