/* User dashboard
 src/pages/UserDashboard.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-24 - revisão e optimização com Gemini */

/* User dashboard
 src/pages/UserDashboard.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../layouts/AppLayout";
import { useAuth } from "../authContext";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit,
  getCountFromServer // OTIMIZAÇÃO: Para contagens rápidas e baratas
} from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { db, auth } from "../firebase";

const ESTADOS_REQ = [
  "TODOS",
  "SUBMETIDA",
  "EM_PREPARACAO",
  "ENTREGUE",
  "DEVOLVIDA",
  "CANCELADA",
];

/* ---------------- Dicionário para Textos Amigáveis ---------------- */
const TEXTO_AMIGAVEL = {
  "SUBMETIDA": "Submetida",
  "EM_PREPARACAO": "Em preparação",
  "ENTREGUE": "Entregue",
  "DEVOLVIDA": "Devolvida",
  "CANCELADA": "Cancelada",
  "TODOS": "Todos os estados"
};

function fmtLabel(val) {
  if (!val) return val;
  return TEXTO_AMIGAVEL[val] || val;
}

function chipClass(estado) {
  switch (estado) {
    case "SUBMETIDA":
      return "chip chip-sub";
    case "EM_PREPARACAO":
      return "chip chip-prep";
    case "ENTREGUE":
      return "chip chip-ent";
    case "DEVOLVIDA":
      return "chip chip-dev";
    case "CANCELADA":
      return "chip chip-can";
    default:
      return "chip";
  }
}

function cardAccentClass(estado) {
  switch (estado) {
    case "SUBMETIDA":
      return "card-accent accent-blue";
    case "EM_PREPARACAO":
      return "card-accent accent-amber";
    case "ENTREGUE":
      return "card-accent accent-purple";
    case "DEVOLVIDA":
      return "card-accent accent-green";
    default:
      return "card-accent accent-slate";
  }
}

function tsToDate(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(v) {
  const d = tsToDate(v);
  return d ? d.toLocaleDateString("pt-PT") : "—";
}

function validatePassword(pw) {
  const errors = [];
  if (!pw || pw.length < 16) errors.push("mínimo 16 caracteres");
  if (!/[A-Z]/.test(pw)) errors.push("pelo menos 1 letra maiúscula");
  if (!/[a-z]/.test(pw)) errors.push("pelo menos 1 letra minúscula");
  if (!/[0-9]/.test(pw)) errors.push("pelo menos 1 número");
  if (!/[!@#$%^&*()_\-+=\[\]{}|;:'",.<>/?`~\\]/.test(pw)) {
    errors.push("pelo menos 1 símbolo");
  }
  if (/\s/.test(pw)) errors.push("não pode conter espaços");
  return { ok: errors.length === 0, errors };
}

export default function UserDashboard() {
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  // OTIMIZAÇÃO: Estatísticas reais do utilizador atual
  const [counts, setCounts] = useState({ SUBMETIDA: 0, EM_PREPARACAO: 0, ENTREGUE: 0, DEVOLVIDA: 0 });

  // Criar pedido
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);

  // Filtros histórico
  const [fEstado, setFEstado] = useState("TODOS");
  const [fText, setFText] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  // Password
  const [showPw, setShowPw] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // OTIMIZAÇÃO: Conta os totais do utilizador (Custo: 4 leituras no total)
  async function loadMyStats() {
    if (!user?.uid) return;
    try {
      const ref = collection(db, "requisicoes");
      const baseQ = (est) => query(ref, where("criadaPorUid", "==", user.uid), where("estado", "==", est));
      
      const [cSub, cPrep, cEnt, cDev] = await Promise.all([
        getCountFromServer(baseQ("SUBMETIDA")),
        getCountFromServer(baseQ("EM_PREPARACAO")),
        getCountFromServer(baseQ("ENTREGUE")),
        getCountFromServer(baseQ("DEVOLVIDA"))
      ]);

      setCounts({
        SUBMETIDA: cSub.data().count,
        EM_PREPARACAO: cPrep.data().count,
        ENTREGUE: cEnt.data().count,
        DEVOLVIDA: cDev.data().count
      });
    } catch (e) { console.error(e); }
  }

  async function loadMine() {
    if (!user?.uid) return;
    setLoading(true);
    setErr("");
    try {
      const ref = collection(db, "requisicoes");
      // OTIMIZAÇÃO: Pede apenas os 50 mais recentes para ser instantâneo
      const qs = query(
        ref, 
        where("criadaPorUid", "==", user.uid), 
        orderBy("criadaEm", "desc"), 
        limit(50)
      );
      const snap = await getDocs(qs);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setErr("Erro ao carregar o teu histórico (ver consola).");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.uid) {
      loadMyStats();
      loadMine();
    }
  }, [user?.uid]);

  const filtered = useMemo(() => {
    const t = fText.trim().toLowerCase();
    const fromD = fFrom ? new Date(`${fFrom}T00:00:00`) : null;
    const toD = fTo ? new Date(`${fTo}T23:59:59`) : null;

    return rows
      .filter((r) => (fEstado === "TODOS" ? true : r.estado === fEstado))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.id} ${fmtLabel(r.estado ?? "").toLowerCase()} ${r.observacoes ?? ""}`.toLowerCase();
        return hay.includes(t);
      })
      .filter((r) => {
        if (!fromD && !toD) return true;
        const di = tsToDate(r.dataInicio);
        const df = tsToDate(r.dataFim);
        if (fromD && df && df < fromD) return false;
        if (toD && di && di > toD) return false;
        return true;
      });
  }, [rows, fEstado, fText, fFrom, fTo]);

  async function criarRequisicao(e) {
    e.preventDefault();
    if (!user?.uid) return;
    if (!dataInicio || !dataFim) return alert("Define data de início e fim.");
    
    const di = new Date(`${dataInicio}T00:00:00`);
    const df = new Date(`${dataFim}T00:00:00`);
    if (df < di) return alert("A data fim não pode ser anterior à data início.");

    setBusyCreate(true);
    try {
      await addDoc(collection(db, "requisicoes"), {
        criadaPorUid: user.uid,
        criadaPorNome: profile?.nome ?? "",
        criadaEm: serverTimestamp(),
        dataInicio: di,
        dataFim: df,
        estado: "SUBMETIDA",
        observacoes: observacoes.trim(),
      });

      setDataInicio("");
      setDataFim("");
      setObservacoes("");
      alert("Requisição submetida com sucesso!");
      loadMyStats();
      loadMine();
    } catch (e2) {
      console.error(e2);
      alert("Erro ao criar requisição.");
    } finally {
      setBusyCreate(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (!auth.currentUser?.email) return;
    if (!pwCurrent || !pwNew || !pwNew2) return alert("Preenche todos os campos.");
    if (pwNew !== pwNew2) return alert("As passwords novas não coincidem.");

    const v = validatePassword(pwNew);
    if (!v.ok) return alert("Password inválida:\n- " + v.errors.join("\n- "));

    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, pwCurrent);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, pwNew);
      setPwCurrent(""); setPwNew(""); setPwNew2(""); setShowPw(false);
      alert("Password alterada com sucesso!");
    } catch (err2) {
      console.error(err2);
      alert("Erro ao alterar password (pode ser necessária uma nova autenticação).");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Painel do Utilizador</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Olá, <b>{profile?.nome ?? user?.email}</b> — acompanha aqui os teus pedidos.
          </div>
        </div>
        <button className="btn-secondary" onClick={() => { loadMyStats(); loadMine(); }}>Recarregar</button>
      </div>

      {err ? <div style={{ marginTop: 10, color: "crimson" }}>{err}</div> : null}

      {/* Cartões de Estatísticas com Texto Amigável */}
      <div
        className="user-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div className={cardAccentClass("SUBMETIDA")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtLabel("SUBMETIDA").toUpperCase()}</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.SUBMETIDA}</div>
          </div>
        </div>
        <div className={cardAccentClass("EM_PREPARACAO")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtLabel("EM_PREPARACAO").toUpperCase()}</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.EM_PREPARACAO}</div>
          </div>
        </div>
        <div className={cardAccentClass("ENTREGUE")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtLabel("ENTREGUE").toUpperCase()}</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.ENTREGUE}</div>
          </div>
        </div>
        <div className={cardAccentClass("DEVOLVIDA")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtLabel("DEVOLVIDA").toUpperCase()}</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.DEVOLVIDA}</div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: "stretch" }}>
        {/* Formulário de Criação */}
        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          <h3 className="h3">Nova requisição</h3>
          <form onSubmit={criarRequisicao}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Data início</div>
                <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} disabled={busyCreate} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Data fim</div>
                <input className="input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} disabled={busyCreate} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Observações</div>
              <input
                className="input"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                disabled={busyCreate}
                placeholder="Ex.: material para acampamento de patrulha…"
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn" type="submit" disabled={busyCreate}>
                {busyCreate ? "A submeter..." : "Submeter pedido"}
              </button>
            </div>
          </form>
        </div>

        {/* Segurança */}
        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 className="h3">Segurança</h3>
            <button className="btn-secondary" onClick={() => setShowPw((v) => !v)}>
              {showPw ? "Fechar" : "Alterar password"}
            </button>
          </div>
          {showPw && (
            <form onSubmit={changePassword} style={{ marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Password atual</div>
                <input className="input" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} disabled={pwBusy} />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Nova password</div>
                  <input className="input" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} disabled={pwBusy} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Confirmar</div>
                  <input className="input" type="password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} disabled={pwBusy} />
                </div>
              </div>
              <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={pwBusy}>Guardar nova password</button>
            </form>
          )}
        </div>
      </div>

      {/* Histórico Local */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="h3">Os meus pedidos recentes</h3>
        <div className="row" style={{ marginBottom: 12 }}>
          <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            {ESTADOS_REQ.map((e) => (
              <option key={e} value={e}>{fmtLabel(e)}</option>
            ))}
          </select>
          <input className="input" style={{ flex: 1 }} placeholder="Pesquisar..." value={fText} onChange={(e) => setFText(e.target.value)} />
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Período</th>
                <th>Estado</th>
                <th>Observações</th>
                <th>Submetido em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>A carregar...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5}>Sem registos encontrados.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{fmtDate(r.dataInicio)} → {fmtDate(r.dataFim)}</td>
                    <td><span className={chipClass(r.estado)}>{fmtLabel(r.estado)}</span></td>
                    <td>{r.observacoes ?? "-"}</td>
                    <td>{fmtDate(r.criadaEm)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px){ .user-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
        @media (max-width: 620px){ .user-grid-4 { grid-template-columns: 1fr !important; } }
      `}</style>
    </AppLayout>
  );
}