import { LogOut } from "lucide-react";
import { useState } from "react";
import { readThemeChoice, saveThemeChoice, THEME_CHOICES, type ThemeChoice } from "../../shared/theme.ts";
import { Button } from "../../shared/ui/Button.tsx";
import { useLogout, useSession } from "../auth/use-session.ts";
import styles from "./SettingsScreen.module.css";

const THEME_LABEL: Record<ThemeChoice, string> = { dark: "Dark", light: "Light", system: "System" };

/** Settings: the account and this device's theme. Household settings (e.g. image retention) come later. */
export function SettingsScreen() {
  const session = useSession();
  const logout = useLogout();
  const user = session.data;
  const [theme, setTheme] = useState(readThemeChoice);

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
      <section className={styles.card}>
        <p className={styles.eyebrow}>Appearance</p>
        <div role="group" aria-label="Theme" className={styles.themes}>
          {THEME_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              className={styles.theme}
              aria-pressed={theme === choice}
              onClick={() => {
                saveThemeChoice(choice);
                setTheme(choice);
              }}
            >
              {THEME_LABEL[choice]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
