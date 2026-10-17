#!/usr/bin/env bash
# Builds the PUBLIC repo locally: a filtered clone of this private repo with the same commits and dates,
# Qloo response data stripped from every commit. Never pushes, never adds a remote, never touches the source.
#
#   scripts/make-public-clone.sh [DEST]      DEST defaults to ../tour-intelligence-qloo-public (must not exist)
#
# Env: BRANCH          source branch (default worktree-plan-1-qloo-gateway)
#      GIT_FILTER_REPO path to the git-filter-repo binary (default: `git filter-repo` on PATH)
#
# Two passes (controller ruling R12): (1) drop the Qloo data paths from every commit; (2) rewrite every real
# Qloo entity id found anywhere in the branch's history to its synthetic twin (same function the synthetic
# fixtures use), because real ids also leaked into ordinary source files (tests, docs/qloo/api-notes.md).
set -euo pipefail

TRAILER='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mr2yb8AQrKtjuLqifj37Dn'

SRC="$(git rev-parse --show-toplevel)"
COMMON="$(cd "$SRC" && git rev-parse --path-format=absolute --git-common-dir)"
DEST="${1:-$SRC/../tour-intelligence-qloo-public}"
BRANCH="${BRANCH:-worktree-plan-1-qloo-gateway}"
START=$(date +%s)

[[ -e "$DEST" || -L "$DEST" ]] && { echo "refusing: $DEST exists" >&2; exit 1; }
DEST="$(mkdir -p "$(dirname "$DEST")" && cd "$(dirname "$DEST")" && pwd)/$(basename "$DEST")"
echo "source: $SRC (branch $BRANCH)"
echo "dest:   $DEST"

# --- git-filter-repo ---------------------------------------------------------------------------------------
FR=(git filter-repo)
if [[ -n "${GIT_FILTER_REPO:-}" ]]; then FR=("$GIT_FILTER_REPO"); fi
if ! "${FR[@]}" --version >/dev/null 2>&1; then
  cat >&2 <<MSG
git-filter-repo not found. Install it into a throwaway venv (not globally):
  python3 -m venv /tmp/fr && /tmp/fr/bin/pip install git-filter-repo
  GIT_FILTER_REPO=/tmp/fr/bin/git-filter-repo bash scripts/make-public-clone.sh
MSG
  exit 1
fi

git -C "$SRC" rev-parse --verify -q "refs/heads/$BRANCH" >/dev/null || { echo "no such branch: $BRANCH" >&2; exit 1; }

# Scratch dir for the real->synthetic map (contains REAL ids: never inside either repo; removed on exit).
WORK="$(mktemp -d "$(dirname "$DEST")/.public-clone-work.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# --- 1. every real Qloo id anywhere in the branch's history -> synthetic id -----------------------------------
# Same UUID regex as check-public-data.sh, minus its allowlist (00000000- prefix, the Dialogflow agent id).
python3 - "$SRC" "$BRANCH" >"$WORK/ids.txt" <<'PY'
import re, subprocess, sys
src, branch = sys.argv[1:3]
UUID = re.compile(rb'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)
ALLOW = re.compile(r'^(00000000-|672c258a-7d63-4164-a4c6-a34f17490f53$)', re.I)
objs = subprocess.run(['git', '-C', src, 'rev-list', '--objects', branch], capture_output=True, text=True, check=True).stdout
paths = {}
for line in objs.splitlines():
    sha, _, path = line.partition(' ')
    if path: paths.setdefault(sha, path)
p = subprocess.Popen(['git', '-C', src, 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
found = set()
for sha, path in paths.items():
    p.stdin.write(sha.encode() + b'\n'); p.stdin.flush()
    hdr = p.stdout.readline().split()
    size = int(hdr[2]); data = p.stdout.read(size); p.stdout.read(1)
    if hdr[1] != b'blob': continue
    for m in UUID.findall(data):
        s = m.decode()
        if not ALLOW.match(s): found.add(s)
p.stdin.close(); p.wait()
for s in sorted(found): print(s)
PY
export WORK
node --input-type=module - "$SRC/dashboard/scripts/make-synthetic-recording.mjs" >"$WORK/replace.txt" <<'JS'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { syntheticId } = await import(pathToFileURL(process.argv[2]).href);
const seen = new Set();
for (const id of readFileSync(`${process.env.WORK}/ids.txt`, "utf8").split("\n").filter(Boolean)) {
  for (const spelling of new Set([id, id.toUpperCase(), id.toLowerCase()])) {
    if (!seen.has(spelling)) { seen.add(spelling); console.log(`${spelling}==>${syntheticId(spelling)}`); }
  }
}
JS
# Extra literal replacements (e.g. Qloo-returned names found in old test files) come from the git-ignored
# private-data/ so the sensitive literal is never committed. Format: one `LITERAL==>PLACEHOLDER` per line.
EXTRA="$SRC/private-data/extra-replacements.txt"
if [[ -f "$EXTRA" ]]; then cat "$EXTRA" >>"$WORK/replace.txt"; else echo "note: $EXTRA not found, no extra literals replaced"; fi
echo "real Qloo ids found in history: $(wc -l <"$WORK/ids.txt" | tr -d ' ') (map has $(wc -l <"$WORK/replace.txt" | tr -d ' ') spellings)"

# --- 2. clone, strip paths, rewrite ids ----------------------------------------------------------------------
git clone --no-local --single-branch --branch "$BRANCH" "$COMMON" "$DEST" -q
cd "$DEST"
git checkout -q -B master
git branch -D "$BRANCH" -q
STRIP=(
  dashboard/src/lib/qloo/fixtures/showcase.json
  dashboard/src/lib/qloo/fixtures/backtest.json
  backtest/results.json
  backtest/results-run2.json
  cloud_run/qloo_gateway/test/fixtures/calibration
  cloud_run/qloo_gateway/test/fixtures/live
  private-data
)
ARGS=(--force --invert-paths --replace-text "$WORK/replace.txt" --replace-message "$WORK/replace.txt")
for p in "${STRIP[@]}"; do ARGS+=(--path "$p"); done
if ! "${FR[@]}" "${ARGS[@]}" >"$WORK/filter-repo.log" 2>&1; then cat "$WORK/filter-repo.log" >&2; echo "git filter-repo failed; $DEST is incomplete, delete it before retrying" >&2; exit 1; fi
git remote remove origin 2>/dev/null || true   # filter-repo already drops it
# filter-repo turns the old origin/<branch> remote-tracking ref into a local branch: drop it, keep only master.
git branch -D "$BRANCH" -q 2>/dev/null || true
for r in $(git for-each-ref --format='%(refname)' | grep -v '^refs/heads/master$'); do git update-ref -d "$r"; done

# Re-add today's synthetic live fixtures (they were stripped from history above).
git -C "$SRC" archive "$BRANCH" cloud_run/qloo_gateway/test/fixtures/live | tar -x
git add cloud_run/qloo_gateway/test/fixtures/live
GIT_NAME="$(git -C "$SRC" config user.name || echo author)"; GIT_MAIL="$(git -C "$SRC" config user.email || echo author@example.invalid)"
git -c user.name="$GIT_NAME" -c user.email="$GIT_MAIL" commit -q \
  -m "test: synthetic Qloo response fixtures (same shape, fake values)" -m "$TRAILER"
rm -rf .git/refs/original && git reflog expire --expire=now --all && git gc --prune=now -q

# --- 3. verify -------------------------------------------------------------------------------------------------
echo "remotes: [$(git remote)]  refs: $(git for-each-ref --format='%(refname)' | tr '\n' ' ')"
bash "$SRC/scripts/check-public-data.sh" --history "$DEST"
# Final hard gate: no skips. Every object of every ref (blobs, trees, commits, tags), any size, any path.
ALLOW_RE='^(00000000-|672c258a-7d63-4164-a4c6-a34f17490f53$)'
left=$(git cat-file --batch-all-objects --batch | grep -a -o -i -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | grep -v -i -E "$ALLOW_RE" | sort -u | wc -l | tr -d ' ')
if [[ "$left" != 0 ]]; then echo "FINAL GATE FAILED: $left real-looking id(s) remain in $DEST (objects incl. commit messages)" >&2; exit 1; fi
if [[ -f "$EXTRA" ]]; then
  sed -n 's/==>.*//p' "$EXTRA" >"$WORK/literals.txt"
  if git cat-file --batch-all-objects --batch | grep -a -q -F -f "$WORK/literals.txt"; then echo "FINAL GATE FAILED: an extra literal remains in $DEST" >&2; exit 1; fi
fi
echo "final gate: no real-looking ids in any object (no path or size skips)"
SCAN="$HOME/Documents/hackathon-brain/tools/secrets_scan.sh"
if [[ -f "$SCAN" ]]; then bash "$SCAN" "$DEST"; else echo "secrets scan skipped: $SCAN not found"; fi
echo "elapsed: $(( $(date +%s) - START ))s"
echo "Public clone ready at $DEST (master, no remote). Next (Prateek): see scripts/README-public-clone.md"
