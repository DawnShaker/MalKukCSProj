import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/http";

export default function ResetPasswordPage() {
  const [token, setToken] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("access_token") ||
      "",
  );
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authApi.reset({ accessToken: token, password });
      setMessage(result.message);
      setToken("");
      setPassword("");
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="panel auth-panel">
        <h1>Новий пароль</h1>
        {error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {token ? (
          <form
            action="/api/auth/reset"
            method="post"
            onSubmit={submit}
            className="form-stack"
          >
            <label htmlFor="reset-password">
              Новий пароль — від 8 до 128 символів
            </label>
            <input
              id="reset-password"
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="text-button"
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? "Приховати пароль" : "Показати пароль"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Зберегти пароль
            </button>
          </form>
        ) : (
          !message && <p>Відкрийте посилання з листа відновлення пароля.</p>
        )}
        <p>
          <Link to="/login">Повернутися до входу</Link>
        </p>
      </section>
    </main>
  );
}
