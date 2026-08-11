import { CustomEditor, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Image, Text, truncateToWidth, visibleWidth, type EditorTheme } from "@earendil-works/pi-tui";
import { CTF_PHASES, type CtfState } from "./ctf-state.ts";
import { GLYPH, LABEL, UI, type OperationalMode } from "./tokens.ts";
import { modelWidthForTerminal, shortenModelName } from "./footer-layout.ts";
import { providerStateLabel, type ProviderLinkState } from "./provider-state.ts";
import { formatProviderUsage, providerUsageRemainingPercent, type ProviderUsageState } from "./provider-usage.ts";
import { buildFleetLabel, type BuildFleetState } from "./build-orchestration.ts";

function fit(text: string, width: number): string {
  return truncateToWidth(text, Math.max(1, width), "");
}

function spread(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return fit(left + " ".repeat(gap) + right, width);
}

function rule(theme: Theme, width: number): string {
  return theme.fg("borderMuted", "─".repeat(Math.max(1, width)));
}

export class BunkerHeader {
  constructor(
    private readonly theme: Theme,
    private readonly ctx: ExtensionContext,
    private readonly getMode: () => OperationalMode,
  ) {}

  render(width: number): string[] {
    const mode = this.getMode();
    const modeText = mode === "hacking" ? "HACKING MODE" : "BUILD MODE";
    const usage = this.ctx.getContextUsage();
    const context = usage ? `${Math.round(usage.percent ?? 0)}%` : "—";
    const model = this.ctx.model?.id ?? "NO MODEL";
    const thinking = (this.ctx.thinkingLevel ?? "off").toUpperCase();
    const mark = this.theme.fg("accent", this.theme.bold(LABEL.wordmark));

    if (width < UI.minWidth) {
      return [
        spread(mark, this.theme.fg("accent", modeText), width),
        fit(this.theme.fg("dim", `${model}  ·  THINKING ${thinking}  ·  CONTEXT ${context}`), width),
        rule(this.theme, width),
      ];
    }

    const identity = this.theme.fg("dim", `${LABEL.network}  ·  ${LABEL.unit}`);
    const telemetry = this.theme.fg("muted", `CTX ${context}  │  MODEL ${model}  │  THINKING ${thinking}`);
    const operational = this.theme.fg("accent", `${GLYPH.linked} ${modeText}`);
    return [
      spread(mark, operational, width),
      spread(identity, telemetry, width),
      rule(this.theme, width),
    ];
  }

  invalidate(): void {}
}

export function createBunkerFooter(
  theme: Theme,
  ctx: ExtensionContext,
  footerData: any,
  getMode: () => OperationalMode,
  getState: () => CtfState,
  getProviderState: () => ProviderLinkState,
  getProviderUsage: () => ProviderUsageState,
  getBuildFleet: () => BuildFleetState,
  requestRender: () => void,
) {
  const unsubscribe = footerData.onBranchChange(requestRender);
  return {
    dispose: unsubscribe,
    invalidate() {},
    render(width: number): string[] {
      const mode = getMode();
      const state = getState();
      const usage = ctx.getContextUsage();
      const branch = footerData.getGitBranch?.();
      const providerState = getProviderState();
      const providerGlyph = providerState === "linked" || providerState === "active" ? GLYPH.linked : GLYPH.pointer;
      const providerColor = providerState === "degraded" || providerState === "offline"
        ? "error"
        : providerState === "linked" || providerState === "active"
          ? "accent"
          : "dim";
      const provider = theme.fg(providerColor, `${providerGlyph} ${providerStateLabel(providerState)}`);
      const branchText = branch ? `BRANCH ${branch}` : "NO BRANCH";
      const left = `${provider}  ${theme.fg("dim", branchText)}`;
      const operational = mode === "hacking"
        ? theme.fg("accent", `HACKING UNIT ARMED · ${state.phase}`)
        : theme.fg(getBuildFleet().totalActive > 0 ? "accent" : "dim", buildFleetLabel(getBuildFleet()));
      const modelId = ctx.model?.id ?? "NO MODEL";
      const model = theme.fg("text", shortenModelName(modelId, modelWidthForTerminal(width)));
      const thinking = theme.fg("accent", (ctx.thinkingLevel ?? "off").toUpperCase());
      const context = theme.fg("muted", usage ? `CTX ${Math.round(usage.percent ?? 0)}%` : "CTX —");
      const runtime = `${model}  ${thinking}  ${context}`;
      const usageState = getProviderUsage();
      const usageText = formatProviderUsage(usageState, width);
      const usageRemaining = providerUsageRemainingPercent(usageState);
      const usageColor = usageRemaining !== undefined && usageRemaining <= 10
        ? "error"
        : usageRemaining !== undefined && usageRemaining <= 25
          ? "warning"
          : "muted";
      const allowance = usageText ? theme.fg(usageColor, usageText) : "";
      const groups = [operational, allowance, runtime].filter(Boolean);
      let right = groups.join("  ");
      if (visibleWidth(left) + visibleWidth(right) + 1 > width) right = [allowance, runtime].filter(Boolean).join("  ");
      if (visibleWidth(left) + visibleWidth(right) + 1 > width) right = runtime;
      return [spread(left, right, width)];
    },
  };
}

export class BunkerEditor extends CustomEditor {
  constructor(
    tui: any,
    editorTheme: EditorTheme,
    keybindings: any,
    private readonly getMode: () => OperationalMode,
    private readonly displayTheme: Theme,
  ) {
    super(tui, editorTheme, keybindings);
  }

  render(width: number): string[] {
    const mode = this.getMode().toUpperCase();
    const locality = mode === "HACKING" ? "LINK" : "LOCAL";
    const status = this.displayTheme.fg("accent", `${locality} · ${mode} · INSERT`);
    const statusWidth = visibleWidth(status);
    const legendWidth = Math.max(1, width - statusWidth - 2);
    const title = " OPERATOR INPUT CHANNEL ";
    const titleWidth = visibleWidth(title);
    const remaining = Math.max(0, legendWidth - titleWidth);
    const leftRule = Math.floor(remaining / 2);
    const rightRule = remaining - leftRule;
    const legend = this.displayTheme.fg("dim", `${"─".repeat(leftRule)}${title}${"─".repeat(rightRule)}`);
    const label = spread(legend, status, width);
    return [label, ...super.render(width).map((line) => fit(line, width))];
  }
}

export class CtfOverlay {
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly theme: Theme,
    private readonly getState: () => CtfState,
    requestRender: () => void,
    private readonly close: () => void,
  ) {
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % GLYPH.scan.length;
      requestRender();
    }, 180);
  }

  render(width: number): string[] {
    const state = this.getState();
    const inner = Math.max(8, width - 2);
    const border = (body: string) => this.theme.fg("border", "│") + fit(body, inner) + this.theme.fg("border", "│");
    const value = (label: string, text: string) => [
      border(this.theme.fg("dim", ` ${label}`)),
      border(this.theme.fg("text", ` ${text}`)),
    ];
    const current = CTF_PHASES.indexOf(state.phase);
    const phases = CTF_PHASES.map((_, index) => index <= current ? GLYPH.phaseDone : GLYPH.phaseTodo).join(" ");
    const evidence = state.evidence.slice(-5);
    const top = this.theme.fg("border", `┌${"─".repeat(inner)}┐`);
    const bottom = this.theme.fg("border", `└${"─".repeat(inner)}┘`);
    const title = spread(
      this.theme.fg("accent", " HACKING UNIT"),
      this.theme.fg("muted", `${GLYPH.scan[this.frame]} 01 `),
      inner,
    );
    const lines = [top, border(title), border(rule(this.theme, inner)),
      ...value("CHALLENGE DESIGNATION", state.challenge),
      ...value("CLASSIFICATION", state.category),
      ...value("TARGET", state.target),
      ...value("OPERATIONAL PHASE", state.phase),
      border(this.theme.fg("accent", ` ${phases}`)),
      border(this.theme.fg("dim", ` EVIDENCE REGISTER / ${String(state.evidence.length).padStart(2, "0")}`)),
    ];
    if (evidence.length === 0) lines.push(border(this.theme.fg("muted", " NO EVIDENCE RECORDED")));
    for (const item of evidence) lines.push(border(this.theme.fg("text", ` ${GLYPH.pointer} ${item.text}`)));
    const flag = state.verified
      ? this.theme.fg("success", "VERIFIED")
      : this.theme.fg("error", "UNVERIFIED");
    lines.push(border(rule(this.theme, inner)), border(spread(" FLAG STATUS", flag + " ", inner)), bottom);
    return lines.map((line) => fit(line, width));
  }

  handleInput(data: string): void {
    if (data === "\x1b" || data === "\x1b[90;6u") this.close();
  }

  invalidate(): void {}

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

function pixelIcon(theme: Theme, iconBase64: string, filename: string, maxWidthCells = 4): Image {
  return new Image(
    iconBase64,
    "image/png",
    { fallbackColor: (text) => theme.fg("accent", text) },
    { maxWidthCells, maxHeightCells: 2, filename },
    { widthPx: 48, heightPx: 48 },
  );
}

export function createResponseCard(theme: Theme, iconBase64: string) {
  const image = pixelIcon(theme, iconBase64, "pixelarticons-robot-face-sharp.png");
  return {
    invalidate() { image.invalidate(); },
    render(width: number): string[] {
      const padding = "  ";
      const imageLines = image.render(Math.min(4, Math.max(1, width - padding.length)));
      const label = theme.fg("accent", `${GLYPH.analysis} TACTICAL ANALYSIS`);
      if (imageLines.length === 0) return ["", fit(`${padding}${label}`, width)];
      const labelRow = Math.floor((imageLines.length - 1) / 2);
      return [
        "",
        ...imageLines.map((line, index) => fit(`${padding}${line}${index === labelRow ? `  ${label}` : ""}`, width)),
      ];
    },
  };
}

export interface ActiveExecution {
  name: string;
  startedAt: number;
}

export function createExecutionWidget(theme: Theme, executions: readonly ActiveExecution[]) {
  return {
    invalidate() {},
    render(width: number): string[] {
      const names = [...new Set(executions.map((execution) => execution.name.toUpperCase()))].join(" + ");
      const startedAt = Math.min(...executions.map((execution) => execution.startedAt));
      const elapsed = Math.max(0, Date.now() - startedAt) / 1000;
      const frame = GLYPH.scan[Math.floor(Date.now() / UI.workingIntervalMs) % GLYPH.scan.length];
      const line = theme.fg("accent", `${frame} EXECUTING ${names} · ${elapsed.toFixed(1)}S`);
      return [fit(`  ${line}`, width)];
    },
  };
}

export function createPodWidget(theme: Theme, mode: OperationalMode, state: CtfState) {
  const message = mode === "hacking"
    ? state.evidence.length
      ? `Proposal: validate ${state.evidence.length} evidence record(s) before flag verification.`
      : "Proposal: begin triage and record reproducible evidence."
    : "Analysis: Build Unit ready. Superpowers and delegated support available.";
  return {
    invalidate() {},
    render(width: number): string[] {
      return [
        fit(theme.fg("dim", LABEL.pod), width),
        fit(theme.fg("text", message), width),
      ];
    },
  };
}
