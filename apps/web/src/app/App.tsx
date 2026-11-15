import { LoginScreen } from "../features/auth/LoginScreen.tsx";
import { useLogout, useSession } from "../features/auth/use-session.ts";
import { Button } from "../shared/ui/Button.tsx";
import styles from "./App.module.css";

export function App() {
  const session = useSession();
  const logout = useLogout();

  // Nothing until the session is known, so the login screen doesn't flash for signed-in people.
  if (session.isPending) return null;
  if (session.isError) {
    return (
      <main className={styles.page}>
        <p className={styles.danger}>Can't reach SnapTrack. Check your connection, then reload.</p>
      </main>
    );
  }
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
