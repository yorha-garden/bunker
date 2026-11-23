import {
  createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition,
  createLsToolDefinition, createReadToolDefinition, createWriteToolDefinition,
  type ExtensionAPI, type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { Text, Container, Image, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { BunkerEditor, BunkerHeader, CtfOverlay, createBunkerFooter, createExecutionWidget, createPodWidget, createResponseCard, type ActiveExecution } from "./components.ts";
import { transformAssistantMarkdown } from "./response.ts";
import { installCodePanelRenderer } from "./code-panel.ts";
import { installToolOutputAffordance } from "./tool-output-affordance.ts";
import { registerToolCards, type PiToolOptions } from "./tool-cards-register.ts";
import { initialProviderState, providerStateAfterHttp, providerStateAfterMessage, type ProviderLinkState } from "./provider-state.ts";
import { installTransmissionMetadataRenderer } from "./transmission-metadata.ts";
import { calculateRequestTokens, type TransmissionTelemetry } from "./transmission-format.ts";
import { PROVIDER_USAGE_REFRESH_INTERVAL_MS, codexAccountEmailFromToken, openAIUsageAfterHeaders, queryCodexUsage, shouldPollProviderUsage, type ProviderUsageState } from "./provider-usage.ts";
import { CTF_PHASES, EMPTY_CTF_STATE, applyCtfUpdate, restoreCtfState, type CtfState } from "./ctf-state.ts";
import { GLYPH, LABEL, UI, type OperationalMode } from "./tokens.ts";
import { CTF_TOOL_NAME, activeToolsForMode } from "./mode.ts";
import { EMPTY_BUILD_FLEET, buildFleetLabel, buildModeSystemPrompt, requestBuildFleet, type BuildFleetState } from "./build-orchestration.ts";

const CTF_TOOL = CTF_TOOL_NAME;
const STATE_ENTRY = "yorha-ctf-state";
const TRANSMISSION_ENTRY = "yorha-transmission-telemetry";

const schema = Type.Object({
  challenge: Type.Optional(Type.String({ maxLength: 80, description: "Challenge designation" })),
  category: Type.Optional(Type.String({ maxLength: 80, description: "CTF category" })),
  target: Type.Optional(Type.String({ maxLength: 80, description: "Target service, file, or endpoint" })),
  phase: Type.Optional(StringEnum(CTF_PHASES)),
  evidence: Type.Optional(Type.Array(Type.String({ maxLength: 160 }), { maxItems: 12 })),
  verified: Type.Optional(Type.Boolean({ description: "Whether the flag has been reproducibly verified; never provide the flag text" })),
  overrideReason: Type.Optional(Type.String({ maxLength: 160, description: "Required for phase regressions or skipped phases" })),
});

export default function yorhaBunkerHud(pi: ExtensionAPI): void {
  const responseIconBase64 = readFileSync(new URL("./assets/generated/robot-face-sharp.png", import.meta.url)).toString("base64");
  const activeExecutions = new Map<string, ActiveExecution>();
  let providerState: ProviderLinkState = "offline";
  let providerUsage: ProviderUsageState = { provider: "", status: "unsupported" };
  let providerUsageController: AbortController | undefined;
  let providerUsageRefreshStartedAt = 0;
  let providerUsageTimer: ReturnType<typeof setInterval> | undefined;
  let providerResponseHealthy = false;
  let providerRequestStartedAt: number | undefined;
  const transmissionTelemetry = new Map<number, TransmissionTelemetry>();
  let removeCodePanelPatch: (() => void) | undefined;
  let removeToolOutputAffordancePatch: (() => void) | undefined;
  let removeTransmissionMetadataPatch: (() => void) | undefined;
  let mode: OperationalMode = "build";
  let state: CtfState = { ...EMPTY_CTF_STATE, evidence: [] };
  let overlayDone: (() => void) | undefined;
  let overlayComponent: CtfOverlay | undefined;
  let overlayOpen = false;
  let currentContext: ExtensionContext | undefined;
  let buildFleet: BuildFleetState = { ...EMPTY_BUILD_FLEET, entries: [] };
  let buildFleetRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let buildFleetRefreshInFlight = false;

  const stopBuildFleetPolling = () => {
    if (buildFleetRefreshTimer) clearTimeout(buildFleetRefreshTimer);
    buildFleetRefreshTimer = undefined;
  };

  const refreshBuildFleet = async (ctx: ExtensionContext) => {
    if (buildFleetRefreshInFlight || mode !== "build" || currentContext !== ctx) return;
    buildFleetRefreshInFlight = true;
    const next = await requestBuildFleet(pi);
    buildFleetRefreshInFlight = false;
    if (mode !== "build" || currentContext !== ctx) return;
    buildFleet = next;
    refreshStatus(ctx);
    stopBuildFleetPolling();
    if (next.totalActive > 0) {
      buildFleetRefreshTimer = setTimeout(() => void refreshBuildFleet(ctx), 1000);
    }
  };

  const stopProviderUsagePolling = () => {
    if (providerUsageTimer) clearInterval(providerUsageTimer);
    providerUsageTimer = undefined;
  };

  const startProviderUsagePolling = (ctx: ExtensionContext) => {
    stopProviderUsagePolling();
    providerUsageTimer = setInterval(() => {
      if (currentContext !== ctx) return;
      if (ctx.model?.provider === "openai-codex") void refreshProviderUsage(ctx);
      else refreshStatus(ctx);
    }, PROVIDER_USAGE_REFRESH_INTERVAL_MS);
  };

  const refreshStatus = (ctx: ExtensionContext) => {
    const theme = ctx.ui.theme;
    const text = mode === "hacking"
      ? theme.fg("accent", `${GLYPH.linked} HACKING · ${state.phase}`)
      : theme.fg(buildFleet.totalActive > 0 ? "accent" : "dim", `${GLYPH.linked} BUILD${buildFleet.totalActive > 0 ? ` · ${buildFleet.totalActive} ACTIVE` : ""}`);
    ctx.ui.setStatus("yorha-mode", text);
    ctx.ui.setWidget("yorha-pod", (_tui, widgetTheme) => createPodWidget(widgetTheme, mode, state));
  };

  const refreshProviderUsage = async (ctx: ExtensionContext, force = false) => {
    const provider = ctx.model?.provider ?? "";
    if (provider !== "openai-codex") {
      providerUsageController?.abort();
      providerUsageController = undefined;
      if (providerUsage.provider !== provider) {
        providerUsage = provider === "openai"
          ? { provider: "openai", status: "unavailable" }
          : { provider, status: "unsupported" };
      }
      refreshStatus(ctx);
      return;
    }
    if (!shouldPollProviderUsage(provider, providerUsageRefreshStartedAt, Date.now(), force)) {
      refreshStatus(ctx);
      return;
    }
    providerUsageController?.abort();
    const controller = new AbortController();
    providerUsageController = controller;
    providerUsageRefreshStartedAt = Date.now();
    if (providerUsage.provider !== provider || providerUsage.status !== "available") {
      providerUsage = { provider, status: "loading" };
      refreshStatus(ctx);
    }
    const auth = await ctx.modelRegistry.getProviderAuth("openai-codex");
    if (controller.signal.aborted || providerUsageController !== controller) return;
    const expectedEmail = codexAccountEmailFromToken(auth?.auth.apiKey);
    const usage = await queryCodexUsage({ expectedEmail, signal: controller.signal });
    if (controller.signal.aborted || providerUsageController !== controller) return;
    providerUsageController = undefined;
    providerUsage = usage ?? { provider, status: "unavailable", updatedAt: Date.now() };
    refreshStatus(ctx);
  };

  const refreshExecutionWidget = (ctx: ExtensionContext) => {
    if (activeExecutions.size === 0) {
      ctx.ui.setWidget("yorha-execution", undefined);
      return;
    }
    const executions = [...activeExecutions.values()];
    ctx.ui.setWidget("yorha-execution", (_tui, theme) => createExecutionWidget(theme, executions));
  };

  const setToolForMode = () => {
    const active = pi.getActiveTools();
    const available = pi.getAllTools().map((tool) => tool.name);
    const next = activeToolsForMode(active, mode, available);
    if (next.length !== active.length || next.some((name, index) => name !== active[index])) pi.setActiveTools(next);
  };

  const closeOverlay = () => {
    overlayComponent?.dispose();
    overlayComponent = undefined;
    const done = overlayDone;
    overlayDone = undefined;
    overlayOpen = false;
    done?.();
  };

  const openOverlay = (ctx: ExtensionContext) => {
    if (overlayOpen || ctx.mode !== "tui") return;
    overlayOpen = true;
    let warned = false;
    void ctx.ui.custom<void>(
      (tui, theme, _keybindings, done) => {
        overlayDone = () => done(undefined);
        overlayComponent = new CtfOverlay(theme, () => state, () => tui.requestRender(), closeOverlay);
        return overlayComponent;
      },
      {
        overlay: true,
        overlayOptions: {
          width: UI.panelWidth,
          minWidth: UI.panelWidth,
          maxHeight: "65%",
          anchor: "top-right",
          margin: { top: 2, right: 1, bottom: UI.panelBottomMargin, left: 1 },
          visible: (width, height) => {
            const visible = width >= UI.minWidth && height >= UI.minPanelHeight;
            if (!visible && !warned) {
              warned = true;
              queueMicrotask(() => ctx.ui.notify(`CTF panel requires at least ${UI.minWidth} columns and ${UI.minPanelHeight} rows.`, "warning"));
            }
            return visible;
          },
        },
        onHandle: (handle) => handle.unfocus(),
      },
    ).finally(() => {
      overlayComponent?.dispose();
      overlayComponent = undefined;
      overlayDone = undefined;
      overlayOpen = false;
    });
  };

  const togglePanel = (ctx: ExtensionContext) => {
    if (mode !== "hacking") {
      ctx.ui.notify(LABEL.inactive, "warning");
      return;
    }
    if (overlayOpen) closeOverlay();
    else openOverlay(ctx);
  };

  const applyMode = (next: OperationalMode, ctx: ExtensionContext, notify = true) => {
    mode = next;
    if (mode === "build") closeOverlay();
    else stopBuildFleetPolling();
    setToolForMode();
    refreshStatus(ctx);
    ctx.ui.setTitle(`YoRHa Bunker · ${mode.toUpperCase()}`);
    if (mode === "build") void refreshBuildFleet(ctx);
    if (notify) ctx.ui.notify(`${mode === "hacking" ? "Hacking" : "Build"} mode active.`, "info");
  };

  const toggleMode = (ctx: ExtensionContext) => applyMode(mode === "build" ? "hacking" : "build", ctx);

  pi.on("resources_discover", async () => ({
    skillPaths: [fileURLToPath(new URL("./skills", import.meta.url))],
  }));

  pi.on("before_agent_start", async (event) => {
    if (mode !== "build") return;
    return { systemPrompt: buildModeSystemPrompt(event.systemPrompt) };
  });

  const toolDefinitionFactories = {
    bash: (cwd: string, options: PiToolOptions) => createBashToolDefinition(cwd, options.bash),
    read: (cwd: string, options: PiToolOptions) => createReadToolDefinition(cwd, options.read),
    edit: (cwd: string) => createEditToolDefinition(cwd),
    write: (cwd: string) => createWriteToolDefinition(cwd),
    grep: (cwd: string) => createGrepToolDefinition(cwd),
    find: (cwd: string) => createFindToolDefinition(cwd),
    ls: (cwd: string) => createLsToolDefinition(cwd),
  };
  registerToolCards(pi, {
    cwd: process.cwd(),
    homeDir: homedir(),
    assetsDir: new URL("./assets/generated/", import.meta.url),
    env: process.env,
    metrics: { visibleWidth, truncateToWidth },
    createDefinition: (tool, cwd, options) => toolDefinitionFactories[tool](cwd, options),
    settings: () => pi.getSettings(),
    readFile: (url) => readFileSync(url),
    createImage: (base64, opts) =>
      new Image(base64, "image/png", { fallbackColor: (text) => text },
        { maxWidthCells: opts.maxWidthCells, maxHeightCells: opts.maxHeightCells, filename: opts.filename },
        { widthPx: opts.widthPx, heightPx: opts.heightPx }),
  });

  pi.registerTool({
    name: CTF_TOOL,
    label: "YoRHa CTF Status",
    description: "Update the YoRHa Hacking HUD with reproducible CTF challenge state. Record category, target, ordered phase, concise evidence, and verification status. Never submit or store flag text in this tool.",
    promptSnippet: "Update the CTF Hacking HUD with challenge phase and reproducible evidence",
    promptGuidelines: [
      "Use yorha_ctf_status in Hacking mode whenever CTF category, target, phase, evidence, or verified status changes.",
      "Never pass a flag value to yorha_ctf_status; only mark verified after deriving and reproducing it.",
    ],
    parameters: schema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (mode !== "hacking") throw new Error("YoRHa CTF status is available only in Hacking mode");
      state = applyCtfUpdate(state, params);
      pi.appendEntry(STATE_ENTRY, state);
      refreshStatus(ctx);
      return {
        content: [{ type: "text", text: `HUD updated: ${state.challenge} · ${state.phase} · ${state.evidence.length} evidence record(s) · ${state.verified ? "VERIFIED" : "UNVERIFIED"}` }],
        details: { state },
      };
    },
    renderCall(args, theme) {
      const phase = args.phase ? ` · ${args.phase}` : "";
      return new Text(theme.fg("toolTitle", `${GLYPH.tool} CTF STATUS${phase}`), 0, 0);
    },
    renderResult(result, options, theme) {
      const saved = result.details?.state as CtfState | undefined;
      if (!saved) return new Text(theme.fg("error", "CTF status update failed"), 0, 0);
      let text = theme.fg("success", `${GLYPH.linked} ${saved.phase} · ${saved.verified ? "VERIFIED" : "UNVERIFIED"}`);
      if (options.expanded) {
        text += `\n${theme.fg("dim", `${saved.challenge} · ${saved.category} · ${saved.target}`)}`;
        for (const item of saved.evidence.slice(-5)) text += `\n${theme.fg("muted", `${GLYPH.pointer} ${item.text}`)}`;
      }
      return new Text(text, 0, 0);
    },
  });

  pi.registerEntryRenderer(STATE_ENTRY, () => new Container());
  pi.registerEntryRenderer(TRANSMISSION_ENTRY, () => new Container());
  pi.registerEntryRenderer("yorha-response-card", (_entry, _options, theme) => createResponseCard(theme, responseIconBase64));
  pi.registerMarkdownTransformer((markdown, context) =>
    transformAssistantMarkdown(markdown, context.messageType, context.isStreaming)
  );

  pi.registerShortcut("shift+tab", {
    description: "Toggle YoRHa Build/Hacking mode",
    handler: async (ctx) => toggleMode(ctx),
  });

  pi.registerShortcut("ctrl+shift+h", {
    description: "Toggle YoRHa CTF side panel",
    handler: async (ctx) => togglePanel(ctx),
  });

  pi.registerCommand("yorha-mode", {
    description: "Set or show YoRHa mode: build or hacking",
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      if (!requested) {
        ctx.ui.notify(`YoRHa mode: ${mode}`, "info");
        return;
      }
      if (requested !== "build" && requested !== "hacking") {
        ctx.ui.notify("Usage: /yorha-mode [build|hacking]", "error");
        return;
      }
      applyMode(requested, ctx);
    },
  });

  pi.registerCommand("yorha-panel", {
    description: "Toggle the YoRHa Hacking Unit panel",
    handler: async (_args, ctx) => togglePanel(ctx),
  });

  pi.registerCommand("yorha-agents", {
    description: "Show the YoRHa Build Unit subagent fleet",
    handler: async (_args, ctx) => {
      if (mode !== "build") {
        ctx.ui.notify("Build Unit is available only in Build mode.", "warning");
        return;
      }
      await refreshBuildFleet(ctx);
      const agents = buildFleet.entries.map((entry) => entry.role ? `${entry.agent}/${entry.role}` : entry.agent);
      ctx.ui.notify(`${buildFleetLabel(buildFleet)}${agents.length ? ` · ${agents.join(", ")}` : ""}`, buildFleet.available ? "info" : "warning");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    currentContext = ctx;
    const branch = ctx.sessionManager.getBranch();
    state = restoreCtfState(branch);
    transmissionTelemetry.clear();
    providerRequestStartedAt = undefined;
    const savedElapsed = new Map<number, number | undefined>();
    for (const entry of branch) {
      if (entry.type !== "custom" || entry.customType !== TRANSMISSION_ENTRY || !entry.data || typeof entry.data !== "object") continue;
      const data = entry.data as { messageTimestamp?: unknown; elapsedMs?: unknown };
      if (typeof data.messageTimestamp === "number" && (data.elapsedMs === undefined || typeof data.elapsedMs === "number")) {
        savedElapsed.set(data.messageTimestamp, data.elapsedMs);
      }
    }
    for (const entry of branch) {
      if (entry.type !== "message" || entry.message.role !== "assistant") continue;
      transmissionTelemetry.set(entry.message.timestamp, {
        messageTimestamp: entry.message.timestamp,
        requestTokens: calculateRequestTokens(entry.message.usage),
        elapsedMs: savedElapsed.get(entry.message.timestamp),
      });
    }
    const hasAuth = ctx.model ? ctx.modelRegistry.getProviderAuthStatus(ctx.model.provider).configured : false;
    providerState = initialProviderState(Boolean(ctx.model), hasAuth);
    providerUsageController?.abort();
    providerUsageController = undefined;
    providerUsageRefreshStartedAt = 0;
    providerUsage = ctx.model?.provider === "openai-codex"
      ? { provider: "openai-codex", status: "loading" }
      : ctx.model?.provider === "openai"
        ? { provider: "openai", status: "unavailable" }
        : { provider: ctx.model?.provider ?? "", status: "unsupported" };
    providerResponseHealthy = false;
    activeExecutions.clear();
    buildFleet = { ...EMPTY_BUILD_FLEET, entries: [] };
    buildFleetRefreshInFlight = false;
    stopBuildFleetPolling();
    ctx.ui.setWidget("yorha-execution", undefined);
    mode = "build";
    closeOverlay();
    setToolForMode();

    if (ctx.mode === "tui") {
      const selected = ctx.ui.setTheme("yorha-bunker");
      if (!selected.success) ctx.ui.notify(`YoRHa theme unavailable: ${selected.error}`, "warning");
      ctx.ui.setHeader((_tui, theme) => new BunkerHeader(theme, ctx, () => mode));
      removeCodePanelPatch?.();
      removeCodePanelPatch = installCodePanelRenderer();
      removeToolOutputAffordancePatch?.();
      removeToolOutputAffordancePatch = installToolOutputAffordance(Text);
      removeTransmissionMetadataPatch?.();
      removeTransmissionMetadataPatch = installTransmissionMetadataRenderer(
        () => ctx.ui.theme,
        (message) => transmissionTelemetry.get(message.timestamp),
      );
      ctx.ui.setFooter((tui, theme, footerData) => createBunkerFooter(theme, ctx, footerData, () => mode, () => state, () => providerState, () => providerUsage, () => buildFleet, () => tui.requestRender()));
      ctx.ui.setEditorComponent((tui, theme, keybindings) => new BunkerEditor(tui, theme, keybindings, () => mode, ctx.ui.theme));
      ctx.ui.setWorkingMessage("Pod 042 processing tactical data...");
      ctx.ui.setWorkingIndicator({
        frames: GLYPH.scan.map((frame, index) => ctx.ui.theme.fg(index % 2 ? "border" : "accent", frame)),
        intervalMs: UI.workingIntervalMs,
      });
      ctx.ui.setToolsExpanded(false);
    }
    refreshStatus(ctx);
    ctx.ui.setTitle("YoRHa Bunker · BUILD");
    if (ctx.mode === "tui") {
      startProviderUsagePolling(ctx);
      if (ctx.model?.provider === "openai-codex") void refreshProviderUsage(ctx, true);
    }
    buildFleetRefreshTimer = setTimeout(() => void refreshBuildFleet(ctx), 100);
  });

  pi.events.on("subagent:async-started", () => {
    if (currentContext && mode === "build") void refreshBuildFleet(currentContext);
  });
  pi.events.on("subagent:async-complete", () => {
    if (currentContext && mode === "build") void refreshBuildFleet(currentContext);
  });
  pi.events.on("subagents:rpc:v1:ready", () => {
    if (currentContext && mode === "build") void refreshBuildFleet(currentContext);
  });

  pi.on("turn_start", (event) => {
    pi.appendEntry("yorha-response-card", { turn: event.turnIndex, at: event.timestamp });
  });
  pi.on("tool_execution_start", (event, ctx) => {
    activeExecutions.set(event.toolCallId, { name: event.toolName, startedAt: Date.now() });
    refreshExecutionWidget(ctx);
    if (event.toolName === "subagent" || event.toolName === "subagent_wait") {
      buildFleetRefreshTimer = setTimeout(() => void refreshBuildFleet(ctx), 100);
    }
  });
  pi.on("tool_execution_end", (event, ctx) => {
    activeExecutions.delete(event.toolCallId);
    refreshExecutionWidget(ctx);
    if (event.toolName === "subagent" || event.toolName === "subagent_wait") void refreshBuildFleet(ctx);
  });
  pi.on("before_provider_request", (_event, ctx) => {
    providerRequestStartedAt = performance.now();
    providerState = "active";
    providerResponseHealthy = false;
    refreshStatus(ctx);
  });
  pi.on("after_provider_response", (event, ctx) => {
    const next = providerStateAfterHttp(event.status);
    providerState = next.state;
    providerResponseHealthy = next.responseHealthy;
    if (ctx.model?.provider === "openai") {
      providerUsage = openAIUsageAfterHeaders(providerUsage, event.headers);
    }
    refreshStatus(ctx);
  });
  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const elapsedMs = providerRequestStartedAt === undefined
      ? Math.max(0, Date.now() - event.message.timestamp)
      : Math.max(0, performance.now() - providerRequestStartedAt);
    providerRequestStartedAt = undefined;
    const telemetry: TransmissionTelemetry = {
      messageTimestamp: event.message.timestamp,
      requestTokens: calculateRequestTokens(event.message.usage),
      elapsedMs,
    };
    transmissionTelemetry.set(event.message.timestamp, telemetry);
    pi.appendEntry(TRANSMISSION_ENTRY, telemetry);
    providerState = providerStateAfterMessage(providerState, providerResponseHealthy, event.message.stopReason);
    refreshStatus(ctx);
  });
  pi.on("agent_end", (_event, ctx) => {
    if (providerState === "active" && providerResponseHealthy) providerState = "linked";
    refreshStatus(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode === "tui" && ctx.model?.provider === "openai-codex") void refreshProviderUsage(ctx);
  });
  pi.on("model_select", (event, ctx) => {
    const hasAuth = ctx.modelRegistry.getProviderAuthStatus(event.model.provider).configured;
    providerState = initialProviderState(true, hasAuth);
    providerResponseHealthy = false;
    providerUsageRefreshStartedAt = 0;
    providerUsage = event.model.provider === "openai-codex"
      ? { provider: "openai-codex", status: "loading" }
      : event.model.provider === "openai"
        ? { provider: "openai", status: "unavailable" }
        : { provider: event.model.provider, status: "unsupported" };
    refreshStatus(ctx);
    if (ctx.mode === "tui") {
      startProviderUsagePolling(ctx);
      void refreshProviderUsage(ctx, true);
    }
  });
  pi.on("thinking_level_select", (_event, ctx) => refreshStatus(ctx));
  pi.on("session_shutdown", () => {
    closeOverlay();
    activeExecutions.clear();
    stopBuildFleetPolling();
    stopProviderUsagePolling();
    buildFleetRefreshInFlight = false;
    providerUsageController?.abort();
    providerUsageController = undefined;
    removeCodePanelPatch?.();
    removeCodePanelPatch = undefined;
    removeToolOutputAffordancePatch?.();
    removeToolOutputAffordancePatch = undefined;
    removeTransmissionMetadataPatch?.();
    removeTransmissionMetadataPatch = undefined;
    if (currentContext) {
      currentContext.ui.setWorkingIndicator();
      currentContext.ui.setWorkingMessage();
    }
    currentContext = undefined;
  });
}
