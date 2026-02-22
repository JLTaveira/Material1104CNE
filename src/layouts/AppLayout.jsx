/* Layout global (sidebar/topbar para todos)
 src/layouts/AppLayout.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */
 
import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../authContext";

import eqMaterial from "../assets/Eq_Material.jpg";
import logoalforge from "../assets/alforge.png";

export default function AppLayout({ children }) {
  const { profile } = useAuth();
  const loc = useLocation();

  const role = profile?.role ?? "USER";
  const isAdmin = role === "ADMIN";

  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = useMemo(() => {
    // Base para todos (USER e ADMIN)
    const base = [
      { to: "/", label: "Início" },
      { to: "/requisicoes", label: "Minhas Requisições" },
      { to: "/inventario", label: "Inventário" }, // ✅ novo para USER
    ];

    // Admin extra
    const admin = [
      { to: "/admin", label: "Dashboard" },
      { to: "/admin/inventario", label: "Inventário (Gestão)" },
      { to: "/admin/requisicoes", label: "Requisições" },
      { to: "/admin/users", label: "Utilizadores" },
    ];

    return isAdmin ? [...base, ...admin] : base;
  }, [isAdmin]);

  function active(to) {
    return loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
  }

  function onNavClick() {
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      {/* Overlay mobile */}
      <div
        className={`mobile-overlay ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src={logoalforge} alt="Alforge" />
          <div>
            <div className="brand-title">Alforge</div>
            <div className="brand-sub">Pronto para a próxima aventura!</div>
          </div>
        </div>

        <nav className="nav">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavClick}
              className={`nav-link ${active(n.to) ? "active" : ""}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <img className="user-avatar" src={eqMaterial} alt="Equipa Material" />
            <div>
              <div className="user-name">{profile?.nome ?? "Utilizador"}</div>
              <div className="user-role">{role}</div>
            </div>
          </div>

          <button className="btn-ghost" onClick={() => signOut(auth)}>
            Sair
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-only"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              title="Menu"
            >
              ☰
            </button>

            <div>{isAdmin ? "Administração" : "Área do Utilizador"}</div>
          </div>

          <div className="topbar-right">
            <div className="topbar-meta">CNE · Agrupamento 1104</div>
            <button
              className="btn-ghost mobile-only"
              onClick={() => signOut(auth)}
              style={{ marginLeft: 8 }}
            >
              Sair
            </button>
          </div>
        </div>

        <div className="content">{children}</div>

        <footer className="app-footer">
          ©2026 João Taveira para Agrupamento 1104 - Paranhos | GME - Gestão Material Escutista
        </footer>
      </main>
    </div>
  );
}