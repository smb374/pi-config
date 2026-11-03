default:
    @just --list

fmt:
    bunx biome format --write .

lint:
    bunx biome check --write .

typecheck:
    bun tsc --noEmit

test:
    bun test

check: fmt lint typecheck test

setup:
    bun scripts/setup.ts
