/* Login page
 src/pages/Login.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

import logo from "../assets/logo_agrup.png";
import bg from "../assets/Eq_Material.jpg";
import alforge from "../assets/alforge_text.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      nav("/", { replace: true });
    } catch {
      setErr("Login falhou. Verifica email/password.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        backgroundImage: `url(${logo})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* overlay para melhorar legibilidade do formulário */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "min(980px, 95vw)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        {/* Coluna esquerda: imagem */}
        <div
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <img
            src={bg}
            alt="Equipa Material"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",   // MOSTRA IMAGEM COMPLETA (sem cortar)
              display: "block",
            }}
          />
        </div>

        {/* Coluna direita: título + form */}
        <div style={{ padding: 28 }}>
        <img
          src={alforge}
          alt="Alforge"
          style={{
            width: 320,
            height: "auto",
            display: "block",
            background: "transparent",
            mixBlendMode: "multiply",   // remove “caixa branca” residual (opcional)
          }}
        />

          <h3><p style={{ marginTop: 10, marginBottom: 18, opacity: 0.90 }}>
            Pronto para a próxima aventura!
          </p></h3>
          <p></p>
          
          <p style={{ marginTop: 8, marginBottom: 18, opacity: 0.75 }}>
            Gestão de Material do Agrupamento 1104 - Paranhos
          </p>

          <form onSubmit={onSubmit}>
            <label style={label}>Email</label>
            <input
              style={input}
              placeholder="ex.: nome@dominio.pt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <label style={label}>Password</label>
            <input
              style={input}
              placeholder="********"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
            />

            <button style={button}>Entrar</button>

            {err && <p style={{ color: "crimson", marginTop: 12 }}>{err}</p>}
          </form>

          <p style={{ marginTop: 18, fontSize: 12, opacity: 0.65 }}>
            Acesso restrito a utilizadores autorizados.
          </p>
        </div>
      </div>

      {/* Responsivo: em ecrãs pequenos vira 1 coluna */}
      <style>{`
        @media (max-width: 820px) {
          .login-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const label = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.8,
};

const input = {
  width: "100%",
  padding: 10,
  marginBottom: 14,
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
};

const button = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
};