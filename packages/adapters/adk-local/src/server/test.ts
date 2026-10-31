import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asString,
  ensureCommandResolvable,
  ensurePathInEnv,
  parseObject,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { MIN_ADK_MAJOR_VERSION } from "../index.js";
import { resolveAgentRuntimeEndpoint } from "./agent-runtime.js";
import { ADK_VERSION_PROBE_SCRIPT, summarizeAdkVersionProbe } from "./version.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function resolveRuntimeMode(config: Record<string, unknown>): "local" | "agent_runtime" {
  const raw = asString(config.runtime, asString(config.engine, "local")).trim().toLowerCase();
  if (raw === "agent_runtime" || raw === "agent_engine" || raw === "runtime" || raw === "remote") {
    return "agent_runtime";
  }
  return "local";
}

async function testLocalEnvironment(
  ctx: AdapterEnvironmentTestContext,
  config: Record<string, unknown>,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const command = asString(config.command, "adk");
  const pythonCommand = asString(config.pythonCommand, "python3");
  const agentDir = asString(config.agentDir, "").trim();
  const cwd = asString(config.cwd, agentDir ? path.dirname(agentDir) : process.cwd());
  const runId = `adk-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const runtimeEnv = ensurePathInEnv({ ...process.env });

  checks.push({
    code: "adk_runtime_mode",
    level: "info",
    message: "Runtime mode: local ADK CLI",
  });

  if (!agentDir) {
    checks.push({
      code: "adk_agent_dir_missing",
      level: "error",
      message: "agentDir is required for local runtime",
      hint: "Set adapterConfig.agentDir to an absolute ADK agent package path",
    });
  } else if (!path.isAbsolute(agentDir)) {
    checks.push({
      code: "adk_agent_dir_not_absolute",
      level: "error",
      message: `agentDir must be absolute (got "${agentDir}")`,
    });
  } else {
    const stat = await fs.stat(agentDir).catch(() => null);
    if (!stat?.isDirectory()) {
      checks.push({
        code: "adk_agent_dir_missing_path",
        level: "error",
        message: `agentDir is not a directory: ${agentDir}`,
      });
    } else {
      const hasAgentPy = await fs.access(path.join(agentDir, "agent.py")).then(() => true).catch(() => false);
      const hasInit = await fs.access(path.join(agentDir, "__init__.py")).then(() => true).catch(() => false);
      if (!hasAgentPy && !hasInit) {
        checks.push({
          code: "adk_agent_dir_invalid",
          level: "error",
          message: "agentDir must contain agent.py or __init__.py exporting root_agent",
        });
      } else {
        checks.push({
          code: "adk_agent_dir_ok",
          level: "info",
          message: `ADK agent package found at ${agentDir}`,
        });
      }
    }
  }

  try {
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({
      code: "adk_cli_resolvable",
      level: "info",
      message: `ADK CLI resolvable as "${command}"`,
    });
  } catch (error) {
    checks.push({
      code: "adk_cli_unresolvable",
      level: "error",
      message: `ADK CLI not found ("${command}")`,
      detail: error instanceof Error ? error.message : String(error),
      hint: `Install Google ADK 2.x: pip install "google-adk>=${MIN_ADK_MAJOR_VERSION}"`,
    });
  }

  try {
    await ensureCommandResolvable(pythonCommand, cwd, runtimeEnv);
    const probe = await runChildProcess(runId, pythonCommand, ["-c", ADK_VERSION_PROBE_SCRIPT], {
      cwd,
      env: {},
      timeoutSec: 30,
      graceSec: 5,
      onLog: async () => {},
    });
    const summary = summarizeAdkVersionProbe(probe.stdout, probe.stderr);
    if ((probe.exitCode ?? 1) !== 0 || !summary.version) {
      checks.push({
        code: "adk_package_missing",
        level: "error",
        message: "google-adk Python package is not installed",
        detail: summary.detail,
        hint: `pip install "google-adk>=${MIN_ADK_MAJOR_VERSION}"`,
      });
    } else if (!summary.ok) {
      checks.push({
        code: "adk_version_unsupported",
        level: "error",
        message: `google-adk ${summary.version} is installed; Paperclip requires ADK ${MIN_ADK_MAJOR_VERSION}.x`,
        hint: `Upgrade with: pip install -U "google-adk>=${MIN_ADK_MAJOR_VERSION}"`,
      });
    } else {
      checks.push({
        code: "adk_version_ok",
        level: "info",
        message: `google-adk ${summary.version} detected (ADK 2.x compatible)`,
      });
    }
  } catch (error) {
    checks.push({
      code: "adk_version_probe_failed",
      level: "error",
      message: `Could not probe google-adk with "${pythonCommand}"`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const envConfig = parseObject(config.env);
  const hasGoogleKey =
    Boolean(process.env.GOOGLE_API_KEY?.trim()) ||
    Boolean(process.env.GEMINI_API_KEY?.trim()) ||
    Boolean(asString(envConfig.GOOGLE_API_KEY, "").trim()) ||
    Boolean(asString(envConfig.GEMINI_API_KEY, "").trim());
  if (!hasGoogleKey) {
    checks.push({
      code: "adk_api_key_missing",
      level: "warn",
      message: "No GOOGLE_API_KEY / GEMINI_API_KEY detected in config.env or process environment",
      hint: "Set an API key, or configure Vertex ADC with gcloud auth application-default login",
    });
  } else {
    checks.push({
      code: "adk_api_key_present",
      level: "info",
      message: "Gemini/Google API key present for ADK runs",
    });
  }

  const useLocalStorage = asBoolean(config.useLocalStorage, true);
  checks.push({
    code: "adk_storage_mode",
    level: "info",
    message: useLocalStorage
      ? "Local .adk session storage enabled"
      : "Local .adk session storage disabled",
  });

  return {
    adapterType: "adk_local",
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}

function testAgentRuntimeEnvironment(
  config: Record<string, unknown>,
): AdapterEnvironmentTestResult {
  const checks: AdapterEnvironmentCheck[] = [];
  checks.push({
    code: "adk_runtime_mode",
    level: "info",
    message: "Runtime mode: Google Agent Runtime (Reasoning Engine)",
  });

  try {
    const endpoint = resolveAgentRuntimeEndpoint(config);
    checks.push({
      code: "adk_runtime_endpoint_ok",
      level: "info",
      message: `Agent Runtime resource: ${endpoint.resourceName}`,
      detail: endpoint.queryUrl,
    });
  } catch (error) {
    checks.push({
      code: "adk_runtime_endpoint_invalid",
      level: "error",
      message: error instanceof Error ? error.message : String(error),
      hint: "Set resourceName, or project + agentEngineId (+ optional location)",
    });
  }

  const envConfig = parseObject(config.env);
  const hasBearer =
    Boolean(asString(config.accessToken, "").trim()) ||
    Boolean(process.env.GOOGLE_ACCESS_TOKEN?.trim()) ||
    Boolean(asString(envConfig.GOOGLE_ACCESS_TOKEN, "").trim());
  const hasApiKey =
    Boolean(asString(config.expressApiKey, "").trim()) ||
    Boolean(process.env.GOOGLE_API_KEY?.trim()) ||
    Boolean(process.env.GEMINI_API_KEY?.trim()) ||
    Boolean(asString(envConfig.GOOGLE_API_KEY, "").trim()) ||
    Boolean(asString(envConfig.GEMINI_API_KEY, "").trim());

  if (!hasBearer && !hasApiKey) {
    checks.push({
      code: "adk_runtime_auth_missing",
      level: "error",
      message: "Agent Runtime auth missing",
      hint: "Provide GOOGLE_ACCESS_TOKEN (ADC bearer) or GOOGLE_API_KEY / GEMINI_API_KEY for Express mode",
    });
  } else if (hasBearer) {
    checks.push({
      code: "adk_runtime_auth_bearer",
      level: "info",
      message: "Bearer access token configured for Agent Runtime",
    });
  } else {
    checks.push({
      code: "adk_runtime_auth_api_key",
      level: "info",
      message: "API key configured for Agent Runtime (Express / API-key auth)",
    });
  }

  return {
    adapterType: "adk_local",
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = parseObject(ctx.config);
  const mode = resolveRuntimeMode(config);
  if (mode === "agent_runtime") {
    return testAgentRuntimeEnvironment(config);
  }
  return testLocalEnvironment(ctx, config);
}
