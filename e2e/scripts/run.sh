#!/usr/bin/env bash
# One command: start the stack, run the tests, always stop the stack. Extra arguments go to Playwright.
set -uo pipefail
cd "$(dirname "$0")/.."
bash scripts/stack.sh up || { bash scripts/stack.sh down; exit 1; }
npx playwright test "$@"
code=$?
bash scripts/stack.sh down
exit $code
