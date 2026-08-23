#!/usr/bin/env bash
# Local pre-push gate — mirrors ci.yml build-test job minus services.
set -euo pipefail
pnpm install --reporter=silent
pnpm turbo build && pnpm turbo typecheck lint
pnpm --filter '!@kithlink/e2e' test
echo "preflight OK"
