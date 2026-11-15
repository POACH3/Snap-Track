import { LogOut } from "lucide-react";
import { Button } from "../../shared/ui/Button.tsx";
import { useLogout, useSession } from "../auth/use-session.ts";
import styles from "./SettingsScreen.module.css";

/** Settings. Stage 2 has only the account; household settings (e.g. image retention) come later. */
export function SettingsScreen() {
  const session = useSession();
  const logout = useLogout();
  const user = session.data;

  return (
    <div className={styles.screen}>
      <h1>Settings</h1>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Signed in as</p>
        <p className={styles.name}>{user?.displayName}</p>
        <p className={styles.muted}>{user?.username}</p>
        <Button
          variant="secondary"
          className={styles.logout}
          busy={logout.isPending}
          onClick={() => {
            logout.mutate({});
          }}
        >
          <LogOut size={18} aria-hidden /> Log out
        </Button>
      </section>
    </div>
  );
}
