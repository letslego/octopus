import pc from "picocolors";

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
  return parts
    .map((partRaw) => {
      const part = asRecord(partRaw);
      return part ? asString(part.text).trim() : "";
    })
    .filter(Boolean)
    .join("");
}

export function printAdkStreamEvent(raw: string, debug: boolean): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  if (!trimmed.startsWith("{")) {
    if (debug) console.log(pc.gray(raw));
    return;
  }

  const parsed = safeJsonParse(trimmed);
  if (!parsed) {
    if (debug) console.log(pc.gray(raw));
    return;
  }

  const author = asString(parsed.author, "agent");
  const sessionId = asString(parsed.session_id) || asString(parsed.sessionId);
  const nodePath =
    asString(parsed.node_path) ||
    asString(asRecord(parsed.nodeInfo)?.path) ||
    asString(asRecord(parsed.node_info)?.path);
  const text = extractText(parsed.content);
  const error =
    asString(parsed.errorMessage).trim() || asString(parsed.error_message).trim();

  if (sessionId || nodePath) {
    console.log(
      pc.blue(
        `adk${sessionId ? ` session=${sessionId}` : ""}${nodePath ? ` node=${nodePath}` : ""}`,
      ),
    );
  }

  if (error) {
    console.log(pc.red(`[${author}] error: ${error}`));
  } else if (text) {
    console.log(pc.green(`[${author}]: ${text}`));
  } else if (debug) {
    console.log(pc.gray(trimmed));
  }

  const usage = asRecord(parsed.usageMetadata) ?? asRecord(parsed.usage_metadata);
  if (usage) {
    const input = asNumber(usage.promptTokenCount, asNumber(usage.input_tokens, 0));
    const output = asNumber(usage.candidatesTokenCount, asNumber(usage.output_tokens, 0));
    console.log(pc.cyan(`usage: in=${input} out=${output}`));
  }
}
