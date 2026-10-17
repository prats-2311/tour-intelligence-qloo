#!/usr/bin/env bash
# Tests scripts/check-public-data.sh --history in throwaway repos: renamed blobs, other branches, ids removed
# from the tip but still in history, lowercase copies, allowlisted ids, and a clean repo.
set -uo pipefail
GUARD="${GUARD:-$(cd "$(dirname "$0")" && pwd)/check-public-data.sh}"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
fails=0
REAL='00000000-EA91-A58E-1808-344CA61895A2'

new_repo() { # name -> path with one innocuous commit on master
  local d="$ROOT/$1"; mkdir -p "$d"
  git -C "$d" init -q -b master
  git -C "$d" config user.email t@example.invalid; git -C "$d" config user.name t
  echo hello >"$d/README.md"; git -C "$d" add README.md; git -C "$d" commit -q -m init
  echo "$d"
}
commit_file() { # repo path content
  mkdir -p "$(dirname "$1/$2")"; printf '%s\n' "$3" >"$1/$2"; git -C "$1" add "$2"; git -C "$1" commit -q -m "add $2"
}
expect() { # name want_exit repo [grep-pattern]
  local out rc
  out=$(bash "$GUARD" --history "$3" 2>&1); rc=$?
  if [[ $rc -ne $2 ]] || { [[ -n "${4:-}" ]] && ! grep -q -- "$4" <<<"$out"; }; then
    echo "FAIL: $1 (exit $rc, want $2)"; echo "$out" | sed 's/^/   /'; fails=$((fails+1))
  else echo "ok:   $1"; fi
}

r=$(new_repo clean);        commit_file "$r" src/a.ts 'export const a = 1'
expect "clean repo passes" 0 "$r" "clean"

r=$(new_repo renamed);      commit_file "$r" backtest/results.json '{"x":1}'
mkdir -p "$r/old"; git -C "$r" mv backtest/results.json old/results.json; git -C "$r" commit -q -m rename
expect "renamed forbidden blob is still reported (old path in history)" 1 "$r" "backtest/results.json"

r=$(new_repo deleted);      commit_file "$r" private-data/showcase.json '{}'
git -C "$r" rm -q -r private-data; git -C "$r" commit -q -m rm
expect "forbidden path deleted from tip but in history" 1 "$r" "private-data/"

r=$(new_repo otherbranch);  git -C "$r" checkout -q -b feature; commit_file "$r" cloud_run/qloo_gateway/test/fixtures/calibration/a.json '{}'
git -C "$r" checkout -q master
expect "forbidden path only on another branch" 1 "$r" "test/fixtures/calibration/"

r=$(new_repo idbranch);     git -C "$r" checkout -q -b feature; commit_file "$r" notes.md "entity $REAL"
git -C "$r" checkout -q master
expect "real id only on another branch" 1 "$r" "notes.md"

r=$(new_repo idremoved);    commit_file "$r" docs/n.md "entity $REAL"
echo clean >"$r/docs/n.md"; git -C "$r" commit -q -am scrub
expect "real id removed from tip, still in history" 1 "$r" "docs/n.md"

r=$(new_repo lowercase);    commit_file "$r" docs/l.md "entity $(tr 'A-F' 'a-f' <<<"$REAL")"
expect "lowercased real id" 1 "$r" "docs/l.md"

r=$(new_repo renamedid);    commit_file "$r" docs/a.md "entity $REAL"
git -C "$r" mv docs/a.md docs/b.md; git -C "$r" commit -q -m mv
expect "id in a renamed file" 1 "$r" "real-looking Qloo entity ids"

r=$(new_repo pngid);        commit_file "$r" assets/logo.png "entity $REAL"
expect "real id inside a .png-named file" 1 "$r" "assets/logo.png"

r=$(new_repo bigblob);      mkdir -p "$r/data"; { head -c 6000000 /dev/zero | tr '\0' 'x'; echo " $REAL"; } >"$r/data/big.txt"
git -C "$r" add data/big.txt; git -C "$r" commit -q -m big
expect "real id inside a >5 MB blob" 1 "$r" "data/big.txt"

r=$(new_repo allowed);      commit_file "$r" fx.json '{"id":"00000000-1111-2222-3333-444444444444","agent":"672c258a-7d63-4164-a4c6-a34f17490f53"}'
expect "synthetic and allowlisted ids pass" 0 "$r" "clean"

[[ $fails -eq 0 ]] && echo "all check-public-data tests passed" || { echo "$fails failed"; exit 1; }
