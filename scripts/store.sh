#!/bin/bash
# Run the shared app_store `store` orchestrator against this project.
#   RN:     bun run store -- --screenshots:iphone:en
#   native: ./scripts/store.sh --submit:appstore
# APP_STORE_DIR may be preset (e.g. a 2nd product) and is honored if so.
set -eo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -n "${APP_STORE_DIR:-}" ]; then
  export APP_STORE_DIR="$(cd "$APP_STORE_DIR" && pwd)"
else
  export APP_STORE_DIR="$PROJECT_DIR/app_store"
fi
export WORKFLOWS_DIR="${WORKFLOWS_DIR:-$HOME/projects/workflows/app_store}"
exec "$WORKFLOWS_DIR/store" "$@"
