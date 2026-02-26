/* Inventario page
 src/pages/inventario.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) 
 2026-02-24 - revisão e optimização com Gemini */
 
/* Inventario page - Versão Triplo Perfil (Admin, Gestor, User)
 src/pages/inventario.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */
 
/* Inventario page - Final Revisto
 src/pages/inventario.jsx */
 
import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, getDocs, orderBy, query, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import AppLayout from "../layouts/AppLayout";
import { downloadCSV } from "../utils/csv";
import { useAuth } from "../authContext";

const ESTADO_EQ = ["DISPONIVEL", "EM_USO", "EM_REPARACAO", "ABATIDO"];
const CONDICOES = ["NOVO", "BOM", "USADO", "DANIFICADO", "INSEGURO"];

const TEXTO_AMIGAVEL = {
  "DISPONIVEL": "Disponível", "EM_USO": "Em uso", "EM_REPARACAO": "Em reparação",
  "ABATIDO": "Abatido", "NOVO": "Novo", "BOM": "Bom", 
  "USADO": "Usado", "DANIFICADO": "Danificado", "INSEGURO": "Inseguro"
};

function fmtLabel(val) { return TEXTO_AMIGAVEL[val] || val; }

export default function Inventario() {
  const { profile } = useAuth();
  const role = profile?.role ?? "USER";
  const isGestor = (role === "ADMIN" || role === "GESTOR");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fEstado, setFEstado] = useState("");
  const [qText, setQText] = useState("");

  // Estados para Edição
  const [itemParaEditar, setItemParaEditar] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "equipamentos"), orderBy("__name__")));
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Erro ao carregar inventário:", e);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // Função para Gravar Alterações com Confirmação
  async function handleSaveEdit() {
    if (!itemParaEditar) return;

    const confirmar = window.confirm(
      `Confirmas a alteração dos dados para o equipamento ${itemParaEditar.id}?`
    );

    if (!confirmar) return;

    setIsSaving(true);
    try {
      const { id, ...dadosParaGravar } = itemParaEditar;
      await updateDoc(doc(db, "equipamentos", id), {
        ...dadosParaGravar,
        atualizadoEm: serverTimestamp()
      });
      
      setItemParaEditar(null);
      await loadData(); // Recarrega para garantir sincronia
      alert("Equipamento atualizado com sucesso!");
    } catch (e) {
      alert("Erro ao gravar alterações: " + e.message);
    } finally {
      setIsSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const t = qText.toLowerCase();
    return rows.filter(r => 
      (!fEstado || r.estado === fEstado) &&
      (!t || `${r.id} ${r.nome} ${r.observacoes}`.toLowerCase().includes(t))
    );
  }, [rows, fEstado, qText]);

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 className="h3">Inventário Material</h3>
        {isGestor && (
          <div className="row">
            <button className="btn-secondary" onClick={() => downloadCSV("inventario.csv", filtered, [])}>Exportar CSV</button>
            {/* Aqui podes manter o teu botão de Novo Material que abre o modal de criação */}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <select className="select" value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="">Todos os Estados</option>
            {ESTADO_EQ.map(s => <option key={s} value={s}>{fmtLabel(s)}</option>)}
          </select>
          <input className="input" style={{ flex: 1 }} placeholder="Pesquisar material (nome ou código)..." value={qText} onChange={e => setQText(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Notas Internas</th>
                <th>Estado</th>
                <th>Condição</th>
                {isGestor && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6}>A carregar inventário...</td></tr> : 
                filtered.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.nome}</td>
                    <td style={{fontSize: 12, opacity: 0.8}}>{r.observacoes || "—"}</td>
                    <td><span className={`chip chip-${r.estado?.toLowerCase()}`}>{fmtLabel(r.estado)}</span></td>
                    <td>{fmtLabel(r.condicao)}</td>
                    {isGestor && (
                      <td>
                        <button 
                          className="btn-secondary" 
                          style={{padding: '4px 10px'}} 
                          onClick={() => setItemParaEditar({...r})}
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE EDIÇÃO CENTRALIZADA */}
      {itemParaEditar && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="h3">Editar Artigo: {itemParaEditar.id}</h3>
            </div>
            
            <div className="modal-body">
              <div style={{ marginBottom: 15 }}>
                <label className="lbl">Nome do Equipamento</label>
                <input 
                  className="input" 
                  style={{ width: '100%' }}
                  value={itemParaEditar.nome} 
                  onChange={e => setItemParaEditar({...itemParaEditar, nome: e.target.value})} 
                />
              </div>

              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15 }}>
                <div>
                  <label className="lbl">Estado Logístico</label>
                  <select 
                    className="select" 
                    style={{ width: '100%' }}
                    value={itemParaEditar.estado} 
                    onChange={e => setItemParaEditar({...itemParaEditar, estado: e.target.value})}
                  >
                    {ESTADO_EQ.map(s => <option key={s} value={s}>{fmtLabel(s)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Condição Física</label>
                  <select 
                    className="select" 
                    style={{ width: '100%' }}
                    value={itemParaEditar.condicao} 
                    onChange={e => setItemParaEditar({...itemParaEditar, condicao: e.target.value})}
                  >
                    {CONDICOES.map(c => <option key={c} value={c}>{fmtLabel(c)}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label className="lbl">Notas / Observações de Equipa</label>
                <textarea 
                  className="input" 
                  style={{ width: '100%', height: 80 }}
                  value={itemParaEditar.observacoes} 
                  onChange={e => setItemParaEditar({...itemParaEditar, observacoes: e.target.value})} 
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setItemParaEditar(null)} disabled={isSaving}>
                Cancelar
              </button>
              <button className="btn" onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? "A guardar..." : "Gravar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}