#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home"
mkdir -p "$HOME/.pi/agent/skills/academic-paper-composer/scripts" "$HOME/.pi/agent/skills/academic-paper-strategist/references"
mkdir -p "$HOME/.agents/skills/academic-paper-composer" "$HOME/.agents/skills/academic-paper-strategist"
printf '{"theme":"dark"}\n' > "$HOME/.pi/agent/settings.json"
for name in academic-paper-composer academic-paper-strategist; do
  cat > "$HOME/.pi/agent/skills/$name/SKILL.md" <<EOF
---
name: $name
description: Workflow used when users want to: test a colon safely.
---
# $name
EOF
  cp "$HOME/.pi/agent/skills/$name/SKILL.md" "$HOME/.agents/skills/$name/SKILL.md"
done
printf 'helper\n' > "$HOME/.pi/agent/skills/academic-paper-composer/scripts/check.py"
printf 'reference\n' > "$HOME/.pi/agent/skills/academic-paper-strategist/references/guide.md"
OUT=$(bash "$ROOT/repair-startup.sh")
RESTORE=$(printf '%s\n' "$OUT" | awk '/^Restore:/ {print $2}')
[[ $(jq -r .quietStartup "$HOME/.pi/agent/settings.json") == true ]]
[[ ! -e "$HOME/.pi/agent/skills/academic-paper-composer" ]]
[[ ! -e "$HOME/.pi/agent/skills/academic-paper-strategist" ]]
[[ -f "$HOME/.agents/skills/academic-paper-composer/scripts/check.py" ]]
[[ -f "$HOME/.agents/skills/academic-paper-strategist/references/guide.md" ]]
python3 - "$HOME/.agents/skills/academic-paper-composer/SKILL.md" <<'PY'
import pathlib, sys
# Validate the transformed JSON/YAML scalar structurally.
s = pathlib.Path(sys.argv[1]).read_text()
line = next(line for line in s.splitlines() if line.startswith("description: "))
assert line.startswith('description: "') and line.endswith('"')
PY
bash "$RESTORE" >/dev/null
[[ $(jq -r 'has("quietStartup")' "$HOME/.pi/agent/settings.json") == false ]]
[[ -f "$HOME/.pi/agent/skills/academic-paper-composer/scripts/check.py" ]]
[[ ! -e "$HOME/.agents/skills/academic-paper-composer/scripts" ]]
echo "startup repair contract OK"
