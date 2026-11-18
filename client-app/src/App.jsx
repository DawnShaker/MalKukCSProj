import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Navbar from "./components/Navbar";
import PropertiesPage from "./pages/PropertiesPage";
import ClientsPage from "./pages/ClientsPage";
import DealsPage from "./pages/DealsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ClientPortal from "./pages/ClientPortal";
import UsersPage from "./pages/UsersPage";

function Access({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}
function Application() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (location.pathname === "/reset-password") return <ResetPasswordPage />;
  if (loading)
    return (
      <main className="app-container">
        <p role="status">Перевіряємо сесію…</p>
      </main>
    );
  if (!user) return <LoginPage />;
  return (
    <div className="app-container">
      <Navbar />
      <Routes>
        <Route path="/" element={<PropertiesPage />} />
        <Route
          path="/clients"
          element={
            <Access roles={["manager", "agent"]}>
              <ClientsPage />
            </Access>
          }
        />
        <Route
          path="/deals"
          element={
            <Access roles={["manager", "agent"]}>
              <DealsPage />
            </Access>
          }
        />
        <Route
          path="/analytics"
          element={
            <Access roles={["manager"]}>
              <AnalyticsPage />
            </Access>
          }
        />
        <Route
          path="/users"
          element={
            <Access roles={["manager"]}>
              <UsersPage />
            </Access>
          }
        />
        <Route
          path="/my"
          element={
            <Access roles={["client"]}>
              <ClientPortal />
            </Access>
          }
        />
        <Route
          path="*"
          element={
            <Navigate to={user.role === "client" ? "/my" : "/"} replace />
          }
        />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Application />
      </AuthProvider>
    </BrowserRouter>
  );
}
