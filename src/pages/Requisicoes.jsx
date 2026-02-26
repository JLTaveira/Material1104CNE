/* Lista Requisicoes
 src/pages/Requisicoes.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) 
 2026-02-24 optimização e revisão do código com Gemini */
 
import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, orderBy, query, limit, where } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";

// A VACINA ABSOLUTA
function getSafeText(val) {
  try {
    if (val === null || val === undefined) return "—";
    if (typeof val === "string" || typeof val === "number") return String(val);
    if (val instanceof Date) return val.toLocaleDateString("pt-PT");
    if (typeof val === "object") {
      if (typeof val.toDate === "function") return val.toDate().toLocaleDateString("pt-PT");
      if (typeof val.seconds === "number") return new Date(val.seconds * 1000).toLocaleDateString("pt-PT");
    }
  } catch(e) {}
  return "—";
}

function getChip(estado) {
  if (!estado) return "chip";
  const e = String(estado).toLowerCase();
  return `chip chip-${e}`;
}

export default function Requisicoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [fEstado, setFEstado] = useState("SUBMETIDA");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [qText, setQText] = useState("");

  async function load() {
    setLoading(true);
    try {
      let q = query(collection(db, "requisicoes"), orderBy("criadaEm", "desc"), limit(100));
      if (fEstado) q = query(q, where("estado", "==", fEstado));
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Erro a carregar:", e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [fEstado]);

  const filtrados = useMemo(() => {
    return rows.filter(r => {
      const txt = (getSafeText(r.id) + " " + getSafeText(r.criadaPorNome) + " " + getSafeText(r.observacoes)).toLowerCase();
      const matchText = !qText || txt.includes(qText.toLowerCase());
      const matchFrom = !dFrom || (r.dataInicio && r.dataInicio >= dFrom);
      const matchTo = !dTo || (r.dataInicio && r.dataInicio <= dTo);
      return matchText && matchFrom && matchTo;
    });
  }, [rows, qText, dFrom, dTo]);

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 className="h3" style={{marginBottom: 4}}>Requisições</h3>
          <p style={{fontSize: 13, opacity: 0.7, margin: 0}}>Filtrar, abrir e exportar.</p>
        </div>
        <div className="row">
          <button className="btn-secondary" onClick={() => alert("Em desenvolvimento")}>Export CSV</button>
          <button className="btn-secondary" onClick={load}>Recarregar</button>
        </div>
      </div>

      <div className="card" style={{ background: '#ffffff', marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{display:'block', fontSize:12, marginBottom:4, fontWeight: 600, opacity:0.8}}>Estado</label>
            <select className="select" style={{width:'100%'}} value={fEstado} onChange={e => setFEstado(e.target.value)}>
              <option value="">Estado: Todos</option>
              <option value="SUBMETIDA">Estado: SUBMETIDA</option>
              <option value="EM_PREPARACAO">Estado: EM PREPARAÇÃO</option>
              <option value="PRONTA">Estado: PRONTA</option>
              <option value="ENTREGUE">Estado: ENTREGUE</option>
              <option value="DEVOLVIDA">Estado: DEVOLVIDA</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{display:'block', fontSize:12, marginBottom:4, fontWeight: 600, opacity:0.8}}>Início (de)</label>
            <input type="date" className="input" style={{width:'100%'}} value={dFrom} onChange={e => setDFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{display:'block', fontSize:12, marginBottom:4, fontWeight: 600, opacity:0.8}}>Início (até)</label>
            <input type="date" className="input" style={{width:'100%'}} value={dTo} onChange={e => setDTo(e.target.value)} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{display:'block', fontSize:12, marginBottom:4, fontWeight: 600, opacity:0}}>-</label>
            <input className="input" style={{width:'100%'}} placeholder="Pesquisar (observações / uid / nome / id)..." value={qText} onChange={e => setQText(e.target.value)} />
          </div>
          <div>
            <button className="btn-secondary" onClick={() => { setFEstado("SUBMETIDA"); setDFrom(""); setDTo(""); setQText(""); }}>Limpar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>ID</th><th>Estado</th><th>Início</th><th>Fim</th><th>Requisitante</th><th style={{textAlign: 'right'}}>Ações</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}>A carregar...</td></tr> : 
               filtrados.length === 0 ? <tr><td colSpan={6} style={{padding: 20}}>Sem resultados.</td></tr> :
               filtrados.map(r => (
                <tr key={r.id}>
                  <td className="mono">{getSafeText(r.id).substring(0, 8)}</td>
                  <td><span className={getChip(r.estado)}>{getSafeText(r.estado)}</span></td>
                  <td>{getSafeText(r.dataInicio)}</td>
                  <td>{getSafeText(r.dataFim)}</td>
                  <td style={{fontWeight: 600}}>{getSafeText(r.criadaPorNome)}</td>
                  <td style={{textAlign: 'right'}}><Link className="btn-secondary" style={{padding: '6px 12px'}} to={`/admin/requisicoes/${r.id}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}