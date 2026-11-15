#!/bin/bash
# Shared settings and helpers for setup.sh, deploy.sh and admin.sh (SPEC.md §4.7).
# Sourced, not run. macOS ships bash 3.2, so no bash 4 features here.

ROOT=/opt/snap-track
APP="$ROOT/app"
RELEASES="$APP/releases"
CURRENT="$APP/current"
RUNTIME="$ROOT/runtime"
CONFIG="$ROOT/config"
ENV_FILE="$CONFIG/.env"
FIREWALL_DIR="$ROOT/firewall"
BUILD="$ROOT/build"
DATA="$ROOT/data"
BACKUPS="$DATA/backups"
LOGS="$ROOT/logs"
LOG_FILE="$LOGS/snaptrack.log"
HOME_DIR="$ROOT/home"

SERVICE_USER=_snaptrack
SERVICE_LABEL=snaptrack
SERVICE_PLIST=/Library/LaunchDaemons/snaptrack.plist
FIREWALL_LABEL=snaptrack.firewall
FIREWALL_PLIST=/Library/LaunchDaemons/snaptrack.firewall.plist
NEWSYSLOG_CONF=/etc/newsyslog.d/snaptrack.conf

NODE="$RUNTIME/bin/node"
PNPM="$RUNTIME/bin/pnpm"
MISE=/opt/homebrew/bin/mise

# HTTPS port on the Tailscale name. 443 is used by the LLM server's chat page.
HTTPS_PORT=8443
PRODUCTION_PORT=4300

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Run with sudo: sudo $0 $*"
  [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ] || die "Run with sudo from your own account, not as root directly."
}

# Run a command as the service account, with its own home folder.
as_service() { sudo -u "$SERVICE_USER" -H env HOME="$HOME_DIR" PATH="$RUNTIME/bin:/usr/bin:/bin" "$@"; }

# Run a command as the admin who invoked sudo (git refuses to work in their repo as root).
as_admin() { sudo -u "$SUDO_USER" "$@"; }

# Versions pinned in a source tree (the repo, or an exported release).
node_version_in() { tr -d '[:space:]' <"$1/.node-version"; }
pnpm_version_in() {
  sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$1/package.json"
}

# A value from the production .env (root can read it; agents never do).
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

# Installs the pinned Node and pnpm into $RUNTIME with mise, root-owned, and points
# $RUNTIME/bin at them. Idempotent; reports whether anything changed.
install_runtime() {
  local node_version="$1" pnpm_version="$2"
  [ -x "$MISE" ] || die "mise not found at $MISE (brew install mise, from the admin account)."
  say "Runtime: Node $node_version, pnpm $pnpm_version"
  (
    cd /
    export MISE_DATA_DIR="$RUNTIME/mise" MISE_CACHE_DIR="$RUNTIME/mise-cache" MISE_CONFIG_DIR="$RUNTIME/mise-config"
    "$MISE" install "node@$node_version" "pnpm@$pnpm_version" >/dev/null
  ) || die "mise could not install the runtime."
  local node_bin pnpm_bin
  node_bin="$RUNTIME/mise/installs/node/$node_version/bin/node"
  pnpm_bin="$(find "$RUNTIME/mise/installs/pnpm/$pnpm_version" -name pnpm -type f -perm -u+x 2>/dev/null | head -n 1)"
  [ -x "$node_bin" ] || die "Node was not found at $node_bin after installing."
  [ -n "$pnpm_bin" ] || die "pnpm was not found under $RUNTIME/mise/installs/pnpm/$pnpm_version after installing."
  mkdir -p "$RUNTIME/bin"
  ln -sfn "$node_bin" "$RUNTIME/bin/node"
  ln -sfn "$pnpm_bin" "$RUNTIME/bin/pnpm"
  chown -R root:"$SERVICE_USER" "$RUNTIME"
  chmod -R u=rwX,g=rX,o= "$RUNTIME"
  info "node: $("$NODE" --version)   pnpm: $("$PNPM" --version)"
}

firewall() { /bin/sh "$FIREWALL_DIR/firewall.sh" "$1"; }

service_loaded() { launchctl print "system/$1" >/dev/null 2>&1; }
