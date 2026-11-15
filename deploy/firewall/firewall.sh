#!/bin/sh
# Turns SnapTrack's outgoing-internet block on or off, or shows it (SPEC.md §4.7).
# Installed by setup.sh to /opt/snap-track/firewall/ (root-only). Run as root.
#   on      load the rules and make sure pf is enabled (also run every minute at boot by
#           the snaptrack.firewall LaunchDaemon, so the rules come back if anything flushes them)
#   off     remove the rules: _snaptrack can reach the internet (deploy's install step only)
#   status  show the loaded rules and whether pf is enabled
set -eu

ANCHOR="com.apple/300.SnapTrack"
RULES="$(dirname "$0")/snaptrack.pf"

case "${1:-}" in
  on)
    /sbin/pfctl -q -a "$ANCHOR" -f "$RULES"
    # -e fails harmlessly when pf is already enabled.
    /sbin/pfctl -q -e 2>/dev/null || true
    ;;
  off)
    /sbin/pfctl -q -a "$ANCHOR" -F rules
    ;;
  status)
    /sbin/pfctl -s info 2>/dev/null | head -n 1
    echo "Rules in $ANCHOR:"
    /sbin/pfctl -a "$ANCHOR" -s rules 2>/dev/null
    ;;
  *)
    echo "Usage: $0 on|off|status" >&2
    exit 2
    ;;
esac
