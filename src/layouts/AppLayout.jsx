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

  const navItems = useMemo(() => {
    const items = [
      { to: "/", label: "Início" },
      { to: "/inventario", label: "Consultar Inventário" },
    ];
    if (role === "ADMIN" || role === "GESTOR") {
      items.push({ to: "/admin", label: "Dashboard Material" });
      // items.push({ to: "/admin/inventario", label: "Gestão Inventário" });
      items.push({ to: "/admin/requisicoes", label: "Gestão Requisições" });
    }
    if (role === "ADMIN") {
      items.push({ to: "/admin/users", label: "Utilizadores" });
      items.push({ to: "/admin/settings", label: "Configurações" });
    }
    return items;
  }, [role]);

  function isActive(to) {
    return loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
  }

  return (
    <div className="app-shell">
      <div className={`mobile-overlay ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src={logoalforge} alt="Alforge" />
          <div>
            <div className="brand-title">Alforge</div>
            <div className="brand-sub">Pronto para a próxima aventura!</div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setMobileOpen(false)} className={`nav-link ${isActive(n.to) ? "active" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        {/* FOOTER ORIGINAL COM BOTÃO GHOST (Imagem 3 e 4) */}
        <div className="sidebar-footer">
          <div className="user-chip">
            <img className="user-avatar" src={eqMaterial} alt="Avatar" />
            <div>
              <div className="user-name">{profile?.nome ?? "Utilizador"}</div>
              <div className="user-role">{role}</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={() => signOut(auth)}>Sair</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)}>☰</button>
            <div>{isAdmin ? "Administração" : "Área do Utilizador"}</div>
          </div>
          <div className="topbar-right">
            <div className="topbar-meta">CNE · Agrupamento 1104</div>
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