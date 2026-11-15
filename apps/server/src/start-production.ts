// Production entry point (the LaunchDaemon runs this, not main.ts).
// Refuses to start while this account can reach the internet (SPEC.md §4.7), and checks
// that before any dependency is loaded: a malicious package runs as soon as it is
// imported, so the check must come first. If the firewall is not up yet at boot, the
// server exits and launchd retries until it is.
import { connect } from "node:net";

function canReachInternet(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "1.1.1.1", port: 443, timeout: 3000 });
    const done = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.once("connect", () => {
      done(true);
    });
    socket.once("error", () => {
      done(false);
    });
    socket.once("timeout", () => {
      done(false);
    });
  });
}

if (await canReachInternet()) {
  console.error(
    "SnapTrack will not start: this account can reach the internet, so the firewall is not active. " +
      "Run `sudo /opt/snap-track/firewall/firewall.sh on` (deploy/README.md).",
  );
  process.exit(1);
}

await import("./main.ts");
