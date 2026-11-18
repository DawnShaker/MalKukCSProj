import { useEffect, useState } from "react";
import { agencyApi } from "../api/agencyApi";
import { useAuth } from "../auth/AuthContext";
import SearchFilterFields, {
  emptyFilter,
  filterPayload,
} from "../components/SearchFilterFields";

const blank = { name: "", contactInfo: "", type: 1, agentId: "" };
const types = { 1: "Покупець", 2: "Орендар", 3: "Власник" };
function RequestEditor({ client, onCreated }) {
  const [filter, setFilter] = useState(emptyFilter);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>Створити запит клієнта</summary>
      <form
        action={`/api/clients/${client.id}/requests`}
        method="post"
        className="form-stack save-filter"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await agencyApi.createClientRequest(client.id, {
              title,
              filter: filterPayload(filter),
            });
            setTitle("");
            await onCreated();
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {client.savedSearches.length > 0 && (
          <div className="field">
            <label htmlFor={`previous-${client.id}`}>
              Взяти умови зі збереженого пошуку
            </label>
            <select
              id={`previous-${client.id}`}
              defaultValue=""
              onChange={(e) => {
                const selected = client.savedSearches.find(
                  (s) => s.id === e.target.value,
                );
                if (selected) {
                  setFilter({ ...emptyFilter, ...selected.filter });
                  setTitle(selected.title);
                }
              }}
            >
              <option value="">Оберіть пошук</option>
              {client.savedSearches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={`request-title-${client.id}`}>Назва запиту</label>
          <input
            id={`request-title-${client.id}`}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </div>
        <SearchFilterFields
          value={filter}
          onChange={setFilter}
          prefix={`request-${client.id}`}
        />
        {error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-success" disabled={busy}>
          Зберегти запит
        </button>
      </form>
    </details>
  );
}
export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState(null);
  async function load() {
    const [data, staff] = await Promise.all([
      agencyApi.getClients(),
      user.role === "manager" ? agencyApi.getAgents() : Promise.resolve([]),
    ]);
    setClients(data);
    setAgents(staff);
  }
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  async function act(work) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <h1>{user.role === "manager" ? "Клієнти агентства" : "Мої клієнти"}</h1>
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
      <div className="main-grid">
        <section className="panel" aria-labelledby="client-form-title">
          <h2 id="client-form-title">
            {editing ? "Редагувати клієнта" : "Додати клієнта"}
          </h2>
          <form
            action={editing ? `/api/clients/${editing}` : "/api/clients"}
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                const dto = { ...form, type: Number(form.type) };
                if (editing) await agencyApi.updateClient(editing, dto);
                else await agencyApi.createClient(dto);
                setForm(blank);
                setEditing(null);
                setMessage("Дані клієнта збережено.");
              });
            }}
            className="form-stack"
            aria-labelledby="client-form-title"
          >
            <div className="field">
              <label htmlFor="client-name">Ім’я — обов’язково</label>
              <input
                id="client-name"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={200}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="client-contact">Контакти — обов’язково</label>
              <input
                id="client-contact"
                name="contactInfo"
                value={form.contactInfo}
                onChange={(e) =>
                  setForm({ ...form, contactInfo: e.target.value })
                }
                maxLength={2000}
                required
              />
            </div>
            <fieldset>
              <legend>Тип клієнта</legend>
              {Object.entries(types).map(([value, label]) => (
                <label key={value} className="radio-label">
                  <input
                    type="radio"
                    name="type"
                    checked={Number(form.type) === Number(value)}
                    onChange={() => setForm({ ...form, type: Number(value) })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {user.role === "manager" && (
              <div className="field">
                <label htmlFor="client-agent">Відповідальний агент</label>
                <select
                  id="client-agent"
                  name="agentId"
                  value={form.agentId}
                  onChange={(e) =>
                    setForm({ ...form, agentId: e.target.value })
                  }
                >
                  <option value="">Ще не призначено</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Зберегти клієнта
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(blank);
                }}
              >
                Скасувати редагування
              </button>
            )}
          </form>
        </section>
        <div className="card-list">
          <h2>Записів: {clients.length}</h2>
          {clients.map((client) => (
            <article className="panel" key={client.id}>
              <h3>
                {client.name} · {types[client.type]}
              </h3>
              <p>{client.contactInfo}</p>
              <p className="text-muted">
                {client.agentId
                  ? agents.find((a) => a.id === client.agentId)?.name ||
                    "Агент призначений"
                  : "Агент ще не призначений"}
              </p>
              <div className="nav-tabs">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditing(client.id);
                    setForm({
                      name: client.name,
                      contactInfo: client.contactInfo,
                      type: client.type,
                      agentId: client.agentId || "",
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Редагувати
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => act(() => agencyApi.deleteClient(client.id))}
                >
                  Видалити
                </button>
              </div>
              <h4>Збережені пошуки ({client.savedSearches.length})</h4>
              <ul>
                {client.savedSearches.map((s) => (
                  <li key={s.id}>{s.title}</li>
                ))}
              </ul>
              <h4>Запити</h4>
              {client.requests.map((r) => (
                <div className="portal-row" key={r.id}>
                  <span>{r.title}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      act(async () =>
                        setMatches({
                          id: r.id,
                          rows: await agencyApi.getRequestMatches(r.id),
                        }),
                      )
                    }
                  >
                    Підібрати об’єкти
                  </button>
                </div>
              ))}
              {matches && client.requests.some((r) => r.id === matches.id) && (
                <p role="status">
                  Знайдено: {matches.rows.length}.{" "}
                  {matches.rows
                    .map((p) => `${p.type}, ${p.address}, $${p.price}`)
                    .join("; ")}
                </p>
              )}
              <RequestEditor client={client} onCreated={load} />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
