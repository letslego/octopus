import { asNumber, asString, parseJson } from "@paperclipai/adapter-utils/server-utils";

export type AdkParsedUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
};

export type AdkParseResult = {
  sessionId: string | null;
  model: string | null;
  summary: string | null;
  usage: AdkParsedUsage | null;
  errorMessage: string | null;
  hitlPaused: boolean;
  authors: string[];
  eventCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractTextFromContent(content: unknown): string {
  const rec = asRecord(content);
  if (!rec) return typeof content === "string" ? content : "";
  if (typeof rec.text === "string" && rec.text.trim()) return rec.text;
  const parts = Array.isArray(rec.parts) ? rec.parts : [];
  const chunks: string[] = [];
  for (const partRaw of parts) {
    if (typeof partRaw === "string" && partRaw.trim()) {
      chunks.push(partRaw);
      continue;
    }
    const part = asRecord(partRaw);
    if (!part) continue;
    const text = asString(part.text, "").trim();
    if (text) chunks.push(text);
  }
  return chunks.join("");
}

function readUsage(raw: unknown): AdkParsedUsage | null {
  const usage = asRecord(raw);
  if (!usage) return null;
  const inputTokens = asNumber(
    usage.promptTokenCount,
    asNumber(usage.input_tokens, asNumber(usage.inputTokens, 0)),
  );
  const outputTokens = asNumber(
    usage.candidatesTokenCount,
    asNumber(usage.output_tokens, asNumber(usage.outputTokens, 0)),
  );
  const cachedInputTokens = asNumber(
    usage.cachedContentTokenCount,
    asNumber(usage.cached_input_tokens, asNumber(usage.cachedInputTokens, 0)),
  );
  if (inputTokens <= 0 && outputTokens <= 0 && cachedInputTokens <= 0) return null;
  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
  };
}

function isUserAuthor(author: string): boolean {
  const normalized = author.trim().toLowerCase();
  return normalized === "user" || normalized === "human";
}

/** Detect ADK missing/unknown session failures from stdout/stderr. */
export function isAdkUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`.toLowerCase();
  return (
    haystack.includes("session not found") ||
    haystack.includes("unknown session") ||
    haystack.includes("no such session") ||
    /session[_\s-]?id.*(missing|invalid|not found)/i.test(haystack)
  );
}

/** Detect google-adk major-version mismatch messaging. */
export function isAdkVersionIncompatibleError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`.toLowerCase();
  return (
    haystack.includes("requires google-adk") ||
    (haystack.includes("adk 1.") && haystack.includes("unsupported")) ||
    haystack.includes("incompatible with adk 1")
  );
}

export function parseAdkJsonl(stdout: string): AdkParseResult {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let sessionId: string | null = null;
  let model: string | null = null;
  let summary: string | null = null;
  let usage: AdkParsedUsage | null = null;
  let errorMessage: string | null = null;
  let hitlPaused = false;
  const authors = new Set<string>();
  let eventCount = 0;

  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    const parsed = parseJson(line);
    if (!parsed) continue;
    eventCount += 1;

    const eventSession =
      asString(parsed.session_id, "").trim() ||
      asString(parsed.sessionId, "").trim() ||
      null;
    if (eventSession) sessionId = eventSession;

    const author = asString(parsed.author, "").trim();
    if (author) authors.add(author);

    const modelVersion =
      asString(parsed.modelVersion, "").trim() || asString(parsed.model_version, "").trim();
    if (modelVersion) model = modelVersion;

    const eventError =
      asString(parsed.errorMessage, "").trim() ||
      asString(parsed.error_message, "").trim() ||
      asString(parsed.errorCode, "").trim() ||
      asString(parsed.error_code, "").trim();
    if (eventError) errorMessage = eventError;

    const longRunning = parsed.longRunningToolIds ?? parsed.long_running_tool_ids;
    if (Array.isArray(longRunning) && longRunning.length > 0) {
      hitlPaused = true;
    }

    const nextUsage = readUsage(parsed.usageMetadata ?? parsed.usage_metadata ?? parsed.usage);
    if (nextUsage) {
      const prevUsage: AdkParsedUsage = usage ?? { inputTokens: 0, outputTokens: 0 };
      const cachedTotal =
        (prevUsage.cachedInputTokens ?? 0) + (nextUsage.cachedInputTokens ?? 0);
      const merged: AdkParsedUsage = {
        inputTokens: prevUsage.inputTokens + nextUsage.inputTokens,
        outputTokens: prevUsage.outputTokens + nextUsage.outputTokens,
      };
      if (cachedTotal > 0) merged.cachedInputTokens = cachedTotal;
      usage = merged;
    }

    const text = extractTextFromContent(parsed.content);
    if (text && author && !isUserAuthor(author)) {
      summary = text;
    } else if (text && !author && !summary) {
      summary = text;
    }

    // ADK 2.x workflow node structured output
    if (parsed.output !== undefined && parsed.output !== null && summary == null) {
      if (typeof parsed.output === "string" && parsed.output.trim()) {
        summary = parsed.output.trim();
      } else {
        try {
          summary = JSON.stringify(parsed.output);
        } catch {
          // ignore non-serializable output
        }
      }
    }
  }

  return {
    sessionId,
    model,
    summary,
    usage,
    errorMessage,
    hitlPaused,
    authors: [...authors],
    eventCount,
  };
}

export function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}
