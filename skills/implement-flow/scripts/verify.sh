#!/bin/sh
# Usage: verify.sh <brief-dir> <recipe>...
# Runs `just <recipe>` for each recipe in order. Writes all output to
# <brief-dir>/verify.txt, replacing the old file. Stops at the first failure
# and exits with the exit code of that recipe.
set -u

[ $# -ge 2 ] || { echo "usage: verify.sh <brief-dir> <recipe>..." >&2; exit 2; }
out=$1/verify.txt
shift
: > "$out"

for recipe in "$@"; do
	echo "## just $recipe" >> "$out"
	just "$recipe" >> "$out" 2>&1
	code=$?
	echo "## exit $code" >> "$out"
	if [ "$code" -ne 0 ]; then
		echo "FAILED: just $recipe (exit $code); see $out" >&2
		exit "$code"
	fi
done
echo "OK: $* ; see $out"
