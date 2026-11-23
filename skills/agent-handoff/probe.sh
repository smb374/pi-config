#!/usr/bin/env bash
# Throwaway worktree for reviewer probes. The live tree, index, and refs stay unchanged.
# usage: probe.sh create          prints the path of a worktree that holds a snapshot of the dirty tree
#        probe.sh remove <path>   removes that worktree and checks that it is gone
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

case "${1:-}" in
create)
  wt=$(mktemp -d /tmp/probe-XXXXXX)
  idx="$wt.idx"
  trap 'rm -f "$idx"' EXIT
  GIT_INDEX_FILE=$idx git add -A
  tree=$(GIT_INDEX_FILE=$idx git write-tree)
  commit=$(git -c user.name=probe -c user.email=probe@localhost commit-tree "$tree" -p HEAD -m probe-snapshot)
  git worktree add --quiet --detach "$wt" "$commit"
  echo "$wt"
  ;;
remove)
  wt=${2:?usage: probe.sh remove <path>}
  case "$wt" in
  /tmp/probe-*) ;;
  *) echo "refuse: $wt is not a /tmp/probe-* path" >&2; exit 2 ;;
  esac
  git worktree list --porcelain | grep -qxF "worktree $wt" || { echo "refuse: $wt is not a worktree of this repo" >&2; exit 2; }
  git worktree remove --force "$wt"
  rm -f "$wt.idx"
  if [ -e "$wt" ] || git worktree list --porcelain | grep -qxF "worktree $wt"; then
    echo "cleanup failed: $wt" >&2
    exit 1
  fi
  echo "removed $wt"
  ;;
*)
  echo "usage: probe.sh create | remove <path>" >&2
  exit 2
  ;;
esac
