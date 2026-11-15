import { LoginScreen } from "../features/auth/LoginScreen.tsx";
import { useLogout, useSession } from "../features/auth/use-session.ts";
import { Button } from "../shared/ui/Button.tsx";
import { Loader } from "../shared/ui/Loader.tsx";
import styles from "./App.module.css";

export function App() {
  const session = useSession();
  const logout = useLogout();

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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Signed in as {session.data.displayName}</p>
        <Button
          variant="ghost"
          busy={logout.isPending}
          onClick={() => {
            logout.mutate({});
          }}
        >
          Log out
        </Button>
      </header>
      <h1>SnapTrack</h1>
      <section className={styles.card}>
        <h3>Nothing here yet</h3>
        <p className={styles.muted}>Receipts arrive in Stage 2.</p>
      </section>
    </main>
  );
}
