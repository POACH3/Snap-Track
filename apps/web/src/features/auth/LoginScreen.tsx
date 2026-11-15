import { isDefinedError } from "@orpc/client";
import { useState, type SyntheticEvent } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { TextField } from "../../shared/ui/TextField.tsx";
import styles from "./LoginScreen.module.css";
import { useLogin } from "./use-session.ts";

type Field = "username" | "password";

const REQUIRED: Record<Field, string> = {
  username: "Enter your username.",
  password: "Enter your password.",
};

export function LoginScreen() {
  const login = useLogin();
  const [values, setValues] = useState<Record<Field, string>>({ username: "", password: "" });
  const [touched, setTouched] = useState<Record<Field, boolean>>({ username: false, password: false });

  const missing = (field: Field) =>
    touched[field] && values[field].trim() === "" ? REQUIRED[field] : undefined;

  const error = login.error;
  const wrongCredentials = isDefinedError(error) && error.code === "INVALID_CREDENTIALS";
  const formMessage =
    error === null || wrongCredentials
      ? undefined
      : isDefinedError(error) && error.code === "TOO_MANY_ATTEMPTS"
        ? `Too many failed attempts. Try again in ${String(Math.ceil(error.data.retryAfterSeconds / 60))} minutes.`
        : "Can't reach SnapTrack. Check your connection and try again.";

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (login.error !== null) login.reset();
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ username: true, password: true });
    if (values.username.trim() === "" || values.password === "") return;
    login.mutate({ username: values.username, password: values.password });
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <h1 className={styles.title}>SnapTrack</h1>
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.username}
          error={missing("username")}
          onChange={(e) => {
            update("username", e.target.value);
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, username: true }));
          }}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          error={
            missing("password") ??
            (wrongCredentials ? "Username or password is wrong. Check both and try again." : undefined)
          }
          onChange={(e) => {
            update("password", e.target.value);
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, password: true }));
          }}
        />
        <Button type="submit" fullWidth busy={login.isPending}>
          Log in
        </Button>
        {formMessage !== undefined && (
          <p className={styles.formError} role="alert">
            {formMessage}
          </p>
        )}
      </form>
    </main>
  );
}
