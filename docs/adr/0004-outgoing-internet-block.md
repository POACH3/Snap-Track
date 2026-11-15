# 0004: Outgoing internet block with pf per-user rules

**Date:** 2026-11-15. **Status:** proposed (accepted once the Stage 0 checks in
`deploy/README.md` pass on the Mac Studio).

## Context
A malicious npm package is the likeliest threat (SPEC.md §13). SnapTrack must not be able
to send data off this Mac (§4.7), while still reaching the LLM relay on `127.0.0.1` and
being reached by `tailscale serve` (also over `127.0.0.1`). Options: macOS's built-in `pf`
with per-user rules, or Little Snitch (domain-based rules, a paid GUI app).

## Decision
- **pf**, no new software. Rules in `deploy/firewall/snaptrack.pf`: `_snaptrack` may send
  only on `lo0`; anything else it sends is refused at once.
- **Loaded into the anchor `com.apple/300.SnapTrack`**, which the stock `/etc/pf.conf`
  already evaluates, so system files are never edited and macOS updates don't undo it.
- **Kept on** by the `snaptrack.firewall` LaunchDaemon: at boot and every minute.
- **Fail closed**: the server's production entry point refuses to start while it can reach
  the internet, before importing any dependency.
- **Install window**: `pf` matches addresses, not names, and the npm registry is behind a
  CDN, so during deploy's `pnpm install` the rules are removed for the length of that
  step only, and restored by a shell `trap` even if it fails.

## Consequences
- DNS lookups go through `mDNSResponder` (root), outside per-user rules: a small DNS
  side channel remains.
- During the install step `_snaptrack` has full outgoing access; install scripts being
  blocked and the 7-day release age are the protection there.
- If `pf` per-user matching doesn't work on this macOS version, switch to Little Snitch and
  supersede this record.
