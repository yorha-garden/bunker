#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=${PI_AGENT_DIR:-"$HOME/.pi/agent"}
EXT_DIR="$AGENT_DIR/extensions/yorha-bunker-hud"
THEME_FILE="$AGENT_DIR/themes/yorha-bunker.json"
SETTINGS="$AGENT_DIR/settings.json"
KEYBINDINGS="$AGENT_DIR/keybindings.json"
DRY_RUN=0
[[ ${1:-} == "--dry-run" ]] && DRY_RUN=1
SUBAGENTS_PACKAGE='npm:pi-subagents@0.46.0'
SUPERPOWERS_PACKAGE='git:github.com/obra/superpowers@v6.2.0'

if (( DRY_RUN )); then
  printf 'Would install extension: %s -> %s\n' "$SOURCE_DIR" "$EXT_DIR"
  printf 'Would install theme: %s -> %s\n' "$SOURCE_DIR/theme/yorha-bunker.json" "$THEME_FILE"
  printf 'Would set settings.theme = yorha-bunker, quietStartup = true, and tuiMode = fullscreen in %s\n' "$SETTINGS"
  printf 'Would set app.thinking.cycle = ctrl+shift+t in %s\n' "$KEYBINDINGS"
  printf 'Would preserve app.tools.expand (Pi default: ctrl+o)\n'
  printf 'Would install pinned Build packages: %s and %s\n' "$SUBAGENTS_PACKAGE" "$SUPERPOWERS_PACKAGE"
  printf 'Would load Superpowers skills through YoRHa while disabling its always-on bootstrap extension\n'
  exit 0
fi

mkdir -p "$AGENT_DIR/backups" "$AGENT_DIR/extensions" "$AGENT_DIR/themes"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
BACKUP="$AGENT_DIR/backups/yorha-bunker-$STAMP"
mkdir -p "$BACKUP"

backup_path() {
  local source=$1 name=$2
  if [[ -e $source ]]; then
    cp -a "$source" "$BACKUP/$name"
    printf 'present\n' > "$BACKUP/$name.state"
  else
    printf 'absent\n' > "$BACKUP/$name.state"
  fi
}
backup_path "$SETTINGS" settings.json
backup_path "$KEYBINDINGS" keybindings.json
backup_path "$EXT_DIR" extension
backup_path "$THEME_FILE" theme.json

cat > "$BACKUP/restore.sh" <<'RESTORE'
#!/usr/bin/env bash
set -euo pipefail
BACKUP=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=${PI_AGENT_DIR:-"$HOME/.pi/agent"}
restore_path() {
  local name=$1 target=$2
  rm -rf "$target"
  if [[ $(cat "$BACKUP/$name.state") == present ]]; then
    mkdir -p "$(dirname "$target")"
    cp -a "$BACKUP/$name" "$target"
  fi
}
restore_path settings.json "$AGENT_DIR/settings.json"
restore_path keybindings.json "$AGENT_DIR/keybindings.json"
restore_path extension "$AGENT_DIR/extensions/yorha-bunker-hud"
restore_path theme.json "$AGENT_DIR/themes/yorha-bunker.json"
printf 'YoRHa Bunker installation restored from %s\n' "$BACKUP"
RESTORE
chmod 700 "$BACKUP/restore.sh"

STAGED="$AGENT_DIR/extensions/.yorha-bunker-hud.$$.tmp"
rm -rf "$STAGED"
mkdir -p "$STAGED/assets/generated" "$STAGED/assets/pixelarticons"
cp "$SOURCE_DIR/index.ts" "$SOURCE_DIR/components.ts" "$SOURCE_DIR/build-orchestration.ts" "$SOURCE_DIR/code-panel.ts" "$SOURCE_DIR/ctf-state.ts" "$SOURCE_DIR/footer-layout.ts" "$SOURCE_DIR/mode.ts" "$SOURCE_DIR/provider-state.ts" "$SOURCE_DIR/provider-usage.ts" "$SOURCE_DIR/response.ts" "$SOURCE_DIR/tokens.ts" "$SOURCE_DIR/transmission-format.ts" "$SOURCE_DIR/transmission-metadata.ts" "$STAGED/"
mkdir -p "$STAGED/skills"
cp -R "$SOURCE_DIR/skills/yorha-build-orchestration" "$STAGED/skills/"
cp "$SOURCE_DIR/assets/generated/"*.png "$STAGED/assets/generated/"
cp "$SOURCE_DIR/assets/pixelarticons/LICENSE" "$STAGED/assets/pixelarticons/LICENSE"
rm -rf "$EXT_DIR"
mv "$STAGED" "$EXT_DIR"
install -m 600 "$SOURCE_DIR/theme/yorha-bunker.json" "$THEME_FILE"

if [[ ${YORHA_SKIP_PACKAGES:-0} != 1 ]]; then
  if ! command -v pi >/dev/null 2>&1; then
    printf 'Pi is required to install Build orchestration packages. Set YORHA_SKIP_PACKAGES=1 only for offline staging.\n' >&2
    exit 1
  fi
  pi install "$SUBAGENTS_PACKAGE"
  pi install "$SUPERPOWERS_PACKAGE"
fi

python3 - "$SETTINGS" "$KEYBINDINGS" "$SUBAGENTS_PACKAGE" "$SUPERPOWERS_PACKAGE" <<'PY'
import json, os, pathlib, sys, tempfile

def merge(path, changes):
    p = pathlib.Path(path)
    data = json.loads(p.read_text()) if p.exists() else {}
    data.update(changes)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=p.name + ".", dir=p.parent)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, p)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

settings = pathlib.Path(sys.argv[1])
data = json.loads(settings.read_text()) if settings.exists() else {}
packages = data.get("packages", [])
packages = [item for item in packages if not (
    (isinstance(item, str) and (item.startswith("npm:pi-subagents") or "github.com/obra/superpowers" in item)) or
    (isinstance(item, dict) and isinstance(item.get("source"), str) and (item["source"].startswith("npm:pi-subagents") or "github.com/obra/superpowers" in item["source"]))
)]
packages.extend([
    sys.argv[3],
    {"source": sys.argv[4], "extensions": []},
])
merge(sys.argv[1], {"theme": "yorha-bunker", "quietStartup": True, "tuiMode": "fullscreen", "packages": packages})
merge(sys.argv[2], {"app.thinking.cycle": "ctrl+shift+t"})
PY

printf 'Installed YoRHa Bunker HUD globally.\n'
printf 'Restore: %s/restore.sh\n' "$BACKUP"
printf 'Run /reload in Pi to activate.\n'
