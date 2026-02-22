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
    errors.push("pelo menos 1 símbolo (ex.: ! @ # $ % ...)");
  }
  if (/\s/.test(pw)) errors.push("não pode conter espaços");
  // opcional: evitar acentos/emoji (ASCII)
  if (/[^\x20-\x7E]/.test(pw)) errors.push("usar apenas caracteres sem acentos/emoji");
  return { ok: errors.length === 0, errors };
}

export default function UserDashboard() {
  const { user, profile } = useAuth();

  // dados
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  // criar pedido
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);

  // filtros histórico
  const [fEstado, setFEstado] = useState("TODOS");
  const [fText, setFText] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  // password
  const [showPw, setShowPw] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

 async function loadMine() {
  if (!user?.uid) return;
  setLoading(true);
  setErr("");

  try {
    const ref = collection(db, "requisicoes");
    const qs = query(ref, where("criadaPorUid", "==", user.uid));
    const snap = await getDocs(qs);

    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Ordena localmente por criadaEm desc (serverTimestamp pode ser null em docs muito recentes)
    data.sort((a, b) => {
      const ta = tsToDate(a.criadaEm)?.getTime?.() ?? 0;
      const tb = tsToDate(b.criadaEm)?.getTime?.() ?? 0;
      return tb - ta;
    });

    setRows(data);
  } catch (e) {
    console.error(e);
    const code = e?.code || "";
    if (code.includes("failed-precondition")) {
      setErr("Falta índice no Firestore para esta pesquisa (ver consola e criar index).");
    } else if (code.includes("permission-denied")) {
      setErr("Sem permissões para ler as tuas requisições (regras Firestore).");
    } else {
      setErr("Não foi possível carregar as requisições (ver consola).");
    }
  } finally {
    setLoading(false);
  }
}


  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const counts = useMemo(() => {
    const c = { SUBMETIDA: 0, EM_PREPARACAO: 0, ENTREGUE: 0, DEVOLVIDA: 0, CANCELADA: 0 };
    for (const r of rows) c[r.estado] = (c[r.estado] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const t = fText.trim().toLowerCase();
    const fromD = fFrom ? new Date(`${fFrom}T00:00:00`) : null;
    const toD = fTo ? new Date(`${fTo}T23:59:59`) : null;

    return rows
      .filter((r) => (fEstado === "TODOS" ? true : r.estado === fEstado))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.id} ${r.estado ?? ""} ${r.observacoes ?? ""}`.toLowerCase();
        return hay.includes(t);
      })
      .filter((r) => {
        if (!fromD && !toD) return true;

        const di = tsToDate(r.dataInicio);
        const df = tsToDate(r.dataFim);

        const start = di ?? df;
        const end = df ?? di;
        if (!start && !end) return true;

        const s = start ?? end;
        const e = end ?? start;

        if (fromD && e < fromD) return false;
        if (toD && s > toD) return false;
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
      await loadMine();
      alert("Requisição submetida!");
    } catch (e2) {
      console.error(e2);
      alert("Erro ao criar requisição (ver consola).");
    } finally {
      setBusyCreate(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (!auth.currentUser?.email) return alert("Não foi possível identificar o email do utilizador.");
    if (!pwCurrent || !pwNew || !pwNew2) return alert("Preenche todos os campos.");
    if (pwNew !== pwNew2) return alert("A nova password e a confirmação não coincidem.");

    const v = validatePassword(pwNew);
    if (!v.ok) return alert("Password inválida:\n- " + v.errors.join("\n- "));

    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, pwCurrent);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, pwNew);

      setPwCurrent("");
      setPwNew("");
      setPwNew2("");
      setShowPw(false);

      alert("Password alterada com sucesso!");
    } catch (err2) {
      console.error(err2);
      const code = err2?.code || "";
      if (code.includes("auth/wrong-password")) alert("Password atual incorreta.");
      else if (code.includes("auth/too-many-requests")) alert("Demasiadas tentativas. Tenta novamente mais tarde.");
      else if (code.includes("auth/requires-recent-login")) alert("Por segurança, faz logout e login novamente e tenta outra vez.");
      else alert("Erro ao alterar password (ver consola).");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Painel do Utilizador</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Olá, <b>{profile?.nome ?? user?.email}</b> — acompanha aqui os teus pedidos.
          </div>
        </div>
        <button className="btn-secondary" onClick={loadMine}>Recarregar</button>
      </div>

      {err ? <div style={{ marginTop: 10, color: "crimson" }}>{err}</div> : null}

      {/* Cards coloridos */}
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
            <div style={{ fontSize: 12, opacity: 0.75 }}>SUBMETIDAS</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.SUBMETIDA}</div>
          </div>
        </div>
        <div className={cardAccentClass("EM_PREPARACAO")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>EM PREPARAÇÃO</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.EM_PREPARACAO}</div>
          </div>
        </div>
        <div className={cardAccentClass("ENTREGUE")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>ENTREGUES</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.ENTREGUE}</div>
          </div>
        </div>
        <div className={cardAccentClass("DEVOLVIDA")}>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>DEVOLVIDAS</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{counts.DEVOLVIDA}</div>
          </div>
        </div>
      </div>

      {/* Nova Requisição + Segurança */}
      <div className="row" style={{ marginTop: 12, alignItems: "stretch" }}>
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
                placeholder="Ex.: preciso de 2 tendas e 2 extensões…"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn" type="submit" disabled={busyCreate}>
                {busyCreate ? "A submeter..." : "Submeter"}
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
              A Equipa de Material faz a alocação dos equipamentos ao pedido.
            </div>
          </form>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 className="h3">Segurança</h3>
            <button className="btn-secondary" onClick={() => setShowPw((v) => !v)}>
              {showPw ? "Fechar" : "Alterar password"}
            </button>
          </div>

          {!showPw ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Podes alterar a tua password quando quiseres.
            </div>
          ) : (
            <form onSubmit={changePassword} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                Regras: mínimo <b>16</b> caracteres, com <b>maiúsculas</b>, <b>minúsculas</b>, <b>números</b> e <b>símbolos</b>.
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Password atual</div>
                <input className="input" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} disabled={pwBusy} />
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Nova password</div>
                  <input className="input" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} disabled={pwBusy} />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Confirmar</div>
                  <input className="input" type="password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} disabled={pwBusy} />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <button className="btn" type="submit" disabled={pwBusy}>
                  {pwBusy ? "A guardar..." : "Guardar nova password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Histórico + filtros */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h3">Histórico de requisições</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {loading ? "A carregar..." : `${filtered.length} / ${rows.length}`}
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            {ESTADOS_REQ.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>

          <input
            className="input"
            style={{ minWidth: 260 }}
            placeholder="Pesquisar (ID, observações, estado...)"
            value={fText}
            onChange={(e) => setFText(e.target.value)}
          />

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>De</div>
              <input className="input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Até</div>
              <input className="input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
          </div>

          <button
            className="btn-secondary"
            onClick={() => { setFEstado("TODOS"); setFText(""); setFFrom(""); setFTo(""); }}
          >
            Limpar filtros
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Período</th>
                <th>Estado</th>
                <th>Observações</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>A carregar...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5}>Sem resultados.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{fmtDate(r.dataInicio)} → {fmtDate(r.dataFim)}</td>
                    <td><span className={chipClass(r.estado)}>{r.estado}</span></td>
                    <td>{r.observacoes ?? "-"}</td>
                    <td>{fmtDate(r.criadaEm)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Dica: usa os filtros para encontrares rapidamente pedidos por estado ou por texto nas observações.
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px){
          .user-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 620px){
          .user-grid-4 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppLayout>
  );
}

