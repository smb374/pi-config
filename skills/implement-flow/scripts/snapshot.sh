#!/bin/sh
# Usage: snapshot.sh <base> <brief-dir> <pass>
# Writes <brief-dir>/diff.patch (whole change set vs <base>, new files included)
# and <brief-dir>/tree-<pass>.txt (tree hash of the working tree).
# When tree-<pass-1>.txt exists, also writes <brief-dir>/delta-<pass>.patch,
# the change since the last snapshot. Prints the changed file names.
set -eu

[ $# -eq 3 ] || { echo "usage: snapshot.sh <base> <brief-dir> <pass>" >&2; exit 2; }
base=$1
dir=$2
pass=$3

# Intent-to-add makes untracked files show in the diff; staging stays in the commit step.
git ls-files --others --exclude-standard -z | xargs -0 -r git add -N --

git diff --no-color --no-ext-diff "$base" --output="$dir/diff.patch"

# A temporary index gives a tree hash of the working tree. The real index stays untouched.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
cp "$(git rev-parse --git-path index)" "$tmp"
GIT_INDEX_FILE=$tmp git add -A
GIT_INDEX_FILE=$tmp git write-tree > "$dir/tree-$pass.txt"

prev="$dir/tree-$((pass - 1)).txt"
if [ -f "$prev" ]; then
	git diff --no-color --no-ext-diff "$(cat "$prev")" "$(cat "$dir/tree-$pass.txt")" \
		--output="$dir/delta-$pass.patch"
fi

git diff --no-ext-diff "$base" --name-only
