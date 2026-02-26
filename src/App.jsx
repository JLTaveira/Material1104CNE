/* App.jsx editado
 src/App.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./authContext";
import { RequireAuth, RequireAdmin, RequireGestor } from "./guards";

// --- Importação das páginas com Lazy Loading ---
const Login = lazy(() => import("./pages/Login"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const Requisicoes = lazy(() => import("./pages/Requisicoes"));
const RequisicaoDetalhe = lazy(() => import("./pages/RequisicaoDetalhe"));
const Inventario = lazy(() => import("./pages/inventario"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminSettings = lazy(() => import("./pages/AdminSettings")); // ✅ Adicionado

/**
 * Componente Home: Redireciona o utilizador para o Dashboard correto
 * baseado na sua função (Role).
 */
function Home() {
  const { profile, loading } = useAuth();
  
  console.log("DEBUG HOME", { loading, profile });

   if (loading) {
    return <div style={{ padding: 16 }}>
      A carregar sessão...
      </div>;
  }

  const role = profile?.role;

  // Se for Admin ou Gestor, vai para a vista de gestão
  if (role === "ADMIN" || role === "GESTOR") {
    return <Navigate to="/admin" replace />;
  }
  // Se for utilizador comum (USER), vê o dashboard de escuteiro
  return <UserDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={
          <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
            <div className="spinner"></div>
            <p style={{ marginTop: 16, opacity: 0.6 }}>A carregar aplicação...</p>
          </div>
        }>
          <Routes>
            {/* ROTA PÚBLICA */}
            <Route path="/login" element={<Login />} />

            {/* ROTA INICIAL (HOME) */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />

            {/* ROTA UTILIZADOR: Inventário apenas para consulta */}
            <Route
              path="/inventario"
              element={
                <RequireAuth>
                  <Inventario />
                </RequireAuth>
              }
            />

            {/* ROTAS DE GESTÃO (Acesso para ADMIN e GESTOR) */}
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireGestor>
                    <AdminDashboard />
                  </RequireGestor>
                </RequireAuth>
              }
            />

            <Route
              path="/admin/requisicoes"
              element={
                <RequireAuth>
                  <RequireGestor>
                    <Requisicoes />
                  </RequireGestor>
                </RequireAuth>
              }
            />

            <Route
              path="/admin/requisicoes/:id"
              element={
                <RequireAuth>
                  <RequireGestor>
                    <RequisicaoDetalhe />
                  </RequireGestor>
                </RequireAuth>
              }
            />

            <Route
              path="/admin/inventario"
              element={
                <RequireAuth>
                  <RequireGestor>
                    <Inventario />
                  </RequireGestor>
                </RequireAuth>
              }
            />

            {/* ROTAS DE ADMINISTRAÇÃO (Acesso EXCLUSIVO para ADMIN) */}
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

            {/* ✅ NOVA ROTA: Definições de Email (Acesso EXCLUSIVO para ADMIN) */}
            <Route
              path="/admin/settings"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <AdminSettings />
                  </RequireAdmin>
                </RequireAuth>
              }
            />

            {/* FALLBACK: Redireciona qualquer rota desconhecida para a Home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}