#!/usr/bin/env bash
# One-off check for step 1 (housekeeping). Run after the move:
#   bash check-structure.sh [workspace]   (default ~/Desktop/Cursor/Whisper)
set -u
W="${1:-$HOME/Desktop/Cursor/Whisper}"
V2="$W/WhisperV2"
fail=0
ok()  { echo "ok    $1"; }
bad() { echo "FAIL  $1"; fail=1; }

# 1. Every file on the delete list is absent, plus the two .cursor folders.
missing=0
while read -r f; do
  [ -z "$f" ] && continue
  if [ -e "$V2/$f" ]; then bad "still there: $f"; missing=1; fi
done <<'LIST'
.cursor/agents/backend-api.md
.cursor/agents/desktop-app.md
.cursor/agents/project-overview.md
.cursor/agents/web-app.md
.cursor/plan.md
.cursor/rules/behavior.mdc
.cursor/tests/desktop-jest.md
.cursor/tests/desktop-playwright.md
.cursor/tests/webapp-playwright.md
.cursor/tests/webapp-react-testing.md
AGENTS.md
DATABASE.md
EXTERNAL_SERVICES.md
SETUP.md
build-web.md
docs/auth-pipeline.md
docs/dev-mock-mode-webapp.md
docs/llm-client-architecture.md
docs/llm-pipeline.md
docs/meeting-insights-analysis-pipeline.md
docs/presets-pipeline.md
docs/quota-system.md
docs/search.md
docs/stt-pipeline.md
rules.md
run-dev.md
template.md
whisper_web/.cursor/rules/typescript.mdc
whisper_web/public/README.md
LIST
[ "$missing" = 0 ] && ok "all deleted docs are absent"
for d in .cursor whisper_web/.cursor; do
  [ -e "$V2/$d" ] && bad "still there: $d/" || ok "$d/ is absent"
done

# 2. WhisperV2 has no CODING_STANDARDS.md and no AGENTS.md.
for f in CODING_STANDARDS.md AGENTS.md; do
  [ -e "$V2/$f" ] && bad "WhisperV2 still has $f" || ok "WhisperV2 has no $f"
done

# 3. The workspace is a git repo with CLAUDE.md, CODING_STANDARDS.md and a .gitignore listing the repos.
git -C "$W" rev-parse --is-inside-work-tree >/dev/null 2>&1 && ok "workspace is a git repo" || bad "workspace is not a git repo"
for f in CLAUDE.md CODING_STANDARDS.md .gitignore; do
  git -C "$W" ls-files --error-unmatch "$f" >/dev/null 2>&1 && ok "workspace tracks $f" || bad "workspace does not track $f"
done
[ -z "$(git -C "$W" status --porcelain)" ] && ok "workspace tree is clean" || bad "workspace tree has changes"

# 4. The three repos sit inside it: clean, and neither ahead of nor behind their remotes.
for r in WhisperV2 WhisperAPP websocket; do
  grep -qx "$r/" "$W/.gitignore" && ok ".gitignore lists $r/" || bad ".gitignore does not list $r/"
  R="$W/$r"
  if [ ! -d "$R/.git" ]; then bad "$r is not inside the workspace"; continue; fi
  [ -e "$(dirname "$W")/$r" ] && bad "old path $(dirname "$W")/$r still exists"
  git -C "$R" fetch -q 2>/dev/null || bad "$r: fetch failed"
  b=$(git -C "$R" branch --show-current)
  [ -z "$(git -C "$R" status --porcelain --untracked-files=no)" ] && ok "$r ($b) has no uncommitted changes" || bad "$r ($b) has uncommitted changes"
  c=$(git -C "$R" rev-list --left-right --count '@{u}...HEAD' 2>/dev/null | tr '\t' ' ')
  [ "$c" = "0 0" ] && ok "$r ($b) matches its remote" || bad "$r ($b) behind/ahead of its remote: ${c:-no upstream}"
done
[ "$(git -C "$V2" branch --show-current)" = dev ] && ok "WhisperV2 is on dev" || bad "WhisperV2 is not on dev"

# 5. WhisperV2 has only its main worktree.
n=$(git -C "$V2" worktree list | wc -l | tr -d ' ')
[ "$n" = 1 ] && ok "WhisperV2 has only the main worktree" || bad "WhisperV2 has $n worktrees"

[ "$fail" = 0 ] && echo "PASS" || echo "FAILED"
exit "$fail"
