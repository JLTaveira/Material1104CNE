/* App.jsx editado
 src/App.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./authContext";
import { RequireAuth, RequireAdmin } from "./guards";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";

import Requisicoes from "./pages/Requisicoes";
import RequisicaoDetalhe from "./pages/RequisicaoDetalhe";
import Inventario from "./pages/inventario";
import AdminUsers from "./pages/AdminUsers";

function Home() {
  const { profile } = useAuth();
  if (profile?.role === "ADMIN") return <AdminDashboard />;
  return <UserDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* HOME */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />

          {/* USER: Inventário read-only */}
          <Route
            path="/inventario"
            element={
              <RequireAuth>
                <Inventario />
              </RequireAuth>
            }
          />

          {/* ADMIN */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AdminDashboard />
                </RequireAdmin>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/requisicoes"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <Requisicoes />
                </RequireAdmin>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/requisicoes/:id"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <RequisicaoDetalhe />
                </RequireAdmin>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/inventario"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <Inventario />
                </RequireAdmin>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AdminUsers />
                </RequireAdmin>
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}