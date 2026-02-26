/* User dashboard
 src/pages/UserDashboard.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-24 - revisão e optimização com Gemini */

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuth } from "../authContext";
import AppLayout from "../layouts/AppLayout";
import { sendPasswordResetEmail } from "firebase/auth";

// FUNÇÃO PARA GARANTIR QUE O ECRÃ NÃO FICA BRANCO
function safeValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if (v.toDate) return v.toDate().toLocaleDateString("pt-PT");
    if (v.seconds) return new Date(v.seconds * 1000).toLocaleDateString("pt-PT");
  }
  return String(v);
}

export default function UserDashboard() {
  const { user, profile } = useAuth();
  const [minhas, setMinhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ dataInicio: "", dataFim: "", obs: "" });

  useEffect(() => {
    async function load() {
      if (!user?.uid) return;
      try {
        const q = query(collection(db, "requisicoes"), 
        where("criadaPorUid", "==", user.uid), 
        orderBy("criadaEm", "desc")
      );
        const snap = await getDocs(q);
        setMinhas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { 
        console.error(e); 
      }
      setLoading(false);
    }
    load();
  }, [user]);

  const stats = useMemo(() => ({
    sub: minhas.filter(r => r.estado === "SUBMETIDA").length,
    pre: minhas.filter(r => r.estado === "EM_PREPARACAO").length,
    pro: minhas.filter(r => r.estado === "PRONTA").length,
    ent: minhas.filter(r => r.estado === "ENTREGUE").length,
    dev: minhas.filter(r => r.estado === "DEVOLVIDA").length,
  }), [minhas]);

    if (loading) {
    return (
      <AppLayout>
        <div style={{ padding: 16 }}>A carregar o teu painel...</div>
      </AppLayout>
    );
    }

  return (
    <AppLayout>
      <h3 className="h3">Painel do Utilizador</h3>
      
      {/* 5 Cartões */ }
      <div className="grid-5">
        <div className="card-stat stat-submetida"><div className="stat-label">SUBMETIDAS</div><div className="stat-value">{stats.sub}</div></div>
        <div className="card-stat stat-em_preparacao"><div className="stat-label">EM PREPARAÇÃO</div><div className="stat-value">{stats.pre}</div></div>
        <div className="card-stat stat-pronta"><div className="stat-label">PRONTAS</div><div className="stat-value">{stats.pro}</div></div>
        <div className="card-stat stat-entregue"><div className="stat-label">ENTREGUES</div><div className="stat-value">{stats.ent}</div></div>
        <div className="card-stat stat-devolvida"><div className="stat-label">DEVOLVIDAS</div><div className="stat-value">{stats.dev}</div></div>
      </div>

      <div className="grid-2" style={{marginBottom: 20}}>
        {/* Formulário Original */ }
        <div className="card">
          <h4 className="h4">Nova requisição</h4>
          <div className="row" style={{marginTop: 10}}>
            <input type="date" className="input" style={{flex:1}} onChange={e => setForm({...form, dataInicio: e.target.value})} />
            <input type="date" className="input" style={{flex:1}} onChange={e => setForm({...form, dataFim: e.target.value})} />
          </div>
          <textarea className="input" style={{width:'100%', marginTop:10, height: 80}} placeholder="Observações..." onChange={e => setForm({...form, obs: e.target.value})} />
          <button className="btn" style={{marginTop: 10, width: '100%'}} onClick={async () => {
            if(!form.dataInicio || !form.dataFim) return alert("Preenche as datas.");
            await addDoc(collection(db, "requisicoes"), { ...form, criadaPorUid: user.uid, criadaPorNome: profile?.nome, estado: "SUBMETIDA", criadaEm: serverTimestamp() });
            window.location.reload();
          }}>Submeter Pedido</button>
        </div>

        { /* Segurança */ }
        <div className="card">
          <h4 className="h4">Segurança</h4>
          <p style={{fontSize: 14, opacity: 0.7}}>Podes alterar a tua password. Receberás um link no email.</p>
          <button className="btn-secondary" style={{marginTop: 10}} onClick={() => sendPasswordResetEmail(auth, user.email).then(()=>alert("Email enviado!"))}>Alterar password</button>
        </div>
      </div>

      {/* Tabela de Histórico */ }
      <div className="card">
        <h4 className="h4">Histórico</h4>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>ID</th><th>Início</th><th>Fim</th><th>Estado</th></tr></thead>
            <tbody>
              {minhas.map(r => (
                <tr key={r.id}>
                  <td className="mono">{r.id.substring(0,8)}</td>
                  <td>{safeValue(r.dataInicio)}</td>
                  <td>{safeValue(r.dataFim)}</td>
                  <td><span className={`chip chip-${r.estado?.toLowerCase()}`}>{r.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
