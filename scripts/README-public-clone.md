# Public clone

`scripts/make-public-clone.sh DEST` builds the public repo locally from this private one. It never pushes, never adds a remote, and only writes DEST (refused if it exists, including a dangling symlink). Pass DEST explicitly, for example `bash scripts/make-public-clone.sh ~/Documents/qloo/tour-intelligence-qloo-public`: the default (`../tour-intelligence-qloo-public`) resolves inside `.claude/worktrees/` when run from a worktree. The resolved DEST is printed first.

What it does:

1. Clones `worktree-plan-1-qloo-gateway` and renames it `master`.
2. With `git filter-repo`, drops the Qloo data paths from every commit (showcase and backtest fixtures, `backtest/results*.json`, gateway `calibration` and `live` fixtures, `private-data/`). Commits left empty are pruned; dates and authors are kept.
3. Rewrites every real Qloo entity id found anywhere in the branch history to its synthetic id (same `syntheticId` as the synthetic fixtures), in both letter cases, in file contents and commit messages. Extra literals (for example a Qloo-returned name in an old test) are read from the git-ignored `private-data/extra-replacements.txt`, one `LITERAL==>PLACEHOLDER` per line, so the sensitive literal is never committed.
4. Re-adds the current synthetic `live` fixtures in one final commit.
5. Runs `scripts/check-public-data.sh --history DEST`, a final gate that scans every object in DEST with no path or size skips and fails if any real-looking id (or extra literal) remains, and the hackathon-brain secrets scan. Any failure stops the script.

Needs git-filter-repo, installed into a throwaway venv, not globally:

```
python3 -m venv /tmp/fr && /tmp/fr/bin/pip install git-filter-repo
GIT_FILTER_REPO=/tmp/fr/bin/git-filter-repo bash scripts/make-public-clone.sh
```

## What Prateek runs after (all by him)

1. Rename the private repo (D3):
   `gh repo rename tour-intelligence-qloo-private -R prats-2311/tour-intelligence-qloo`
2. Create and push the public repo from the clone:
   `gh repo create prats-2311/tour-intelligence-qloo --public --source <DEST> --push --description "Tour Intelligence × Qloo — Win their city"`
3. Confirm the license: `gh api repos/prats-2311/tour-intelligence-qloo --jq .license.spdx_id` prints `MIT`.
4. Open the repo logged out and look at it.

Run the script again (to a fresh DEST) after any new commit on the branch.
