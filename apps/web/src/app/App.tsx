import { LoginScreen } from "../features/auth/LoginScreen.tsx";
import { useSession } from "../features/auth/use-session.ts";
import { Button } from "../shared/ui/Button.tsx";
import { Loader } from "../shared/ui/Loader.tsx";
import { AppShell } from "./AppShell.tsx";
import styles from "./App.module.css";

/** The router's root: the login screen until signed in, then the app shell around each screen. */
export function App() {
  const session = useSession();

  // Until the session is known, show the loader rather than the login screen, so it doesn't
  // flash for people who are signed in. Every API call has a time limit, so this always ends.
  if (session.isFetching && session.data === undefined) {
    return (
      <main className={styles.page}>
        <Loader label="Connecting to SnapTrack…" />
      </main>
    );
  }
  if (session.isError) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h3>Can't reach SnapTrack</h3>
          <p className={styles.muted}>
            Check that Tailscale is on, on this phone. If it is, the Mac may have restarted and be waiting for
            someone to log in.
          </p>
          <Button
            className={styles.retry}
            busy={session.isFetching}
            onClick={() => {
              void session.refetch();
            }}
          >
            Try again
          </Button>
        </section>
      </main>
    );
  }
  if (session.data === undefined) return null;
  if (session.data === null) return <LoginScreen />;

  return <AppShell />;
}
