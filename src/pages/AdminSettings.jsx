/* Administracao aplicacao
 src/pages/AdminSettings.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) 
*/

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import AppLayout from "../layouts/AppLayout";

export default function AdminSettings() {
  const [cfg, setCfg] = useState({ host: "smtp.gmail.com", port: 465, user: "", pass: "", ativo: true });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getDoc(doc(db, "config", "email")).then(d => {
      if (d.exists()) setCfg(prev => ({ ...prev, ...d.data() }));
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setMsg("");
    try {
      await setDoc(doc(db, "config", "email"), { ...cfg, atualizadoEm: serverTimestamp() });
      setMsg("✅ Configurações guardadas!");
    } catch (e) { setMsg("❌ Erro ao guardar."); }
  }

  if (loading) return <AppLayout><div className="card">A carregar...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 className="h3">Definições de Comunicação</h3>
        {msg && <div className="chip chip-dev">{msg}</div>}
      </div>

      <div className="card" style={{ marginTop: 15, maxWidth: "600px" }}>
        <h4 className="h4">Servidor SMTP (Google Workspace)</h4>
        <div style={{ marginTop: 15 }}>
          <label className="lbl">Email de Envio</label>
          <input className="input" style={{ width: '100%' }} value={cfg.user} onChange={e => setCfg({...cfg, user: e.target.value})} placeholder="geral.1104@escutismo.pt" />
        </div>
        <div style={{ marginTop: 15 }}>
          <label className="lbl">Password de App (16 dígitos)</label>
          <input className="input" type="password" style={{ width: '100%' }} value={cfg.pass} onChange={e => setCfg({...cfg, pass: e.target.value})} />
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn" onClick={handleSave}>Guardar</button>
          <label style={{ marginLeft: 15, display: 'flex', alignItems: 'center' }}>
            <input type="checkbox" checked={cfg.ativo} onChange={e => setCfg({...cfg, ativo: e.target.checked})} />
            <span style={{ marginLeft: 8 }}>Ativar Notificações</span>
          </label>
        </div>
      </div>
    </AppLayout>
  );
}
