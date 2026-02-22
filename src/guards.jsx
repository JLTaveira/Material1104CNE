/* Firebase guards
 src/guards.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

import { Navigate } from "react-router-dom";
import { useAuth } from "./authContext";

export function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div style={{ padding: 16 }}>A carregar...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.ativo) return <div style={{ padding: 16 }}>Conta desativada.</div>;
  return children;
}

export function RequireAdmin({ children }) {
  const { profile, loading } = useAuth();
  if (loading) return <div style={{ padding: 16 }}>A carregar...</div>;
  if (profile?.role !== "ADMIN")
    return <div style={{ padding: 16 }}>Sem permissões de administrador.</div>;
  return children;
}
