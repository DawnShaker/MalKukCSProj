import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/http";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    authApi
      .session()
      .then(async (data) => (data.needsRefresh ? authApi.refresh() : data))
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((error) => {
        if (active && ![401, 403].includes(error.status))
          setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const ended = () => setUser(null);
    const changed = (event) => setUser(event.detail);
    window.addEventListener("agency:session-ended", ended);
    window.addEventListener("agency:session-changed", changed);
    return () => {
      active = false;
      window.removeEventListener("agency:session-ended", ended);
      window.removeEventListener("agency:session-changed", changed);
    };
  }, []);
  const login = async (dto) => {
    const data = await authApi.login(dto);
    setError("");
    setUser(data.user);
  };
  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
