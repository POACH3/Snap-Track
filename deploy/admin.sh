#!/bin/bash
# Runs a SnapTrack admin command against PRODUCTION, as the service account.
#   sudo deploy/admin.sh user:create
#   sudo deploy/admin.sh user:set-password
# Both change the production database (.claude/rules/database-commands.md).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_root "$@"

[ -L "$CURRENT" ] || die "Nothing is deployed yet."
case "${1:-}" in
  user:create) command=create ;;
  user:set-password) command=set-password ;;
  *) die "Usage: sudo deploy/admin.sh user:create | user:set-password" ;;
esac
say "PRODUCTION: $1"
# A working folder _snaptrack can open (not the admin's checkout).
cd "$DATA"
as_service "$NODE" "--env-file=$ENV_FILE" "$CURRENT/apps/server/src/cli/users.ts" "$command"
