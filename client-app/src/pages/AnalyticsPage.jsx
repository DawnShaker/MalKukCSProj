import { useState, useEffect } from "react";
import { agencyApi } from "../api/agencyApi";

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    agencyApi.getAnalytics().then(setAnalytics).catch((e) => alert(e.message));
  }, []);

  if (!analytics) return <p>Завантаження аналітики...</p>;

  return (
    <div>
      <div className="stats-grid">
        <div className="panel">
          <span className="text-muted">Успішних угод</span>
          <div className="stat-value">{analytics.dealsCount}</div>
        </div>
        <div className="panel">
          <span className="text-muted">Загальна сума продажів</span>
          <div className="stat-value" style={{ color: "#2563eb" }}>
            ${analytics.totalSales.toLocaleString()}
          </div>
        </div>
        <div className="panel">
          <span className="text-muted">Прибуток агентства (комісії)</span>
          <div className="stat-value" style={{ color: "#16a34a" }}>
            ${analytics.totalProfit.toLocaleString()}
          </div>
        </div>
        <div className="panel">
          <span className="text-muted">Середня ціна м² (каталог / угоди)</span>
          <div className="stat-value" style={{ fontSize: 22 }}>
            ${Math.round(analytics.avgSqmCatalog)} / ${Math.round(analytics.avgSqmDeals)}
          </div>
        </div>
      </div>

      <div className="analytics-panels">
        <div className="panel">
          <h3>Ефективність рієлторів</h3>
          {analytics.agentsPerformance.map((st) => (
            <div key={st.agent.id} className="stat-row">
              <span>
                <b>{st.agent.name}</b> ({st.agent.experienceYears} р.) — угод: {st.dealsCount}
              </span>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>
                Прибуток: ${st.totalCommissionProfit.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>Найактивніші клієнти</h3>
          {analytics.mostActiveClients.map((cl) => (
            <div key={cl.client.id} className="stat-row">
              <span>
                <b>{cl.client.name}</b> — угод: {cl.dealsCount}, підписок: {cl.savedSearchesCount}
              </span>
              <span style={{ fontWeight: 700 }}>${cl.totalSpent.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}