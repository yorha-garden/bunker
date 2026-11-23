#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home"
export YORHA_SKIP_PACKAGES=1
mkdir -p "$HOME/.pi/agent/extensions/clawd-on-desk"
printf '{"theme":"dark","defaultProvider":"test","defaultModel":"model","terminal":{"showTerminalProgress":true}}\n' > "$HOME/.pi/agent/settings.json"
printf '{"tui.editor.yank":"ctrl+y"}\n' > "$HOME/.pi/agent/keybindings.json"
printf 'untouched\n' > "$HOME/.pi/agent/extensions/clawd-on-desk/index.ts"
BASE=$(shasum -a 256 "$HOME/.pi/agent/extensions/clawd-on-desk/index.ts" | awk '{print $1}')

OUT1=$(bash "$ROOT/install.sh")
RESTORE=$(printf '%s\n' "$OUT1" | awk '/^Restore:/ {print $2}')
[[ -x $RESTORE ]]
[[ $(jq -r .theme "$HOME/.pi/agent/settings.json") == yorha-bunker ]]
[[ $(jq -r .quietStartup "$HOME/.pi/agent/settings.json") == true ]]
[[ $(jq -r .tuiMode "$HOME/.pi/agent/settings.json") == fullscreen ]]
[[ $(jq -r '.packages[] | select(type == "string" and startswith("npm:pi-subagents"))' "$HOME/.pi/agent/settings.json") == npm:pi-subagents@0.46.0 ]]
[[ $(jq -r '.packages[] | select(type == "object" and (.source | contains("github.com/obra/superpowers"))) | .extensions | length' "$HOME/.pi/agent/settings.json") == 0 ]]
[[ -f "$HOME/.pi/agent/extensions/yorha-bunker-hud/build-orchestration.ts" ]]
for f in tool-cards.ts tool-cards-register.ts card-model.ts icons.ts output-detect.ts text-width.ts assets/generated/tool-bash.png assets/generated/tool-ls.png; do
  [[ -f "$HOME/.pi/agent/extensions/yorha-bunker-hud/$f" ]] || { echo "missing installed file: $f" >&2; exit 1; }
done
[[ -f "$HOME/.pi/agent/extensions/yorha-bunker-hud/skills/yorha-build-orchestration/SKILL.md" ]]
[[ $(jq -r '."app.thinking.cycle"' "$HOME/.pi/agent/keybindings.json") == ctrl+shift+t ]]
[[ $(jq -r '."tui.editor.yank"' "$HOME/.pi/agent/keybindings.json") == ctrl+y ]]
[[ $BASE == $(shasum -a 256 "$HOME/.pi/agent/extensions/clawd-on-desk/index.ts" | awk '{print $1}') ]]
FIRST=$(find "$HOME/.pi/agent/extensions/yorha-bunker-hud" "$HOME/.pi/agent/themes/yorha-bunker.json" -type f -exec shasum -a 256 {} + | sort | shasum -a 256 | awk '{print $1}')
bash "$ROOT/install.sh" >/dev/null
SECOND=$(find "$HOME/.pi/agent/extensions/yorha-bunker-hud" "$HOME/.pi/agent/themes/yorha-bunker.json" -type f -exec shasum -a 256 {} + | sort | shasum -a 256 | awk '{print $1}')
[[ $FIRST == $SECOND ]]
PI_AGENT_DIR="$HOME/.pi/agent" bash "$RESTORE" >/dev/null
[[ $(jq -r .theme "$HOME/.pi/agent/settings.json") == dark ]]
[[ $(jq -r 'has("quietStartup")' "$HOME/.pi/agent/settings.json") == false ]]
[[ $(jq -r 'has("tuiMode")' "$HOME/.pi/agent/settings.json") == false ]]
[[ $(jq -r '."tui.editor.yank"' "$HOME/.pi/agent/keybindings.json") == ctrl+y ]]
[[ $(jq -r 'has("app.thinking.cycle")' "$HOME/.pi/agent/keybindings.json") == false ]]
[[ ! -e "$HOME/.pi/agent/extensions/yorha-bunker-hud" ]]
[[ ! -e "$HOME/.pi/agent/themes/yorha-bunker.json" ]]
echo "installer contract OK"
