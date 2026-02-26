/* Firebase guards
 src/guards.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

/* Firebase guards - Versão RBAC (ADMIN, GESTOR, USER)
 src/guards.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */

import { Navigate } from "react-router-dom";
import { useAuth } from "./authContext";

// 1. Proteção Base: Tem de estar logado e ativo
export function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div style={{ padding: 16 }}>A carregar autorização...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  // Se o utilizador existir mas estiver desativado na BD
  if (profile && profile.ativo === false) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2 style={{ color: "crimson" }}>Conta Desativada</h2>
        <p>A tua conta foi suspensa ou aguarda ativação. Contacta o Administrador.</p>
        <button className="btn-secondary" onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    );
  }
  return children;
}

// 2. Proteção de Gestão: ADMIN ou GESTOR (para Material/Requisições)
export function RequireGestor({ children }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  
  const role = profile?.role;
  const isGestor = role === "ADMIN" || role === "GESTOR";

  if (!isGestor) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h3>Acesso Restrito</h3>
        <p>Apenas a Equipa de Material ou Administradores podem aceder a esta área.</p>
        <Navigate to="/" replace />
      </div>
    );
  }
  return children;
}

// 3. Proteção Super Admin: APENAS ADMIN (para Gestão de Utilizadores)
export function RequireAdmin({ children }) {
  const { profile, loading } = useAuth();
  if (loading) return null;

  if (profile?.role !== "ADMIN") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h3>Acesso Reservado</h3>
        <p>Esta área é exclusiva para o Administrador do sistema.</p>
        <Navigate to="/" replace />
      </div>
    );
  }
  return children;
}