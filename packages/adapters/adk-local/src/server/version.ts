import { asString } from "@paperclipai/adapter-utils/server-utils";
import { MIN_ADK_MAJOR_VERSION } from "../index.js";

export type AdkVersionProbe = {
  ok: boolean;
  version: string | null;
  major: number | null;
  detail: string | null;
};

const VERSION_RE = /(\d+)\.(\d+)\.(\d+(?:[a-zA-Z0-9._-]*)?)/;

export function parseAdkVersionString(raw: string): { version: string; major: number } | null {
  const match = raw.match(VERSION_RE);
  if (!match) return null;
  return {
    version: `${match[1]}.${match[2]}.${match[3]}`,
    major: Number(match[1]),
  };
}

export function isSupportedAdkMajor(major: number | null | undefined): boolean {
  return typeof major === "number" && Number.isFinite(major) && major >= MIN_ADK_MAJOR_VERSION;
}

export function summarizeAdkVersionProbe(stdout: string, stderr: string): AdkVersionProbe {
  const haystack = `${stdout}\n${stderr}`.trim();
  const parsed = parseAdkVersionString(haystack);
  if (!parsed) {
    return {
      ok: false,
      version: null,
      major: null,
      detail: asString(haystack, "").slice(0, 240) || "Could not parse google-adk version",
    };
  }
  return {
    ok: isSupportedAdkMajor(parsed.major),
    version: parsed.version,
    major: parsed.major,
    detail: parsed.version,
  };
}

export const ADK_VERSION_PROBE_SCRIPT =
  "import importlib.metadata as m; print(m.version('google-adk'))";
