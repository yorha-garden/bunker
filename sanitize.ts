// String sequences (OSC, DCS, SOS, PM, APC) end at BEL or ST; an unterminated one runs to the end.
const STRING_SEQUENCE = /\x1b[\]PX^_][\s\S]*?(?:\x07|\x1b\\|$)/g;
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// Remaining ESC forms: optional intermediates then one final byte (ESC 7, ESC ( B, ...), or a lone ESC.
const OTHER_ESCAPE = /\x1b[ -/]*[0-~]?/g;
const CONTROL = /[\x00-\x09\x0b-\x1f\x7f\ufff9-\ufffb]/g;

/** Makes tool output safe for pi-tui width math: no escapes, no controls but "\n", no "\r" overwrites, no tabs. */
export function sanitizeText(text: string): string {
  return text
    .replace(STRING_SEQUENCE, "")
    .replace(CSI, "")
    .replace(OTHER_ESCAPE, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\r+$/, "").split("\r").pop()!)
    .join("\n")
    .replace(/\t/g, "   ")
    .replace(CONTROL, "");
}
