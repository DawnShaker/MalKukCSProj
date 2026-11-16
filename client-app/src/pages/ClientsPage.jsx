import { useState, useEffect } from "react";
import { agencyApi } from "../api/agencyApi";

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [clientForm, setClientForm] = useState({ name: "", contactInfo: "", type: 1 });

  const loadClients = async () => {
    try {
      setClients(await agencyApi.getClients());
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    try {
      await agencyApi.createClient({ ...clientForm, type: Number(clientForm.type) });
      setClientForm({ name: "", contactInfo: "", type: 1 });
      loadClients();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteClient = async (id) => {
    try {
      await agencyApi.deleteClient(id);
      loadClients();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="main-grid">
      <form onSubmit={handleCreateClient} className="panel form-stack">
        <h3>Новий клієнт</h3>
        <input placeholder="ПІБ клієнта" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} required />
        <input placeholder="Телефон або Email" value={clientForm.contactInfo} onChange={(e) => setClientForm({ ...clientForm, contactInfo: e.target.value })} required />
        <select value={clientForm.type} onChange={(e) => setClientForm({ ...clientForm, type: e.target.value })}>
          <option value="1">Покупець</option>
          <option value="2">Власник</option>
        </select>
        <button type="submit" className="btn btn-primary">Додати клієнта</button>
      </form>

      <div className="card-list">
        {clients.map((c) => (
          <div key={c.id} className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>
                {c.name} ({c.type === 1 ? "Покупець" : "Власник"}) — {c.contactInfo}
              </strong>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="text-muted">Збережених пошуків: {c.savedSearches?.length || 0}/10</span>
                <button onClick={() => handleDeleteClient(c.id)} className="btn btn-danger">Видалити</button>
              </div>
            </div>

            {c.savedSearches?.length > 0 && (
              <div className="sub-box">
                <b>Збережені пошуки клієнта:</b>
                <ul style={{ margin: "4px 0 0 18px" }}>
                  {c.savedSearches.map((s) => (
                    <li key={s.id}>
                      <b>"{s.title}"</b> ({new Date(s.createdAt).toLocaleString()})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {c.notifications?.length > 0 && (
              <div className="sub-box green">
                <b>Автоматичні сповіщення ({c.notifications.length}):</b>
                <ul style={{ margin: "4px 0 0 18px" }}>
                  {c.notifications.map((n, idx) => (
                    <li key={idx}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}