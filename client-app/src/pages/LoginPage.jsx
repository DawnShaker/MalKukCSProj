import { useEffect, useRef, useState } from "react";
import { authApi } from "../api/http";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login, error: serviceError, auth } = useAuth();
  const usernameLogin = auth.identifier === "username";
  const identifierId = usernameLogin ? "auth-username" : "auth-email";
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const errorRef = useRef(null);
  useEffect(() => {
    if (window.location.hash.includes("access_token=")) {
      window.history.replaceState(null, "", window.location.pathname);
      setMessage("Адресу підтверджено. Увійдіть зі своїм паролем.");
    }
  }, []);
  const title =
    mode === "signup"
      ? "Створити обліковий запис"
      : mode === "recover"
        ? "Відновити пароль"
        : "Увійти до агентства";
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        setMessage("Підключаємося до сервера входу… Перший запуск може тривати до двох хвилин.");
        await login(
          usernameLogin
            ? { username: form.email, password: form.password }
            : form,
        );
        setMessage("");
      } else {
        const result =
          mode === "signup"
            ? await authApi.signup(form)
            : await authApi.recover(form.email);
        setMessage(result.message);
        setMode("login");
        setForm({ ...form, password: "" });
      }
    } catch (error) {
      setMessage("");
      setError(error.message);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  function changeMode(next) {
    setMode(next);
    setError("");
    setMessage("");
    setForm({ ...form, password: "" });
  }
  return (
    <main className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">Рієлторське агентство</p>
        <h1>Ваші об’єкти, клієнти та угоди</h1>
        <p>
          Працюйте у своєму кабінеті. Доступ до даних залежить від вашої ролі в
          агентстві.
        </p>
      </div>
      <section className="panel auth-panel" aria-labelledby="auth-title">
        <h2 id="auth-title">{title}</h2>
        {message && (
          <p role="status" className="notice-success">
            {message}
          </p>
        )}
        {(error || serviceError) && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="notice-error">
            {error || serviceError}
          </p>
        )}
        <form
          action={`/api/auth/${mode}`}
          method="post"
          onSubmit={submit}
          className="form-stack"
          aria-labelledby="auth-title"
        >
          {mode === "signup" && (
            <div className="field">
              <label htmlFor="auth-name">Ім’я — обов’язково</label>
              <input
                id="auth-name"
                name="name"
                autoComplete="name"
                value={form.name}
                maxLength={200}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor={identifierId}>
              {usernameLogin ? "Логін — обов’язково" : "Email — обов’язково"}
            </label>
            <input
              id={identifierId}
              name={usernameLogin ? "username" : "email"}
              type={usernameLogin ? "text" : "email"}
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={form.email}
              maxLength={usernameLogin ? 256 : 254}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          {mode !== "recover" && (
            <div className="field">
              <label htmlFor="auth-password">Пароль — обов’язково</label>
              <input
                id="auth-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={form.password}
                minLength={mode === "signup" ? 8 : 1}
                maxLength={128}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                aria-describedby="password-help"
                required
              />
              <small id="password-help">
                {mode === "signup"
                  ? "Від 8 до 128 символів."
                  : "Введіть пароль свого облікового запису."}
              </small>
              <button
                type="button"
                className="text-button"
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? "Приховати пароль" : "Показати пароль"}
              </button>
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? "Зачекайте…"
              : mode === "signup"
                ? "Зареєструватися"
                : mode === "recover"
                  ? "Надіслати інструкції"
                  : "Увійти"}
          </button>
        </form>
        <div className="auth-actions">
          {auth.signup && (
            <button
              type="button"
              className="text-button"
              onClick={() => changeMode(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup"
                ? "У мене вже є обліковий запис"
                : "Створити обліковий запис"}
            </button>
          )}
          {auth.recovery && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                changeMode(mode === "recover" ? "login" : "recover")
              }
            >
              {mode === "recover" ? "Повернутися до входу" : "Забули пароль?"}
            </button>
          )}
        </div>
        {!auth.signup && !auth.recovery && (
          <p className="text-muted">
            Для створення облікового запису або відновлення доступу зверніться
            до адміністратора.
          </p>
        )}
        {mode === "signup" && (
          <p className="text-muted">
            Нові користувачі отримують кабінет клієнта. Доступ агента надає
            менеджер.
          </p>
        )}
      </section>
    </main>
  );
}
