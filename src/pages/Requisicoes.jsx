/* Lista Requisicoes
 src/pages/Requisicoes.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */
 
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { downloadCSV } from "../utils/csv";

const ESTADOS = ["", "SUBMETIDA", "EM_PREPARACAO", "ENTREGUE", "DEVOLVIDA", "CANCELADA"];

function toDate(v) {
  if (!v) return null;
  return v?.toDate ? v.toDate() : new Date(v);
}
function fmtTS(v) {
  const d = toDate(v);
  return d ? d.toLocaleString("pt-PT") : "-";
}
function fmtDate(v) {
  const d = toDate(v);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default function Requisicoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fEstado, setFEstado] = useState("SUBMETIDA");
  const [qText, setQText] = useState("");
  const [dFrom, setDFrom] = useState(""); // YYYY-MM-DD
  const [dTo, setDTo] = useState(""); // YYYY-MM-DD

  async function load() {
    setLoading(true);
    try {
      const ref = collection(db, "requisicoes");
      const qs = query(ref, orderBy("criadaEm", "desc"));
      const snap = await getDocs(qs);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    const from = dFrom ? new Date(dFrom + "T00:00:00") : null;
    const to = dTo ? new Date(dTo + "T23:59:59") : null;

    return rows
      .filter((r) => (fEstado ? (r.estado ?? "") === fEstado : true))
      .filter((r) => {
        const di = toDate(r.dataInicio);
        if (!from && !to) return true;
        if (!di) return false;
        if (from && di < from) return false;
        if (to && di > to) return false;
        return true;
      })
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.id} ${r.observacoes ?? ""} ${r.criadaPorUid ?? ""} ${r.criadaPorNome ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
  }, [rows, fEstado, qText, dFrom, dTo]);

  function exportCSV() {
    const headers = [
      { key: "id", label: "id" },
      { key: "estado", label: "estado" },
      { key: "dataInicio", label: "dataInicio" },
      { key: "dataFim", label: "dataFim" },
      { key: "criadaPorUid", label: "criadaPorUid" },
      { key: "criadaPorNome", label: "criadaPorNome" },
      { key: "observacoes", label: "observacoes" },
      { key: "criadaEm", label: "criadaEm" },
    ];

    const out = filtered.map((r) => ({
      id: r.id,
      estado: r.estado ?? "",
      dataInicio: fmtDate(r.dataInicio),
      dataFim: fmtDate(r.dataFim),
      criadaPorUid: r.criadaPorUid ?? "",
      criadaPorNome: r.criadaPorNome ?? "",
      observacoes: r.observacoes ?? "",
      criadaEm: fmtTS(r.criadaEm),
    }));

    const fn = `requisicoes_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(fn, out, headers);
  }

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Requisições</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Filtrar, abrir e exportar.
          </div>
        </div>

        <div className="row">
          <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
          <button className="btn-secondary" onClick={load}>Recarregar</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e ? `Estado: ${e}` : "Estado: TODOS"}
              </option>
            ))}
          </select>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Início (de)</div>
            <input className="input" type="date" value={dFrom} onChange={(e) => setDFrom(e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Início (até)</div>
            <input className="input" type="date" value={dTo} onChange={(e) => setDTo(e.target.value)} />
          </div>

          <input
            className="input"
            style={{ minWidth: 320, flex: 1 }}
            placeholder="Pesquisar (observações / uid / nome / id)..."
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />

          <button
            className="btn-secondary"
            onClick={() => { setFEstado("SUBMETIDA"); setQText(""); setDFrom(""); setDTo(""); }}
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading ? (
          <div>A carregar...</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estado</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Observações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td><span className="chip">{r.estado ?? "-"}</span></td>
                    <td>{fmtTS(r.dataInicio)}</td>
                    <td>{fmtTS(r.dataFim)}</td>
                    <td>{r.observacoes ?? "-"}</td>
                    <td>
                      <Link to={`/admin/requisicoes/${r.id}`}>Abrir</Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6}>Sem resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}