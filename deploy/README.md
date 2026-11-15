# Hosting SnapTrack on the Mac Studio

Production SnapTrack runs as the `snaptrack` LaunchDaemon under the hidden `_snaptrack`
account, in `/opt/snap-track/` (`SPEC.md` §4.7). Every script here changes the
**production** host, needs `sudo`, and is run by the developer from their own account in
this checkout.

| Script | Does |
|---|---|
| `setup.sh` | One-time setup, safe to re-run: folders and permissions, pinned Node and pnpm, `config/.env`, log rotation, firewall, LaunchDaemons, Tailscale HTTPS. `--check` only checks. |
| `deploy.sh` | Deploys a commit (default `HEAD`); `--rollback` goes back one release. Asks before migrating. |
| `admin.sh` | `user:create`, `user:set-password` against the production database. |
| `firewall/` | The `pf` rules and the script that turns them on and off (installed to `/opt/snap-track/firewall/`). |
| `lib.sh` | Shared paths and helpers. |

Production address: **https://node.tailf79c3a.ts.net:8443** (port 443 is the LLM server's
chat page). Production listens on `127.0.0.1:4300`; `pnpm dev` uses 4310.

## Before the first setup

- [ ] `_snaptrack` exists (it does: uid 411, home `/opt/snap-track/home`, shell `/usr/bin/false`).
- [ ] Energy settings: prevent automatic sleep (done); start up automatically after a power
      failure: `sudo pmset -a autorestart 1` (it then waits at the unlock screen).
- [x] FileVault stays on (decided 2026-11-15). After a power cut or crash, nothing starts until
      someone unlocks the Mac at its screen. For planned restarts use `sudo fdesetup authrestart`.
- [ ] `mise` installed from the admin account (`brew install mise`).
- [ ] Tailscale: MagicDNS and HTTPS certificates on (they are).

## First setup

```
sudo deploy/setup.sh
sudo nano /opt/snap-track/config/.env      # fill in LLM_SERVER_URL, LLM_SERVER_API_KEY, EXTRACTION_MODEL
sudo deploy/deploy.sh                       # answer 'migrate' to create the database
sudo deploy/admin.sh user:create            # once per household member
sudo deploy/setup.sh --check
```

`setup.sh` creates `config/.env` from `.env.example` with production paths, port 4300, the
Tailscale address and a fresh `SESSION_SECRET`. It never shows the secret. **Save the final
`.env` values somewhere safe** (a password manager): `.env` is not in the backups (§10).

## Day to day

| Task | Command |
|---|---|
| Deploy what's committed | `sudo deploy/deploy.sh` |
| Go back one release | `sudo deploy/deploy.sh --rollback` |
| Add a person / reset a password | `sudo deploy/admin.sh user:create` / `user:set-password` |
| Logs | `sudo tail -f /opt/snap-track/logs/snaptrack.log` |
| Restart SnapTrack | `sudo launchctl kickstart -k system/snaptrack` |
| Restart the Mac (unattended) | `sudo fdesetup authrestart` (unlocks FileVault once, so services start with no login) |
| After any restart | Log in to the Mac (after a power cut, unlocking FileVault does this). Tailscale starts at login; SnapTrack is already running. |
| Stop / start | `sudo launchctl bootout system/snaptrack` / `sudo launchctl bootstrap system /Library/LaunchDaemons/snaptrack.plist` |
| Firewall state | `sudo /opt/snap-track/firewall/firewall.sh status` |
| Check permissions and firewall | `sudo deploy/setup.sh --check` |

## How it fits together

- **Folders** (`SPEC.md` §4.7): root owns everything the service runs (`app/`, `runtime/`,
  `config/`); `_snaptrack` writes only `data/`, `logs/`, `build/` and `home/`, all `700`.
  `config/` and `.env` are opened to `_snaptrack` by an ACL, not its group, because the
  admin account is in the `_snaptrack` group.
- **Releases**: `app/releases/<commit>/`, with `app/current` pointing at the running one.
  The newest three are kept. Each has a `.deploy-info` saying whether it ran migrations and
  which backup was taken first.
- **Firewall**: rules in the `pf` anchor `com.apple/300.SnapTrack` (the stock
  `/etc/pf.conf` already evaluates `com.apple/*`, so it is never edited). `_snaptrack` may
  reach only `lo0` (this Mac). The `snaptrack.firewall` LaunchDaemon loads the rules at
  boot and re-applies them every minute.
- **Fail-closed start**: the server's entry point (`apps/server/src/start-production.ts`)
  refuses to start if it can reach the internet, before loading any package. At boot it
  retries every 10 seconds until the firewall is up.
- **Deploy's install step** turns the firewall off for `_snaptrack` while `pnpm install`
  runs (the registry is behind a CDN, so `pf` can't allow it by name), and turns it back on
  afterwards, also when the install fails.

## Known limits

- **DNS**: name lookups go through macOS's own resolver (`mDNSResponder`, running as root),
  which `pf`'s per-user rules don't cover. Code running as `_snaptrack` can't open a
  connection out, but could in principle leak small amounts of data in DNS queries.
- **Cookies and ports**: browsers send cookies to every port on a host, so the chat page on
  port 443 also receives SnapTrack's session cookie. It can't use it from a browser
  (SnapTrack's CSRF check refuses other origins), but the chat server sees it in requests.
  A separate Tailscale name would remove this.
- **Install window**: during `pnpm install`, `_snaptrack` can reach the whole internet for
  the length of the install. Install scripts are blocked (`allowBuilds`) and versions are
  held back a week (`minimumReleaseAge`), which is what protects this step.

## Checks to run once (Stage 0 "Done when")

Record the date and result next to each.

- [x] 2026-11-15: `sudo deploy/setup.sh --check` passes: modes, ACLs, `_snaptrack` can't write its code,
      runtime or config; the admin account can't read `data/` or `.env`; outgoing internet
      refused while `127.0.0.1` works.
- [ ] A failed deploy leaves the firewall on: break the lockfile on a scratch branch, deploy
      it, then `sudo -u _snaptrack curl -m 5 https://example.com` must fail.
- [ ] Rollback: deploy commit A, deploy commit B, `--rollback`; the app is A again.
- [x] 2026-11-15: `pf` per-user rules work on macOS 27.0.1 (the setup check covers it).
- [x] 2026-11-15: **Reboot** (`sudo fdesetup authrestart`): `snaptrack` started 7 seconds
      after boot with no one logged in, firewall on. Tailscale (the standalone app) started
      only at login, so the app is reachable from phones once someone logs in. Accepted:
      **after any restart, log in to the Mac** (`SPEC.md` §4.7).
- [x] 2026-11-15: The app installs to the home screen on an iPhone and an Android phone.
- [x] 2026-11-15: Each household member logs in from their own phone (Stage 1).

## Restore

Restoring from the nightly backups is documented and tested in Stage 5. To recreate
`.env` on a fresh machine: run `setup.sh`, then replace the generated values in
`/opt/snap-track/config/.env` with the saved ones (keep the old `SESSION_SECRET`, or
everyone must log in again).
