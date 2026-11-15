#!/bin/bash
# Deploys one commit to PRODUCTION SnapTrack on this Mac (SPEC.md §4.7, "Deploy").
#   sudo deploy/deploy.sh             deploy HEAD of this checkout
#   sudo deploy/deploy.sh <commit>    deploy a specific commit
#   sudo deploy/deploy.sh --rollback  go back to the previous release
# Asks before running migrations and before restoring a database backup.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_root "$@"
# Commands run as _snaptrack need a working folder it can open (not the admin's checkout).
cd "$ROOT"

[ -x "$FIREWALL_DIR/firewall.sh" ] && [ -f "$ENV_FILE" ] && [ -f "$SERVICE_PLIST" ] ||
  die "Host is not set up yet. Run: sudo deploy/setup.sh"

PORT="$(env_value PORT)"
DATABASE_PATH="$(env_value DATABASE_PATH)"
[ -n "$PORT" ] && [ -n "$DATABASE_PATH" ] || die "PORT and DATABASE_PATH must be set in $ENV_FILE."

restart_service() {
  if service_loaded "$SERVICE_LABEL"; then
    launchctl kickstart -k "system/$SERVICE_LABEL"
  else
    launchctl bootstrap system "$SERVICE_PLIST"
  fi
}

wait_until_healthy() {
  local i
  for i in $(seq 1 30); do
    if /usr/bin/curl -fsS -m 2 -o /dev/null "http://127.0.0.1:$PORT/healthz"; then return 0; fi
    sleep 1
  done
  return 1
}

point_current_at() { ln -sfhn "releases/$1" "$CURRENT"; }
current_release() { [ -L "$CURRENT" ] && basename "$(readlink "$CURRENT")" || true; }

# --------------------------------------------------------------------------- rollback

if [ "${1:-}" = "--rollback" ]; then
  current="$(current_release)"
  [ -n "$current" ] || die "Nothing is deployed."
  # Releases, newest first; the one after the current is where we go back to.
  previous="$(ls -t "$RELEASES" | awk -v cur="$current" 'found { print; exit } $0 == cur { found = 1 }')"
  [ -n "$previous" ] || die "No release older than $current to go back to."

  say "Rolling PRODUCTION back from $current to $previous"
  restore=""
  info_file="$RELEASES/$current/.deploy-info"
  if [ -f "$info_file" ] && grep -q '^migrations_applied=[1-9]' "$info_file"; then
    backup="$(sed -n 's/^backup=//p' "$info_file")"
    info "$current ran migrations when it was deployed, so $previous may not work with the database as it is now."
    info "A backup was taken just before: $backup"
    info "Restoring it LOSES everything saved in production since that deploy."
    read -r -p "    Restore that backup into $DATABASE_PATH? Type 'restore' to restore, anything else to skip: " answer
    [ "$answer" = restore ] && restore="$backup"
  fi

  if [ -n "$restore" ]; then
    [ -f "$restore" ] || die "Backup $restore is missing."
    launchctl bootout "system/$SERVICE_LABEL" 2>/dev/null || true
    as_service /bin/cp "$DATABASE_PATH" "$BACKUPS/before-rollback-$(date +%Y%m%d-%H%M%S).db"
    as_service /bin/rm -f "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"
    as_service /bin/cp "$restore" "$DATABASE_PATH"
    info "restored (the replaced database was kept in $BACKUPS)"
  fi
  point_current_at "$previous"
  restart_service
  wait_until_healthy || die "$previous did not answer on port $PORT. See $LOG_FILE."
  say "Production is now running $previous."
  exit 0
fi

# ----------------------------------------------------------------------------- deploy

ref="${1:-HEAD}"
commit="$(as_admin git -C "$REPO" rev-parse --verify "$ref^{commit}")" || die "Unknown commit: $ref"
if [ "$ref" = HEAD ] && [ -n "$(as_admin git -C "$REPO" status --porcelain)" ]; then
  die "This checkout has uncommitted changes. Commit them first, or name a commit to deploy."
fi
release="${commit:0:12}"
say "Deploying $release ($(as_admin git -C "$REPO" log -1 --format=%s "$commit")) to PRODUCTION"

say "1. Export the commit to $BUILD/$release"
rm -rf "${BUILD:?}/$release"
as_service mkdir -p "$BUILD/$release"
as_admin git -C "$REPO" archive "$commit" | as_service tar -x -C "$BUILD/$release"

say "2. Runtime"
node_version="$(node_version_in "$BUILD/$release")"
pnpm_version="$(pnpm_version_in "$BUILD/$release")"
if [ "$("$NODE" --version 2>/dev/null)" = "v$node_version" ] && [ "$("$PNPM" --version 2>/dev/null)" = "$pnpm_version" ]; then
  info "Node $node_version and pnpm $pnpm_version already installed"
else
  install_runtime "$node_version" "$pnpm_version"
fi

say "3. Install (internet open for $SERVICE_USER during this step only) and build"
trap 'firewall on; echo "    firewall back on"' EXIT
firewall off
(cd "$BUILD/$release" && as_service "$PNPM" install --frozen-lockfile)
firewall on
trap - EXIT
info "firewall back on"
(cd "$BUILD/$release" && as_service "$PNPM" build)

say "4. Copy into $RELEASES/$release (owned by root)"
rm -rf "${RELEASES:?}/$release"
cp -Rp "$BUILD/$release" "$RELEASES/$release"
chown -R root:"$SERVICE_USER" "$RELEASES/$release"
chmod -R u=rwX,g=rX,o= "$RELEASES/$release"
rm -rf "${BUILD:?}/$release"

say "5. Database"
migrate() { as_service "$NODE" "--env-file=$ENV_FILE" "$RELEASES/$release/apps/server/src/platform/db/migrate-cli.ts" "$@"; }
pending="$(migrate --check)"
backup=""
applied=0
if [ "$pending" -gt 0 ]; then
  backup="$BACKUPS/pre-deploy-$release-$(date +%Y%m%d-%H%M%S).db"
  if [ -f "$DATABASE_PATH" ]; then
    as_service /usr/bin/sqlite3 "$DATABASE_PATH" ".backup '$backup'"
    info "backed up to $backup"
  fi
  info "$pending migration(s) to apply to the PRODUCTION database $DATABASE_PATH."
  read -r -p "    Type 'migrate' to apply them, anything else to stop: " answer
  [ "$answer" = migrate ] || die "Stopped before migrating. Production is unchanged; $release is copied but not running."
  migrate
  applied="$pending"
else
  info "no migrations pending"
fi
printf 'commit=%s\ndeployed_at=%s\nmigrations_applied=%s\nbackup=%s\n' \
  "$commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$applied" "$backup" >"$RELEASES/$release/.deploy-info"
chmod 640 "$RELEASES/$release/.deploy-info"
chown root:"$SERVICE_USER" "$RELEASES/$release/.deploy-info"

say "6. Switch to $release and restart"
previous="$(current_release)"
point_current_at "$release"
restart_service
if ! wait_until_healthy; then
  if [ -n "$previous" ] && [ "$previous" != "$release" ]; then
    point_current_at "$previous"
    restart_service
    die "$release did not answer on port $PORT; switched back to $previous. See $LOG_FILE.$([ "$applied" -gt 0 ] && echo " Migrations were applied; the backup is $backup.")"
  fi
  die "$release did not answer on port $PORT. See $LOG_FILE."
fi
info "answering on http://127.0.0.1:$PORT"

say "7. Keep the newest three releases"
ls -t "$RELEASES" | tail -n +4 | while read -r old; do
  [ "$old" = "$release" ] && continue
  info "remove $old"
  rm -rf "${RELEASES:?}/$old"
done

say "Production is running $release at $(env_value PUBLIC_ORIGIN)"
