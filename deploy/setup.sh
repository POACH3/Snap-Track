#!/bin/bash
# One-time host setup for production SnapTrack on this Mac (SPEC.md §4.7). Safe to re-run.
#   sudo deploy/setup.sh          set up folders, permissions, runtime, config, firewall, LaunchDaemons
#   sudo deploy/setup.sh --check  change nothing; check permissions and the firewall
# It never touches the database, images or other data in /opt/snap-track/data.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_root "$@"

# ---------------------------------------------------------------------------- checks

check_failures=0
pass() { printf '    ok    %s\n' "$*"; }
fail() {
  printf '    FAIL  %s\n' "$*"
  check_failures=$((check_failures + 1))
}
expect_owner_mode() { # path owner:group mode
  local actual
  actual="$(stat -f '%Su:%Sg %Lp' "$1" 2>/dev/null || echo missing)"
  if [ "$actual" = "$2 $3" ]; then pass "$1 is $2 $3"; else fail "$1 is $actual, expected $2 $3"; fi
}
as_user_succeeds() { sudo -u "$1" /bin/sh -c "$2" >/dev/null 2>&1; }

run_checks() {
  say "Ownership and modes"
  expect_owner_mode "$ROOT" "root:$SERVICE_USER" 750
  expect_owner_mode "$APP" "root:$SERVICE_USER" 750
  expect_owner_mode "$RUNTIME" "root:$SERVICE_USER" 750
  expect_owner_mode "$CONFIG" "root:wheel" 700
  expect_owner_mode "$ENV_FILE" "root:wheel" 600
  expect_owner_mode "$FIREWALL_DIR" "root:wheel" 700
  for dir in "$BUILD" "$DATA" "$LOGS" "$HOME_DIR"; do expect_owner_mode "$dir" "$SERVICE_USER:$SERVICE_USER" 700; done

  say "Access control lists (only _snaptrack's, on config/ and .env)"
  local acl_lines
  acl_lines="$(ls -led "$ROOT" "$APP" "$RUNTIME" "$CONFIG" "$ENV_FILE" "$DATA" "$LOGS" "$HOME_DIR" | grep -E '^ [0-9]+:' || true)"
  if [ "$(printf '%s\n' "$acl_lines" | grep -c "user:$SERVICE_USER allow" || true)" -eq 2 ] &&
    [ "$(printf '%s\n' "$acl_lines" | grep -c . || true)" -eq 2 ]; then
    pass "exactly two ACL entries, both for $SERVICE_USER"
  else
    fail "unexpected ACL entries:"
    printf '%s\n' "$acl_lines"
  fi

  say "What $SERVICE_USER can do"
  as_user_succeeds "$SERVICE_USER" "cat '$ENV_FILE'" && pass "reads .env" || fail "cannot read .env"
  as_user_succeeds "$SERVICE_USER" "echo x >> '$ENV_FILE'" && fail "can change .env" || pass "cannot change .env"
  for dir in "$APP" "$RUNTIME" "$CONFIG"; do
    as_user_succeeds "$SERVICE_USER" "touch '$dir/.write-test'" && fail "can write to $dir" || pass "cannot write to $dir"
    rm -f "$dir/.write-test"
  done
  if [ -L "$CURRENT" ]; then
    as_user_succeeds "$SERVICE_USER" "touch '$CURRENT/.write-test'" && fail "can write to the running release" ||
      pass "cannot write to the running release"
    rm -f "$CURRENT/.write-test"
  fi
  as_user_succeeds "$SERVICE_USER" "touch '$DATA/.write-test' && rm '$DATA/.write-test'" && pass "writes to data/" ||
    fail "cannot write to data/"

  say "What $SUDO_USER (the admin account, without sudo) can do"
  as_user_succeeds "$SUDO_USER" "ls '$DATA'" && fail "can list data/" || pass "cannot list data/"
  as_user_succeeds "$SUDO_USER" "cat '$ENV_FILE'" && fail "can read .env" || pass "cannot read .env"
  as_user_succeeds "$SUDO_USER" "ls '$CONFIG'" && fail "can list config/" || pass "cannot list config/"

  say "Outgoing internet for $SERVICE_USER"
  as_user_succeeds "$SERVICE_USER" "/usr/bin/curl -sS -m 5 -o /dev/null https://example.com" &&
    fail "can reach https://example.com" || pass "cannot reach https://example.com"
  as_user_succeeds "$SERVICE_USER" "/usr/bin/curl -sS -m 5 -o /dev/null https://1.1.1.1" &&
    fail "can reach https://1.1.1.1" || pass "cannot reach https://1.1.1.1"
  # Any answer at all (even an error page) proves localhost is reachable.
  as_user_succeeds "$SERVICE_USER" "/usr/bin/curl -s -m 5 -o /dev/null http://127.0.0.1:8081/" &&
    pass "reaches the LLM relay on 127.0.0.1:8081" || fail "cannot reach 127.0.0.1:8081 (is the LLM relay running?)"

  say "Services"
  service_loaded "$FIREWALL_LABEL" && pass "$FIREWALL_LABEL loaded" || fail "$FIREWALL_LABEL not loaded"
  if service_loaded "$SERVICE_LABEL"; then pass "$SERVICE_LABEL loaded"; else info "$SERVICE_LABEL not loaded yet (the first deploy starts it)"; fi

  if [ "$check_failures" -eq 0 ]; then say "All checks passed."; else say "$check_failures check(s) failed."; exit 1; fi
}

if [ "${1:-}" = "--check" ]; then
  run_checks
  exit 0
fi

# ---------------------------------------------------------------------------- setup

say "Service account"
id "$SERVICE_USER" >/dev/null 2>&1 || die "$SERVICE_USER does not exist. Create it first (deploy/README.md)."
info "$SERVICE_USER: $(id "$SERVICE_USER")"
members="$(dscl . -read "/Groups/$SERVICE_USER" GroupMembership 2>/dev/null | sed 's/^GroupMembership: *//' || true)"
[ -n "$members" ] && info "Other members of group $SERVICE_USER: $members (they can read app/ and runtime/, which hold only code)"

say "Folders and permissions"
make_dir() { # path owner:group mode
  [ -d "$1" ] || info "create $1"
  mkdir -p "$1"
  chown "$2" "$1"
  chmod "$3" "$1"
}
make_dir "$ROOT" "root:$SERVICE_USER" 750
make_dir "$APP" "root:$SERVICE_USER" 750
make_dir "$RELEASES" "root:$SERVICE_USER" 750
make_dir "$RUNTIME" "root:$SERVICE_USER" 750
make_dir "$CONFIG" "root:wheel" 700
make_dir "$FIREWALL_DIR" "root:wheel" 700
for dir in "$BUILD" "$DATA" "$BACKUPS" "$DATA/images" "$LOGS" "$HOME_DIR"; do
  make_dir "$dir" "$SERVICE_USER:$SERVICE_USER" 700
done
# config/ is shared with _snaptrack by name, not through its group (SPEC.md §4.7).
chmod -N "$CONFIG"
chmod +a "user:$SERVICE_USER allow list,search" "$CONFIG"
info "data/ and home/ are owner-only (700); config/ is readable by $SERVICE_USER only"

install_runtime "$(node_version_in "$REPO")" "$(pnpm_version_in "$REPO")"

say "Configuration ($ENV_FILE)"
if [ -f "$ENV_FILE" ]; then
  info "exists; left unchanged"
else
  dns_name="$(/usr/local/bin/tailscale status --json 2>/dev/null | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' || true)"
  [ -n "$dns_name" ] || die "Could not read this Mac's Tailscale name; is Tailscale running?"
  secret="$(/usr/bin/openssl rand -base64 48 | tr -d '\n')"
  sed -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
    -e "s|^PORT=.*|PORT=$PRODUCTION_PORT|" \
    -e "s|^DATABASE_PATH=.*|DATABASE_PATH=$DATA/snaptrack.db|" \
    -e "s|^IMAGE_DIR=.*|IMAGE_DIR=$DATA/images|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|" \
    -e "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=https://$dns_name:$HTTPS_PORT|" \
    "$REPO/.env.example" >"$ENV_FILE"
  info "created from .env.example with production paths, port $PRODUCTION_PORT, a new session secret,"
  info "and PUBLIC_ORIGIN=https://$dns_name:$HTTPS_PORT"
  info "STILL TO FILL IN (sudo nano $ENV_FILE): LLM_SERVER_URL, LLM_SERVER_API_KEY, EXTRACTION_MODEL"
fi
chown root:wheel "$ENV_FILE"
chmod 600 "$ENV_FILE"
chmod -N "$ENV_FILE"
chmod +a "user:$SERVICE_USER allow read" "$ENV_FILE"

say "Logs ($LOG_FILE, rotated by newsyslog)"
touch "$LOG_FILE"
chown "$SERVICE_USER:$SERVICE_USER" "$LOG_FILE"
chmod 600 "$LOG_FILE"
# Rotate at 10 MB, keep 7, compressed.
echo "$LOG_FILE $SERVICE_USER:$SERVICE_USER 600 7 10240 * J" >"$NEWSYSLOG_CONF"

say "Firewall (pf anchor com.apple/300.SnapTrack)"
install -o root -g wheel -m 700 "$REPO/deploy/firewall/firewall.sh" "$FIREWALL_DIR/firewall.sh"
install -o root -g wheel -m 600 "$REPO/deploy/firewall/snaptrack.pf" "$FIREWALL_DIR/snaptrack.pf"
cat >"$FIREWALL_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$FIREWALL_LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>$FIREWALL_DIR/firewall.sh</string><string>on</string></array>
  <key>RunAtLoad</key><true/>
  <!-- Re-applied every minute, in case anything (a VPN client, a pf reload) flushes the rules. -->
  <key>StartInterval</key><integer>60</integer>
</dict>
</plist>
PLIST
chown root:wheel "$FIREWALL_PLIST"
chmod 644 "$FIREWALL_PLIST"
if service_loaded "$FIREWALL_LABEL"; then launchctl bootout "system/$FIREWALL_LABEL" || true; fi
launchctl bootstrap system "$FIREWALL_PLIST"
firewall on
firewall status | sed 's/^/    /'

say "SnapTrack LaunchDaemon ($SERVICE_PLIST)"
cat >"$SERVICE_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$SERVICE_LABEL</string>
  <key>UserName</key><string>$SERVICE_USER</string>
  <key>GroupName</key><string>$SERVICE_USER</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file=$ENV_FILE</string>
    <string>$CURRENT/apps/server/src/start-production.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>$HOME_DIR</string>
    <key>NODE_ENV</key><string>production</string>
    <key>PATH</key><string>/usr/bin:/bin</string>
  </dict>
  <key>WorkingDirectory</key><string>$DATA</string>
  <!-- 077: files the service creates are private to it. -->
  <key>Umask</key><integer>63</integer>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG_FILE</string>
  <key>StandardErrorPath</key><string>$LOG_FILE</string>
</dict>
</plist>
PLIST
chown root:wheel "$SERVICE_PLIST"
chmod 644 "$SERVICE_PLIST"
plutil -lint "$SERVICE_PLIST" "$FIREWALL_PLIST" | sed 's/^/    /'
info "written; the first deploy (sudo deploy/deploy.sh) starts it"

say "Tailscale HTTPS"
if /usr/local/bin/tailscale serve status 2>/dev/null | grep -q ":$HTTPS_PORT"; then
  info "port $HTTPS_PORT already served; left unchanged"
else
  /usr/local/bin/tailscale serve --bg --https="$HTTPS_PORT" "http://127.0.0.1:$PRODUCTION_PORT"
fi
/usr/local/bin/tailscale serve status | sed 's/^/    /'

say "Setup finished. Checking it:"
run_checks
