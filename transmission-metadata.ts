import { AssistantMessageComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { Spacer, Text } from "@earendil-works/pi-tui";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { formatTransmissionTelemetry, type TransmissionTelemetry } from "./transmission-format.ts";

const PATCH = Symbol.for("yorha-bunker.transmission-metadata-renderer");

class TransmissionTelemetryLine {
  private readonly telemetry: TransmissionTelemetry;
  private readonly theme: Theme;
  private readonly padding: number;

  constructor(telemetry: TransmissionTelemetry, theme: Theme, padding: number) {
    this.telemetry = telemetry;
    this.theme = theme;
    this.padding = padding;
  }

  render(width: number): string[] {
    const available = Math.max(1, width - this.padding * 2);
    const text = formatTransmissionTelemetry(this.telemetry, available);
    return new Text(this.theme.fg("dim", text), this.padding, 0).render(width);
  }

  invalidate(): void {}
}

export function installTransmissionMetadataRenderer(
  getTheme: () => Theme,
  getTelemetry: (message: AssistantMessage) => TransmissionTelemetry | undefined,
): () => void {
  const prototype = AssistantMessageComponent.prototype as any;
  const prior = prototype[PATCH] as { original: Function; patched?: Function } | undefined;
  const original = prior?.original ?? prototype.updateContent;

  const patched = function (this: any, message: AssistantMessage, isStreaming = this.isStreaming): void {
    original.call(this, message, isStreaming);
    if (isStreaming || message.role !== "assistant") return;
    const telemetry = getTelemetry(message);
    if (!telemetry) return;
    this.contentContainer.addChild(new Spacer(1));
    this.contentContainer.addChild(new TransmissionTelemetryLine(telemetry, getTheme(), this.outputPad));
  };

  prototype[PATCH] = { original, patched };
  prototype.updateContent = patched;
  return () => {
    if (prototype.updateContent === patched) prototype.updateContent = original;
    if (prototype[PATCH]?.patched === patched) prototype[PATCH] = { original };
  };
}
