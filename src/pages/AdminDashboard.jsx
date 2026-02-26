/* Admin dashboard
 src/pages/AdminDashboard.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-24 - revisão e optimização com Gemini */

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, orderBy, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { useAuth } from "../authContext";

function toDate(v) {
  if (!v) return null;
  return v && typeof v === 'object' && 'seconds' in v ? v.toDate() : new Date(v);
}

function getUrgencia(val) {
  const d = toDate(val);
  if (!d || isNaN(d.getTime())) return null;
  const diff = Math.ceil((d - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff < 0) return { label: "Atrasado", class: "urg-critica" };
  if (diff <= 3) return { label: `Em ${diff}d`, class: "urg-alta" };
  return { label: `Em ${diff}d`, class: "urg-normal" };
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("POR_TRATAR");
  const [qText, setQText] = useState("");

  // Mapeamento para exibição legível
  const labelEstado = {
    "SUBMETIDA": "Submetida",
    "EM_PREPARACAO": "Em preparação",
    "PRONTA": "Pronta",
    "ENTREGUE": "Entregue",
    "DEVOLVIDA": "Devolvida"
  };

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "requisicoes"), orderBy("criadaEm", "desc")));
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    sub: rows.filter(r => r.estado === "SUBMETIDA").length,
    pre: rows.filter(r => r.estado === "EM_PREPARACAO").length,
    pro: rows.filter(r => r.estado === "PRONTA").length,
    ent: rows.filter(r => r.estado === "ENTREGUE").length,
    dev: rows.filter(r => r.estado === "DEVOLVIDA").length,
  }), [rows]);

  const filtrados = useMemo(() => {
    let list = rows;
    if (filtro === "POR_TRATAR") list = list.filter(r => ["SUBMETIDA", "EM_PREPARACAO", "PRONTA"].includes(r.estado));
    if (qText) {
      const term = qText.toLowerCase();
      list = list.filter(r => 
        r.id.toLowerCase().includes(term) || 
        (r.criadaPorNome || "").toLowerCase().includes(term)
      );
    }
    return list;
  }, [rows, filtro, qText]);

  async function handlePreparar(id) {
    await updateDoc(doc(db, "requisicoes", id), { 
      estado: "EM_PREPARACAO", 
      preparadaPorNome: profile?.nome,
      preparadaEm: serverTimestamp(),
      atualizadoEm: serverTimestamp() 
    });
    load();
  }

  return (
    <AppLayout>
      <div className="row" style={{justifyContent:'space-between', marginBottom: 20}}>
        <h3 className="h3">Administração</h3>
        <button className="btn-secondary" onClick={load}>Recarregar</button>
      </div>

      <div className="grid-5">
        <div className="card-stat stat-submetida"><div className="stat-label">Submetidas</div><div className="stat-value">{stats.sub}</div></div>
        <div className="card-stat stat-em_preparacao"><div className="stat-label">Em preparação</div><div className="stat-value">{stats.pre}</div></div>
        <div className="card-stat stat-pronta"><div className="stat-label">Prontas</div><div className="stat-value">{stats.pro}</div></div>
        <div className="card-stat stat-entregue"><div className="stat-label">Entregues</div><div className="stat-value">{stats.ent}</div></div>
        <div className="card-stat stat-devolvida"><div className="stat-label">Devolvidas</div><div className="stat-value">{stats.dev}</div></div>
      </div>

      <div className="card" style={{marginTop: 25}}>
        <h4 className="h4" style={{marginBottom: 15}}>Pedidos</h4>
        <div className="row" style={{marginBottom: 20}}>
          <select className="select" style={{width: 160}} value={filtro} onChange={e=>setFiltro(e.target.value)}>
            <option value="POR_TRATAR">POR TRATAR</option>
            <option value="TODOS">TODOS</option>
          </select>
          <input className="input" placeholder="Pesquisar..." style={{flex: 1}} value={qText} onChange={e=>setQText(e.target.value)} />
          <button className="btn-secondary" onClick={()=>{setFiltro("POR_TRATAR"); setQText("");}}>Limpar</button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Urgência</th><th>ID</th><th>Requisitante</th><th>Período</th><th>Estado</th><th style={{textAlign:'right'}}>Ações</th></tr>
            </thead>
            <tbody>
              {filtrados.map(r => {
                const urg = getUrgencia(r.dataInicio);
                return (
                  <tr key={r.id}>
                    <td>{urg && <span className={`urg-badge ${urg.class}`}>{urg.label}</span>}</td>
                    <td className="mono" style={{fontSize: 11}}>{r.id.substring(0,8)}</td>
                    <td style={{fontWeight: 600}}>{r.criadaPorNome}</td>
                    <td style={{fontSize: 12, whiteSpace: 'nowrap'}}>{toDate(r.dataInicio)?.toLocaleDateString("pt-PT")} → {toDate(r.dataFim)?.toLocaleDateString("pt-PT")}</td>
                    {/* CORREÇÃO: Classe técnica + Texto legível */}
                    <td><span className={`chip chip-${(r.estado || "").toLowerCase()}`}>{labelEstado[r.estado] || r.estado}</span></td>
                    <td style={{textAlign:'right'}}>
                      {r.estado === "SUBMETIDA" ? (
                        <button className="btn" style={{padding: '4px 8px'}} onClick={() => handlePreparar(r.id)}>Em preparação</button>
                      ) : (
                        <Link className="btn-secondary" to={`/admin/requisicoes/${r.id}`}>Abrir</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

