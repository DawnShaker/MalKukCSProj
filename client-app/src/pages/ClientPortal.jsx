import { useEffect, useState } from "react";
import { agencyApi } from "../api/agencyApi";
import { useAuth } from "../auth/AuthContext";
import SearchFilterFields, {
  emptyFilter,
  filterPayload,
} from "../components/SearchFilterFields";

export default function ClientPortal() {
  const { user } = useAuth();
  const [client, setClient] = useState(null);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState(emptyFilter);
  const [title, setTitle] = useState("");
  const [results, setResults] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function reload() {
    const [clients, previous] = await Promise.all([
      agencyApi.getClients(),
      agencyApi.getClientHistory(user.clientId),
    ]);
    setClient(clients[0] || null);
    setHistory(previous);
  }
  useEffect(() => {
    reload().catch((error) => setError(error.message));
  }, [user.clientId]);
  async function action(work) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await reload();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function search(value = filter) {
    await action(async () => {
      setResults(await agencyApi.searchProperties(filterPayload(value)));
    });
  }
  return (
    <main>
      <h1>Мій кабінет</h1>
      <p className="text-muted">Ваші запити, фільтри та історія пошуку.</p>
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
      <div className="portal-grid">
        <section className="panel" aria-labelledby="filter-title">
          <h2 id="filter-title">Підібрати нерухомість</h2>
          <search>
            <form
              action="/api/properties/search"
              method="post"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
              className="form-stack"
            >
              <SearchFilterFields
                value={filter}
                onChange={setFilter}
                prefix="portal"
              />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Знайти об’єкти
              </button>
            </form>
          </search>
          <form
            action={`/api/clients/${user.clientId}/searches`}
            method="post"
            className="form-stack save-filter"
            onSubmit={(e) => {
              e.preventDefault();
              const request = e.nativeEvent.submitter?.value === "request";
              action(async () => {
                if (request) {
                  await agencyApi.createClientRequest(user.clientId, {
                    title,
                    filter: filterPayload(filter),
                  });
                  setMessage("Запит із поточними умовами створено.");
                } else {
                  await agencyApi.saveClientSearch(
                    user.clientId,
                    title,
                    filterPayload(filter),
                  );
                  setMessage("Поточний фільтр збережено.");
                }
              });
            }}
          >
            <label htmlFor="filter-title-input">Назва поточного фільтра</label>
            <input
              id="filter-title-input"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
            <button
              type="submit"
              name="intent"
              value="save"
              className="btn btn-secondary"
              disabled={busy}
            >
              Зберегти пошук
            </button>
            <button
              type="submit"
              name="intent"
              value="request"
              className="btn btn-success"
              disabled={busy}
            >
              Створити запит із цими умовами
            </button>
          </form>
        </section>
        <div className="card-list">
          {results && (
            <section className="panel">
              <h2>Знайдено об’єктів: {results.length}</h2>
              {results.length === 0 ? (
                <p>За цими умовами об’єктів немає.</p>
              ) : (
                results.map((row) => (
                  <article key={row.id} className="portal-result">
                    <h3>
                      {row.type} · {row.area} м² · ${row.price.toLocaleString()}
                    </h3>
                    <p>
                      {row.address}, {row.district}
                    </p>
                  </article>
                ))
              )}
            </section>
          )}
          <section className="panel">
            <h2>Збережені пошуки ({client?.savedSearches.length || 0}/10)</h2>
            {client?.savedSearches.map((row) => (
              <div className="portal-row" key={row.id}>
                <span>{row.title}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    const next = { ...emptyFilter, ...row.filter };
                    setFilter(next);
                    search(next);
                  }}
                >
                  Застосувати
                </button>
              </div>
            ))}
            {client?.savedSearches.length === 0 && (
              <p>Збережіть свій перший фільтр.</p>
            )}
          </section>
          <section className="panel">
            <h2>Мої запити</h2>
            {client?.requests.map((row) => (
              <div className="portal-row" key={row.id}>
                <span>{row.title}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    action(async () =>
                      setResults(await agencyApi.getRequestMatches(row.id)),
                    )
                  }
                >
                  Переглянути підбір
                </button>
              </div>
            ))}
            {client?.requests.length === 0 && <p>Ви ще не створили запитів.</p>}
          </section>
          <section className="panel">
            <h2>Історія пошуків</h2>
            {history.map((row) => (
              <div className="portal-row" key={row.id}>
                <span>
                  <time dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleString()}
                  </time>{" "}
                  · результатів: {row.resultCount}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    const next = { ...emptyFilter, ...row.filter };
                    setFilter(next);
                    search(next);
                  }}
                >
                  Повторити
                </button>
              </div>
            ))}
            {history.length === 0 && (
              <p>Тут з’являться ваші виконані пошуки.</p>
            )}
          </section>
          <section className="panel">
            <h2>Сповіщення</h2>
            {client?.notifications.length ? (
              <ul>
                {client.notifications.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            ) : (
              <p>Нових сповіщень немає.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
