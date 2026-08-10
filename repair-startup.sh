#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR=${PI_AGENT_DIR:-"$HOME/.pi/agent"}
COMMON_SKILLS=${PI_COMMON_SKILLS_DIR:-"$HOME/.agents/skills"}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
BACKUP="$AGENT_DIR/backups/yorha-startup-$STAMP"
mkdir -p "$BACKUP"
cp -a "$AGENT_DIR/settings.json" "$BACKUP/settings.json"
mkdir -p "$BACKUP/pi-skills" "$BACKUP/common-skills"

SKILLS=(academic-paper-composer academic-paper-strategist)
for name in "${SKILLS[@]}"; do
  [[ -d "$AGENT_DIR/skills/$name" ]] && cp -a "$AGENT_DIR/skills/$name" "$BACKUP/pi-skills/$name"
  [[ -d "$COMMON_SKILLS/$name" ]] && cp -a "$COMMON_SKILLS/$name" "$BACKUP/common-skills/$name"
done

cat > "$BACKUP/restore.sh" <<'RESTORE'
#!/usr/bin/env bash
set -euo pipefail
BACKUP=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=${PI_AGENT_DIR:-"$HOME/.pi/agent"}
COMMON_SKILLS=${PI_COMMON_SKILLS_DIR:-"$HOME/.agents/skills"}
cp -a "$BACKUP/settings.json" "$AGENT_DIR/settings.json"
for name in academic-paper-composer academic-paper-strategist; do
  rm -rf "$AGENT_DIR/skills/$name" "$COMMON_SKILLS/$name"
  [[ -d "$BACKUP/pi-skills/$name" ]] && cp -a "$BACKUP/pi-skills/$name" "$AGENT_DIR/skills/$name"
  [[ -d "$BACKUP/common-skills/$name" ]] && cp -a "$BACKUP/common-skills/$name" "$COMMON_SKILLS/$name"
done
printf 'Startup resources restored from %s\n' "$BACKUP"
RESTORE
chmod 700 "$BACKUP/restore.sh"

# Keep one complete canonical copy in ~/.agents/skills so Pi and other harnesses
# discover the same skill without name collisions. Merge support files first.
for name in "${SKILLS[@]}"; do
  mkdir -p "$COMMON_SKILLS/$name"
  if [[ -d "$AGENT_DIR/skills/$name" ]]; then
    cp -a "$AGENT_DIR/skills/$name/." "$COMMON_SKILLS/$name/"
  fi
done

# Quote long descriptions as JSON/YAML scalars. Their unquoted colons currently
# produce "Nested mappings are not allowed in compact mappings" diagnostics.
python3 - "$COMMON_SKILLS" "${SKILLS[@]}" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
concise = {
    "academic-paper-strategist": (
        "Strategic planning framework for philosophy and interdisciplinary academic papers targeting "
        "PhilArchive, arXiv, and PhilSci-Archive. Use to plan a paper, identify research gaps, assess "
        "originality, design an optimized outline, select a preprint venue, or prepare a submission strategy. "
        "Covers platform analysis, literature and gap analysis, theoretical framing, outline optimization, "
        "and reviewer-perspective quality checks. Produces a detailed outline ready for academic-paper-composer."
    ),
}
for name in sys.argv[2:]:
    path = root / name / "SKILL.md"
    lines = path.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.startswith("description: "):
            raw = line[len("description: "):]
            try:
                description = json.loads(raw) if raw.startswith('"') else raw
            except json.JSONDecodeError:
                description = raw
            description = concise.get(name, description)
            if len(description) > 1024:
                raise SystemExit(f"description exceeds 1024 characters in {path}")
            lines[i] = "description: " + json.dumps(description, ensure_ascii=False)
            break
    else:
        raise SystemExit(f"missing description in {path}")
    path.write_text("\n".join(lines) + "\n")
PY

for name in "${SKILLS[@]}"; do
  rm -rf "$AGENT_DIR/skills/$name"
done

python3 - "$AGENT_DIR/settings.json" <<'PY'
import json, os, pathlib, sys, tempfile
p = pathlib.Path(sys.argv[1])
data = json.loads(p.read_text())
data["quietStartup"] = True
fd, tmp = tempfile.mkstemp(prefix=p.name + ".", dir=p.parent)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, p)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

printf 'Quiet startup enabled and current skill conflicts repaired.\n'
printf 'Restore: %s/restore.sh\n' "$BACKUP"
printf 'Run /reload or restart Pi. Use pi --verbose to inspect startup resources.\n'
