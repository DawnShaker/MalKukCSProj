import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const [error, setError] = useState("");
  const links = [
    { to: "/", label: "Нерухомість та Фільтри" },
    ...(user.role === "client"
      ? [{ to: "/my", label: "Мій кабінет" }]
      : [
          { to: "/clients", label: "Клієнти та Підписки" },
          { to: "/deals", label: "Угоди та Рієлтори" },
        ]),
    ...(user.role === "manager"
      ? [
          { to: "/analytics", label: "Статистика та Звіти" },
          { to: "/users", label: "Користувачі" },
        ]
      : []),
  ];

  return (
    <header className="app-header">
      <div>
        <h1>Рієлторське агентство — CRM</h1>
        <small>
          {user.displayName} ·{" "}
          {{ manager: "Менеджер", agent: "Агент", client: "Клієнт" }[user.role]}
        </small>
      </div>
      <nav className="nav-tabs" aria-label="Розділи агентства">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => `tab-btn ${isActive ? "active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => logout().catch((error) => setError(error.message))}
      >
        Вийти
      </button>
      {error && <p role="alert">{error}</p>}
    </header>
  );
}
