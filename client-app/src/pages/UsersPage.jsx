import { useEffect, useState } from "react";
import { agencyApi } from "../api/agencyApi";
import { useAuth } from "../auth/AuthContext";

function UserEditor({ profile, agents, clients, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    role: profile.role,
    agentId: profile.agentId || "",
    clientId: profile.clientId || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const updated = await agencyApi.updateUserRole(profile.id, form);
      if (profile.id === user.id && updated.role !== user.role)
        window.dispatchEvent(
          new CustomEvent("agency:session-changed", { detail: updated }),
        );
      else await onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2 id={`user-${profile.id}`}>{profile.displayName}</h2>
      <p>{profile.email}</p>
      <form
        action={`/api/users/${profile.id}`}
        method="post"
        onSubmit={submit}
        className="form-stack"
        aria-labelledby={`user-${profile.id}`}
      >
        <fieldset>
          <legend>Роль користувача</legend>
          {[
            ["manager", "Менеджер"],
            ["agent", "Агент"],
            ["client", "Клієнт"],
          ].map(([value, label]) => (
            <label className="radio-label" key={value}>
              <input
                type="radio"
                name={`role-${profile.id}`}
                value={value}
                checked={form.role === value}
                onChange={() => setForm({ ...form, role: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {form.role === "agent" && (
          <div className="field">
            <label htmlFor={`agent-${profile.id}`}>
              Запис рієлтора — обов’язково
            </label>
            <select
              id={`agent-${profile.id}`}
              name="agentId"
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
              required
            >
              <option value="">Оберіть рієлтора</option>
              {agents.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {form.role === "client" && (
          <div className="field">
            <label htmlFor={`client-${profile.id}`}>
              Запис клієнта — обов’язково
            </label>
            <select
              id={`client-${profile.id}`}
              name="clientId"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              required
            >
              <option value="">Оберіть клієнта</option>
              {clients.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Зберегти доступ
        </button>
      </form>
    </section>
  );
}
export default function UsersPage() {
  const [data, setData] = useState({ profiles: [], agents: [], clients: [] });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const [profiles, agents, clients] = await Promise.all([
      agencyApi.getUsers(),
      agencyApi.getAgents(),
      agencyApi.getClients(),
    ]);
    setData({ profiles, agents, clients });
  }
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  return (
    <main>
      <h1>Користувачі та доступ</h1>
      <p>
        Тут з’являються користувачі після першого входу. Прив’яжіть агента або
        клієнта до потрібного запису агентства.
      </p>
      {error && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice-success">
          {message}
        </p>
      )}
      <div className="users-grid">
        {data.profiles.map((profile) => (
          <UserEditor
            key={`${profile.id}-${profile.role}`}
            profile={profile}
            agents={data.agents}
            clients={data.clients}
            onSaved={async () => {
              await load();
              setMessage("Права доступу оновлено.");
            }}
          />
        ))}
      </div>
    </main>
  );
}
