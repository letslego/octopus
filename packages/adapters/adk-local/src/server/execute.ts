import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  DEFAULT_PAPERCLIP_CONVERSATION_PROMPT_TEMPLATE,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  isForbiddenConfigEnvKey,
  isPaperclipRuntimeEnvKey,
  joinPromptSections,
  parseObject,
  renderTemplate,
  resolveCommandForLogs,
  runChildProcess,
  selectInitialCommunicationGuidance,
  selectPaperclipPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_ADK_LOCAL_MODEL } from "../index.js";
import { executeAgentRuntimeQuery } from "./agent-runtime.js";
import {
  firstNonEmptyLine,
  isAdkUnknownSessionError,
  isAdkVersionIncompatibleError,
  parseAdkJsonl,
  type AdkParseResult,
} from "./parse.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimeMode(config: Record<string, unknown>): "local" | "agent_runtime" {
  const raw = asString(config.runtime, asString(config.engine, "local")).trim().toLowerCase();
  if (raw === "agent_runtime" || raw === "agent_engine" || raw === "runtime" || raw === "remote") {
    return "agent_runtime";
  }
  return "local";
}

/** Ensure ADK / google-genai see a usable API key regardless of Paperclip key name. */
function normalizeGoogleApiKeys(env: Record<string, string>): Record<string, string> {
  const next = { ...env };
  const gemini = next.GEMINI_API_KEY?.trim();
  const google = next.GOOGLE_API_KEY?.trim();
  if (gemini && !google) next.GOOGLE_API_KEY = gemini;
  if (google && !gemini) next.GEMINI_API_KEY = google;
  return next;
}

async function resolveAgentDir(config: Record<string, unknown>): Promise<string> {
  const agentDir = asString(config.agentDir, "").trim();
  if (!agentDir) {
    throw new Error("adk_local requires adapterConfig.agentDir (absolute path to the ADK agent package)");
  }
  if (!path.isAbsolute(agentDir)) {
    throw new Error(`adk_local agentDir must be an absolute path (got "${agentDir}")`);
  }
  const stat = await fs.stat(agentDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`adk_local agentDir is not a directory: ${agentDir}`);
  }
  const hasAgentPy = await pathExists(path.join(agentDir, "agent.py"));
  const hasInit = await pathExists(path.join(agentDir, "__init__.py"));
  if (!hasAgentPy && !hasInit) {
    throw new Error(
      `adk_local agentDir must contain agent.py or __init__.py exporting root_agent (got ${agentDir})`,
    );
  }
  return path.resolve(agentDir);
}

async function readInstructions(filePath: string): Promise<string> {
  const text = await fs.readFile(filePath, "utf8");
  return text.trim();
}

function buildPrompt(
  ctx: AdapterExecutionContext,
  instructions: string | null,
  resumedSession: boolean,
): string {
  const config = parseObject(ctx.config);
  const conversationMode = ctx.context.conversationMode === true;
  const promptTemplate = asString(
    config.promptTemplate,
    conversationMode
      ? DEFAULT_PAPERCLIP_CONVERSATION_PROMPT_TEMPLATE
      : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  );
  const templateData = {
    agentId: ctx.agent.id,
    companyId: ctx.agent.companyId,
    runId: ctx.runId,
    company: { id: ctx.agent.companyId },
    agent: ctx.agent,
    run: { id: ctx.runId },
    context: ctx.context,
  };
  const sections = selectPaperclipPromptSections(ctx.context, {
    resumedSession,
    includeCommunicationGuidance: false,
  });
  const renderedHeartbeat =
    resumedSession && sections.wakePrompt.length > 0
      ? ""
      : renderTemplate(promptTemplate, templateData);
  return joinPromptSections([
    selectInitialCommunicationGuidance(ctx.context, { resumedSession }),
    instructions ?? "",
    sections.wakePrompt,
    sections.taskContextNote,
    renderedHeartbeat,
  ]);
}

function buildBaseEnv(ctx: AdapterExecutionContext): Record<string, string> {
  const config = parseObject(ctx.config);
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {
    ...buildPaperclipEnv(ctx.agent, ctx.agentIdentity),
    ...buildRuntimeToolsEnv(ctx.runtimeTools),
  };
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v !== "string") continue;
    if (isForbiddenConfigEnvKey(k)) continue;
    if (isPaperclipRuntimeEnvKey(k) && k in env) continue;
    env[k] = v;
  }
  env.PAPERCLIP_RUN_ID = ctx.runId;
  if (ctx.authToken) env.PAPERCLIP_API_KEY = ctx.authToken;

  const taskId = asString(ctx.context.taskId, asString(ctx.context.issueId, ""));
  if (taskId) env.PAPERCLIP_TASK_ID = taskId;
  const wakeReason = asString(ctx.context.wakeReason, "");
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  const wakeCommentId = asString(ctx.context.wakeCommentId, asString(ctx.context.commentId, ""));
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  const approvalId = asString(ctx.context.approvalId, "");
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  const approvalStatus = asString(ctx.context.approvalStatus, "");
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (Array.isArray(ctx.context.issueIds)) {
    env.PAPERCLIP_LINKED_ISSUE_IDS = ctx.context.issueIds.map(String).join(",");
  }
  return normalizeGoogleApiKeys(env);
}

function toFailureResult(input: {
  parsed: AdkParseResult;
  sessionId: string | null;
  sessionIdentity: Record<string, string>;
  model: string | null;
  errorMessage: string;
  exitCode?: number;
  resultJson?: Record<string, unknown>;
  clearSession?: boolean;
  usage?: AdkParseResult["usage"];
  summary?: string | null;
}): AdapterExecutionResult {
  return {
    exitCode: input.exitCode ?? 1,
    signal: null,
    timedOut: false,
    errorMessage: input.errorMessage,
    summary: input.summary ?? input.parsed.summary,
    usage: input.usage ?? input.parsed.usage ?? undefined,
    provider: "google",
    model: input.model,
    sessionParams: input.sessionId ? { sessionId: input.sessionId, ...input.sessionIdentity } : null,
    sessionDisplayId: input.sessionId,
    resultJson: input.resultJson,
    clearSession: input.clearSession || undefined,
  };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  let spawned = false;
  try {
    return await executeAdk({
      ...ctx,
      onSpawn: async (meta) => {
        spawned = true;
        await ctx.onSpawn?.(meta);
      },
    });
  } catch (error) {
    if (spawned) throw error;
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeAdk(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const runtimeMode = resolveRuntimeMode(config);
  if (runtimeMode === "agent_runtime") {
    return executeRemoteAgentRuntime(ctx);
  }
  return executeLocalAdkCli(ctx);
}

async function executeRemoteAgentRuntime(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const env = buildBaseEnv(ctx);
  const model = asString(config.model, DEFAULT_ADK_LOCAL_MODEL).trim() || null;
  const instructionsPath = asString(config.instructionsFilePath, "").trim();
  const instructions = instructionsPath ? await readInstructions(instructionsPath) : null;

  const runtimeSessionId =
    readNonEmptyString(ctx.runtime.sessionParams?.sessionId) ??
    readNonEmptyString(ctx.runtime.sessionId);
  const resourceHint =
    readNonEmptyString(ctx.runtime.sessionParams?.resourceName) ??
    asString(config.resourceName, asString(config.agentEngineId, "")).trim();

  const prompt = buildPrompt(ctx, instructions, Boolean(runtimeSessionId));
  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: "adk_local",
      command: "agent_runtime",
      cwd: process.cwd(),
      commandArgs: ["async_stream_query", resourceHint || "<resource>"],
      env: buildInvocationEnvForLogs(env, { includeRuntimeKeys: [] }),
    });
  }

  const result = await executeAgentRuntimeQuery({
    config,
    env,
    message: prompt,
    sessionId: runtimeSessionId,
    onLog: ctx.onLog,
  });

  const sessionIdentity = {
    runtime: "agent_runtime",
    ...(resourceHint ? { resourceName: resourceHint } : {}),
  };
  const resolvedModel = result.parsed.model ?? model;

  if (result.parsed.hitlPaused) {
    return toFailureResult({
      parsed: result.parsed,
      sessionId: result.sessionId,
      sessionIdentity,
      model: resolvedModel,
      exitCode: 2,
      errorMessage:
        result.parsed.errorMessage ??
        "Google Agent Runtime paused for human-in-the-loop input. Wake again to continue the same session.",
      resultJson: { hitlPaused: true, runtime: "agent_runtime" },
    });
  }

  if (result.parsed.errorMessage) {
    return toFailureResult({
      parsed: result.parsed,
      sessionId: result.sessionId,
      sessionIdentity,
      model: resolvedModel,
      errorMessage: result.parsed.errorMessage,
      resultJson: { runtime: "agent_runtime", httpStatus: result.httpStatus },
    });
  }

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    summary: result.parsed.summary,
    usage: result.parsed.usage ?? undefined,
    provider: "google",
    model: resolvedModel,
    sessionParams: { sessionId: result.sessionId, ...sessionIdentity },
    sessionDisplayId: result.sessionId,
    resultJson: {
      runtime: "agent_runtime",
      eventCount: result.parsed.eventCount,
      authors: result.parsed.authors,
      httpStatus: result.httpStatus,
    },
  };
}

async function executeLocalAdkCli(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, onLog, onMeta } = ctx;
  const config = parseObject(ctx.config);
  const agentDir = await resolveAgentDir(config);
  const cwd = asString(config.cwd, path.dirname(agentDir));
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const command = asString(config.command, "adk");
  const model = asString(config.model, DEFAULT_ADK_LOCAL_MODEL).trim();
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);
  const extraArgs = asStringArray(config.extraArgs);
  const sessionServiceUri = asString(config.sessionServiceUri, "").trim();
  const useLocalStorage = asBoolean(config.useLocalStorage, true);

  const env = buildBaseEnv(ctx);
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  await ensureCommandResolvable(command, cwd, runtimeEnv);
  const resolvedCommand = await resolveCommandForLogs(command, cwd, runtimeEnv);
  const loggedEnv = buildInvocationEnvForLogs(env, {
    runtimeEnv,
    includeRuntimeKeys: ["HOME"],
    resolvedCommand,
  });

  const instructionsPath = asString(config.instructionsFilePath, "").trim();
  const instructions = instructionsPath ? await readInstructions(instructionsPath) : null;

  const runtimeSessionId =
    readNonEmptyString(runtime.sessionParams?.sessionId) ??
    readNonEmptyString(runtime.sessionId);
  const runtimeSessionAgentDir =
    readNonEmptyString(runtime.sessionParams?.agentDir) ??
    readNonEmptyString(runtime.sessionParams?.cwd);
  const canResumeSession =
    Boolean(runtimeSessionId) &&
    (!runtimeSessionAgentDir || path.resolve(runtimeSessionAgentDir) === path.resolve(agentDir));

  type RunAttempt = {
    sessionId: string | null;
    proc: Awaited<ReturnType<typeof runChildProcess>>;
    parsed: AdkParseResult;
  };

  async function runAttempt(sessionId: string | null): Promise<RunAttempt> {
    const effectiveSessionId = sessionId ?? randomUUID();
    const prompt = buildPrompt(ctx, instructions, Boolean(sessionId));
    const args = ["run", agentDir, prompt, "--jsonl", "--session_id", effectiveSessionId];
    if (model) args.push("--default_llm_model", model);
    if (sessionServiceUri) {
      args.push("--session_service_uri", sessionServiceUri);
    } else if (useLocalStorage) {
      args.push("--use_local_storage");
    } else {
      args.push("--no_use_local_storage");
    }
    if (extraArgs.length > 0) args.push(...extraArgs);

    if (onMeta) {
      await onMeta({
        adapterType: "adk_local",
        command: resolvedCommand,
        cwd,
        commandArgs: args.map((arg) => (arg === prompt ? "<prompt>" : arg)),
        env: loggedEnv,
      });
    }

    await onLog(
      "stderr",
      `[paperclip] adk_local invoking Google ADK 2.x runtime (local CLI): ${resolvedCommand} run ${agentDir}\n`,
    );
    const proc = await runChildProcess(runId, command, args, {
      cwd,
      env,
      timeoutSec,
      graceSec,
      onLog,
      onSpawn: ctx.onSpawn,
    });
    const parsed = parseAdkJsonl(proc.stdout);
    return {
      sessionId: parsed.sessionId ?? effectiveSessionId,
      proc,
      parsed,
    };
  }

  let attempt = await runAttempt(canResumeSession ? runtimeSessionId : null);
  let clearSession = false;

  if (
    canResumeSession &&
    runtimeSessionId &&
    !attempt.proc.timedOut &&
    ((attempt.proc.exitCode ?? 0) !== 0 || Boolean(attempt.parsed.errorMessage)) &&
    isAdkUnknownSessionError(attempt.proc.stdout, attempt.proc.stderr)
  ) {
    await onLog("stderr", "[paperclip] Stored ADK session was unknown; retrying with a fresh session\n");
    attempt = await runAttempt(null);
    clearSession = true;
  }

  const { proc, parsed } = attempt;
  const provider = "google";
  const resolvedModel = parsed.model ?? (model || null);
  const sessionIdentity = { agentDir, cwd, runtime: "local" };

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
      provider,
      model: resolvedModel,
      sessionParams: attempt.sessionId ? { sessionId: attempt.sessionId, ...sessionIdentity } : null,
      sessionDisplayId: attempt.sessionId,
      clearSession: clearSession || undefined,
    };
  }

  if (isAdkVersionIncompatibleError(proc.stdout, proc.stderr)) {
    return {
      exitCode: proc.exitCode ?? 1,
      signal: proc.signal,
      timedOut: false,
      errorMessage:
        "google-adk appears incompatible. Paperclip's adk_local adapter requires Google ADK Python 2.x (`pip install 'google-adk>=2'`).",
      provider,
      model: resolvedModel,
      resultJson: { stdout: proc.stdout, stderr: proc.stderr },
      clearSession: clearSession || undefined,
    };
  }

  if ((proc.exitCode ?? 0) === 2 || parsed.hitlPaused) {
    return toFailureResult({
      parsed,
      sessionId: attempt.sessionId,
      sessionIdentity,
      model: resolvedModel,
      exitCode: proc.exitCode ?? 2,
      errorMessage:
        parsed.errorMessage ??
        "Google ADK paused for human-in-the-loop input. Wake the agent again with the same session to continue.",
      resultJson: { hitlPaused: true, eventCount: parsed.eventCount, authors: parsed.authors },
      clearSession,
    });
  }

  // ADK may exit 0 while still emitting errorCode/errorMessage JSONL events
  // (for example missing API key). Treat those as failed runs.
  if ((proc.exitCode ?? 0) !== 0 || parsed.errorMessage) {
    const detail =
      parsed.errorMessage ||
      firstNonEmptyLine(proc.stderr) ||
      firstNonEmptyLine(proc.stdout) ||
      `adk exited with code ${proc.exitCode ?? -1}`;
    return {
      exitCode: (proc.exitCode ?? 0) !== 0 ? proc.exitCode : 1,
      signal: proc.signal,
      timedOut: false,
      errorMessage: detail,
      provider,
      model: resolvedModel,
      usage: parsed.usage ?? undefined,
      sessionParams: attempt.sessionId ? { sessionId: attempt.sessionId, ...sessionIdentity } : null,
      sessionDisplayId: attempt.sessionId,
      resultJson: { stdout: proc.stdout, stderr: proc.stderr, eventCount: parsed.eventCount },
      clearSession: clearSession || undefined,
    };
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    summary: parsed.summary,
    usage: parsed.usage ?? undefined,
    provider,
    model: resolvedModel,
    sessionParams: attempt.sessionId ? { sessionId: attempt.sessionId, ...sessionIdentity } : null,
    sessionDisplayId: attempt.sessionId,
    resultJson: {
      runtime: "local",
      eventCount: parsed.eventCount,
      authors: parsed.authors,
    },
    clearSession: clearSession || undefined,
  };
}
