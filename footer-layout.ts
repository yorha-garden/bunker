export function shortenModelName(modelId: string, maxLength: number): string {
  if (modelId.length <= maxLength) return modelId;
  if (maxLength < 8) return modelId.slice(0, Math.max(1, maxLength));
  const sides = maxLength - 1;
  const left = Math.ceil(sides / 2);
  const right = Math.floor(sides / 2);
  return `${modelId.slice(0, left)}…${modelId.slice(-right)}`;
}

export function modelWidthForTerminal(width: number): number {
  if (width >= 150) return 32;
  if (width >= 120) return 24;
  if (width >= 100) return 18;
  return 12;
}
