import { GLYPH } from "./tokens.ts";

export type DisplayMessageType = "user" | "assistant" | "assistant-thinking";

export function transformAssistantMarkdown(
  markdown: string,
  messageType: DisplayMessageType,
  isStreaming: boolean,
): string {
  if (messageType === "user") return markdown;
  if (messageType === "assistant-thinking") return markdown;
  const body = `── ${GLYPH.response} POD 042 / RESPONSE ──\n\n${markdown}`;
  return isStreaming ? body : `${body}\n\n---\n\n_END TRANSMISSION_`;
}
