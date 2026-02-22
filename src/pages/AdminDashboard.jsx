/* Admin dashboard
 src/pages/AdminDashboard.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../layouts/AppLayout";
import { useAuth } from "../authContext";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const ESTADOS = ["SUBMETIDA", "EM_PREPARACAO", "ENTREGUE", "DEVOLVIDA", "CANCELADA"];

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

function cardAccentClass(title) {
  switch (title) {
    case "SUBMETIDAS":
      return "card-accent accent-blue";
    case "EM PREPARAÇÃO":
      return "card-accent accent-amber";
    case "ENTREGUES":
      return "card-accent accent-purple";
    case "DEVOLVIDAS":
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

function daysUntil(date) {
  const d = tsToDate(date);
  if (!d) return null;
  const now = new Date();
  const diff = d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function Stat({ title, value, hint }) {
  return (
    <div className={cardAccentClass(title)} style={{ padding: 14 }}>
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{title}</div>
        <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>
          {value ?? "—"}
        </div>
        {hint ? (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, profile } = useAuth();
  const isAdmin = (profile?.role ?? "USER") === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Requisições
  const [reqRows, setReqRows] = useState([]);
  const [fEstado, setFEstado] = useState("POR_TRATAR"); // POR_TRATAR | TODOS | SUBMETIDA | ...
  const [fText, setFText] = useState("");

  async function loadReqs() {
    setLoading(true);
    setErr("");
    try {
      const reqRef = collection(db, "requisicoes");
      const reqQ = query(reqRef, orderBy("criadaEm", "desc"), limit(300));
      const reqSnap = await getDocs(reqQ);
      setReqRows(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setErr("Não foi possível carregar requisições (ver consola).");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.uid) return;
    loadReqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const counts = useMemo(() => {
    const c = { SUBMETIDA: 0, EM_PREPARACAO: 0, ENTREGUE: 0, DEVOLVIDA: 0, CANCELADA: 0 };
    for (const r of reqRows) c[r.estado] = (c[r.estado] ?? 0) + 1;
    return c;
  }, [reqRows]);

  const porTratar = (counts.SUBMETIDA ?? 0) + (counts.EM_PREPARACAO ?? 0);

  const reqFiltered = useMemo(() => {
    const t = fText.trim().toLowerCase();

    const base = reqRows.filter((r) => {
      if (fEstado === "POR_TRATAR") return r.estado === "SUBMETIDA" || r.estado === "EM_PREPARACAO";
      if (fEstado === "TODOS") return true;
      return r.estado === fEstado;
    });

    const withText = base.filter((r) => {
      if (!t) return true;
      const hay = `${r.id} ${r.estado ?? ""} ${r.criadaPorNome ?? ""} ${r.observacoes ?? ""}`.toLowerCase();
      return hay.includes(t);
    });

    // Ordenação por urgência: dataInicio mais próxima (só para POR_TRATAR)
    if (fEstado === "POR_TRATAR") {
      return withText.sort((a, b) => {
        const da = tsToDate(a.dataInicio)?.getTime?.() ?? Infinity;
        const dbb = tsToDate(b.dataInicio)?.getTime?.() ?? Infinity;
        return da - dbb;
      });
    }
    return withText;
  }, [reqRows, fEstado, fText]);

  async function setEstado(requisicaoId, estado) {
    try {
      await updateDoc(doc(db, "requisicoes", requisicaoId), {
        estado,
        atualizadoEm: serverTimestamp(),
      });
      setReqRows((prev) =>
        prev.map((r) => (r.id === requisicaoId ? { ...r, estado } : r))
      );
    } catch (e) {
      console.error(e);
      alert("Erro ao atualizar estado (ver consola).");
    }
  }

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Administração</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {porTratar > 0 ? (
              <>
                Tens <b>{porTratar}</b> pedido(s) por tratar.
              </>
            ) : (
              "Sem pedidos pendentes."
            )}
          </div>
        </div>
        <button className="btn-secondary" onClick={loadReqs}>
          Recarregar
        </button>
      </div>

      {!isAdmin ? (
        <div className="card" style={{ marginTop: 12, color: "crimson" }}>
          Acesso restrito a administradores.
        </div>
      ) : null}

      {err ? <div style={{ marginTop: 10, color: "crimson" }}>{err}</div> : null}

      {/* Cards de estado */}
      <div
        className="admin-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Stat title="SUBMETIDAS" value={loading ? "…" : counts.SUBMETIDA} hint="A aguardar triagem" />
        <Stat title="EM PREPARAÇÃO" value={loading ? "…" : counts.EM_PREPARACAO} hint="Separação em curso" />
        <Stat title="ENTREGUES" value={loading ? "…" : counts.ENTREGUE} hint="Material em uso" />
        <Stat title="DEVOLVIDAS" value={loading ? "…" : counts.DEVOLVIDA} hint="Fechadas" />
      </div>

      {/* PEDIDOS */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h3">Pedidos</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {loading ? "A carregar..." : `${reqFiltered.length} resultados`}
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="POR_TRATAR">POR TRATAR</option>
            <option value="TODOS">TODOS</option>
            {ESTADOS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input
            className="input"
            style={{ minWidth: 320 }}
            value={fText}
            onChange={(e) => setFText(e.target.value)}
            placeholder="Pesquisar (ID, nome, observações...)"
          />

          <button
            className="btn-secondary"
            onClick={() => { setFEstado("POR_TRATAR"); setFText(""); }}
          >
            Limpar
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Urgência</th>
                <th>ID</th>
                <th>Requisitante</th>
                <th>Período</th>
                <th>Estado</th>
                <th>Observações</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>A carregar...</td></tr>
              ) : reqFiltered.length === 0 ? (
                <tr><td colSpan={7}>Sem resultados.</td></tr>
              ) : (
                reqFiltered.map((r) => {
                  const d = daysUntil(r.dataInicio);
                  const urg =
                    d === null ? "—" :
                    d < 0 ? `Atrasado ${Math.abs(d)}d` :
                    d === 0 ? "Hoje" :
                    `Em ${d}d`;

                  return (
                    <tr key={r.id}>
                      <td><span className="chip">{urg}</span></td>
                      <td className="mono">{r.id}</td>
                      <td>{r.criadaPorNome || "—"}</td>
                      <td>{fmtDate(r.dataInicio)} → {fmtDate(r.dataFim)}</td>
                      <td><span className={chipClass(r.estado)}>{r.estado}</span></td>
                      <td>{r.observacoes ?? "-"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.estado === "SUBMETIDA" && (
                          <button className="btn-secondary" onClick={() => setEstado(r.id, "EM_PREPARACAO")}>
                            EM_PREPARACAO
                          </button>
                        )}
                        {r.estado === "EM_PREPARACAO" && (
                          <>
                            <button className="btn-secondary" onClick={() => setEstado(r.id, "ENTREGUE")}>
                              ENTREGUE
                            </button>{" "}
                            <button className="btn-secondary" onClick={() => setEstado(r.id, "DEVOLVIDA")}>
                              DEVOLVIDA
                            </button>
                          </>
                        )}
                        {r.estado === "ENTREGUE" && (
                          <button className="btn-secondary" onClick={() => setEstado(r.id, "DEVOLVIDA")}>
                            DEVOLVIDA
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Dica: usa o filtro <b>POR TRATAR</b> para focar o trabalho do dia.
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px){
          .admin-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 620px){
          .admin-grid-4 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppLayout>
  );
}
