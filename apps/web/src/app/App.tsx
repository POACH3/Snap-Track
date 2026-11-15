import styles from "./App.module.css";
import { useServerStatus } from "./use-server-status.ts";

export function App() {
  const status = useServerStatus();
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Placeholder</p>
      <h1>SnapTrack</h1>
      <section className={styles.card}>
        <h3>Server</h3>
        {status.isPending && <p className={styles.muted}>Checking…</p>}
        {status.isError && <p className={styles.danger}>Can't reach the server.</p>}
        {status.isSuccess && (
          <p>
            Connected. Server time{" "}
            <span className={styles.numeric}>{new Date(status.data.serverTime).toLocaleString()}</span>
          </p>
        )}
      </section>
    </main>
  );
}
