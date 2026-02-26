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
import emailjs from '@emailjs/browser';

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

  async function notificarNovaRequisicao(idRequisicao) {
    console.log("Iniciando processo de notificação...");
    try {
      // 1. Procura ADMINs e GESTORs
      const q = query(collection(db, "users"), where("role", "in", ["ADMIN", "GESTOR"]));
      const snap = await getDocs(q);
      
      // Criar lista de e-mails única (Admins + Secretaria)
      const emails = snap.docs.map(d => d.data().email).filter(e => e);
      emails.push("geral.1104@escutismo.pt");
      const listaFinal = [...new Set(emails)];

      console.log("Destinatários para notificar:", listaFinal);

      // 2. Enviar um e-mail para cada destinatário (Mais seguro que lista separada por vírgula)
      const promessas = listaFinal.map(emailDest => {
        const templateParams = {
          to_email: emailDest,
          id_curto: idRequisicao.substring(0, 8),
          timestamp: new Date().toLocaleString("pt-PT"),
          mensagem_principal: `Foi criada uma nova requisição no ALFORGE de ${profile?.nome}, em ${new Date().toLocaleString("pt-PT")}.`
        };
        return emailjs.send('service_sx1klqh', 'template_oq5qqda', templateParams, 'PngEeenmXc-Fv3VP8');
      });

      await Promise.all(promessas);
      console.log("Todas as notificações foram enviadas com sucesso!");
    } catch (err) {
      console.error("Erro detalhado ao enviar notificações:", err);
    }
  }

    // Função que substitui o onClick do botão
  async function handleSubmissao() {
    if (!form.dataInicio || !form.dataFim) return alert("Preenche as datas.");
    
    try {
      console.log("A criar documento no Firestore...");
      const docRef = await addDoc(collection(db, "requisicoes"), { 
        ...form, 
        criadaPorUid: user.uid, 
        criadaPorNome: profile?.nome, 
        criadaPorEmail: user.email,
        estado: "SUBMETIDA", 
        criadaEm: serverTimestamp() 
      });

      console.log("Documento criado ID:", docRef.id);

      // AGUARDA o envio dos emails
      await notificarNovaRequisicao(docRef.id);

      alert("Pedido submetido com sucesso! Verifica a consola (F12) se o email não chegar.");
      
      // COMENTA ESTA LINHA temporariamente para testar:
      // window.location.reload(); 
      
    } catch (e) {
      console.error("Erro na submissão:", e);
      alert("Erro ao submeter pedido.");
    }
  }

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
          <h5 className="h5">Precisas do material entre que datas?</h5>
          <div className="row" style={{marginTop: 10}}>
            <input type="date" className="input" style={{flex:1}} onChange={e => setForm({...form, dataInicio: e.target.value})} />
            <input type="date" className="input" style={{flex:1}} onChange={e => setForm({...form, dataFim: e.target.value})} />
          </div>
          <textarea className="input" style={{width:'100%', marginTop:10, height: 80}} placeholder="Observações..." onChange={e => setForm({...form, obs: e.target.value})} />
          <button 
            className="btn" 
            style={{marginTop: 10, width: '100%'}} 
            onClick={handleSubmissao}
          >
            Submeter Pedido
          </button>
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
