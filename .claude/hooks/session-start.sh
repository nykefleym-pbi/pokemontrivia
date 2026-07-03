#!/bin/bash
set -euo pipefail

# Install dependencies for Claude Code on the web sessions so tests
# (vitest) and linters (eslint) work immediately. No-op locally.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install (not ci) so the cached container state is reused across
# sessions; .npmrc already forces dev dependencies to be included.
npm install --no-audit --no-fund
