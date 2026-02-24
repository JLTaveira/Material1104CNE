/* Inventario page
 src/pages/inventario.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) 
 2026-02-24 - revisão e optimização com Gemini */
 
/* Inventario page - Versão Triplo Perfil (Admin, Gestor, User)
 src/pages/inventario.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */
 
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import AppLayout from "../layouts/AppLayout";
import { downloadCSV } from "../utils/csv";
import { useAuth } from "../authContext";

// Configurações de Domínio
const ESTADO_EQ = ["DISPONIVEL", "EM_USO", "EM_REPARACAO", "ABATIDO"];
const ESTADO_OPERACIONAL = ["OPERACIONAL", "RETIDO", "ABATIDO"];
const CONDICOES = ["NOVO", "BOM", "USADO", "DANIFICADO", "INSEGURO"];

/* ---------------- Dicionário para Textos Amigáveis ---------------- */
const TEXTO_AMIGAVEL = {
  "DISPONIVEL": "Disponível",
  "EM_USO": "Em uso",
  "EM_REPARACAO": "Em reparação",
  "ABATIDO": "Abatido",
  "OPERACIONAL": "Operacional",
  "RETIDO": "Retido",
  "NOVO": "Novo",
  "BOM": "Bom",
  "USADO": "Usado",
  "DANIFICADO": "Danificado",
  "INSEGURO": "Inseguro"
};

function fmtLabel(val) {
  return TEXTO_AMIGAVEL[val] || val;
}

/* ---------------- Utils ---------------- */

function fmtDate(v) {
  if (!v) return "";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function onlyDigits2(v) {
  const s = String(v ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(0, 2);
  return digits.padStart(2, "0");
}

function tipoCodigo(t) {
  return String(t?.codigo ?? t?.Codigo ?? "").trim();
}

function safeNome(v) {
  return String(v ?? "").trim();
}

/* ---------------- Componente Modal de Confirmação ---------------- */

function ConfirmModal({ open, title, body, confirmText, cancelText, danger, onCancel, onConfirm, busy }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-x" onClick={onCancel} disabled={busy}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{body}</p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>{cancelText ?? "Cancelar"}</button>
          <button className={`btn ${danger ? "btn-danger" : ""}`} onClick={onConfirm} disabled={busy}>
            {busy ? "A processar..." : (confirmText ?? "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Página Principal ---------------- */

export default function Inventario() {
  const { profile } = useAuth();
  
  // LÓGICA DE PERMISSÕES REVIDA
  const role = profile?.role ?? "USER";
  const isGestor = role === "ADMIN" || role === "GESTOR"; // ADMIN e GESTOR têm permissão de escrita

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [utilizacoes, setUtilizacoes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [showNew, setShowNew] = useState(false);

  // Filtros
  const [fEstado, setFEstado] = useState("");
  const [fOper, setFOper] = useState("");
  const [fUtil, setFUtil] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [qText, setQText] = useState("");

  // Estado Novo Item
  const [newItem, setNewItem] = useState({
    utilizacaoCodigo: "", tipoCodigo: "", numeroSeq: "", codigoCompleto: "",
    nome: "", descricao: "", observacoes: "", dataAquisicao: "", dataAbate: "",
    estado: "DISPONIVEL", estadoOperacional: "OPERACIONAL", condicao: "BOM",
  });

  const [edit, setEdit] = useState({});
  const [saveBusy, setSaveBusy] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const closeConfirm = () => { if (!confirmBusy) setConfirm(null); };

  /* ---------------- Carregamento de Dados ---------------- */

  async function loadEquipamentos() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "equipamentos"), orderBy("__name__")));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(data);

      if (isGestor) {
        const m = {};
        data.forEach(r => {
          m[r.id] = { descricao: r.descricao ?? "", observacoes: r.observacoes ?? "", dirty: false };
        });
        setEdit(m);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadUtilizacoes() {
    const snap = await getDocs(collection(db, "utilizacoes"));
    setUtilizacoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadTipos(uRaw) {
    const u = onlyDigits2(uRaw);
    if (!u || u === "00") return setTipos([]);
    const snap = await getDocs(query(collection(db, "tipos"), where("utilizacaoCodigo", "==", u)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => tipoCodigo(a).localeCompare(tipoCodigo(b), "pt-PT"));
    setTipos(list);
  }

  useEffect(() => {
    loadEquipamentos();
    loadUtilizacoes();
  }, []);

  useEffect(() => {
    if (isGestor && newItem.utilizacaoCodigo) loadTipos(newItem.utilizacaoCodigo);
  }, [isGestor, newItem.utilizacaoCodigo]);

  /* ---------------- Funções de Gestão (Apenas Gestor/Admin) ---------------- */

  async function gerarCodigo(uRaw, tRaw) {
    const u = onlyDigits2(uRaw);
    const t = onlyDigits2(tRaw);
    if (!u || !t || u === "00" || t === "00") return;

    const q = query(
      collection(db, "equipamentos"),
      where("utilizacaoCodigo", "==", u),
      where("tipoCodigo", "==", t),
      orderBy("numeroSeq", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    let next = 1;
    if (!snap.empty) next = Number(snap.docs[0].data().numeroSeq || 0) + 1;

    const seq = String(next).padStart(3, "0");
    setNewItem(s => ({ ...s, utilizacaoCodigo: u, tipoCodigo: t, numeroSeq: next, codigoCompleto: `${u}${t}${seq}` }));
  }

  async function createEquipamento() {
    if (!isGestor) return;
    const ref = doc(db, "equipamentos", newItem.codigoCompleto);
    const finalData = { ...newItem, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() };
    await setDoc(ref, finalData);
    
    setRows(prev => [...prev, { id: newItem.codigoCompleto, ...newItem }]);
    setShowNew(false);
    setNewItem({
      utilizacaoCodigo: "", tipoCodigo: "", numeroSeq: "", codigoCompleto: "",
      nome: "", descricao: "", observacoes: "", dataAquisicao: "", dataAbate: "",
      estado: "DISPONIVEL", estadoOperacional: "OPERACIONAL", condicao: "BOM",
    });
  }

  async function patch(id, patchObj) {
    if (!isGestor) return;
    await updateDoc(doc(db, "equipamentos", id), { ...patchObj, atualizadoEm: serverTimestamp() });
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patchObj } : r));
  }

  async function saveNotas(id) {
    const cur = edit[id];
    if (!cur?.dirty) return;
    setSaveBusy(s => ({ ...s, [id]: true }));
    try {
      await updateDoc(doc(db, "equipamentos", id), { 
        descricao: cur.descricao, 
        observacoes: cur.observacoes, 
        atualizadoEm: serverTimestamp() 
      });
      setEdit(s => ({ ...s, [id]: { ...cur, dirty: false } }));
      setRows(prev => prev.map(r => r.id === id ? { ...r, descricao: cur.descricao, observacoes: cur.observacoes } : r));
    } finally {
      setSaveBusy(s => ({ ...s, [id]: false }));
    }
  }

  /* ---------------- Filtros e Export ---------------- */

  const filtered = useMemo(() => {
    const t = qText.toLowerCase();
    return rows.filter(r => 
      (!fEstado || (r.estado ?? "DISPONIVEL") === fEstado) &&
      (!fOper || (r.estadoOperacional ?? "OPERACIONAL") === fOper) &&
      (!fUtil || String(r.utilizacaoCodigo) === fUtil) &&
      (!fTipo || String(r.tipoCodigo) === fTipo) &&
      (!t || `${r.id} ${r.nome} ${r.descricao} ${r.observacoes}`.toLowerCase().includes(t))
    );
  }, [rows, fEstado, fOper, fUtil, fTipo, qText]);

  function exportCSV() {
    if (!isGestor) return;
    const headers = [
      { key: "id", label: "Código" },
      { key: "nome", label: "Nome" },
      { key: "estado", label: "Estado" },
      { key: "condicao", label: "Condição" },
      { key: "descricao", label: "Descrição" }
    ];
    const data = filtered.map(r => ({
      ...r,
      estado: fmtLabel(r.estado),
      condicao: fmtLabel(r.condicao)
    }));
    downloadCSV(`inventario_${new Date().toISOString().slice(0,10)}.csv`, data, headers);
  }

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Inventário</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {isGestor ? "Gestão total do material e estados." : "Consulta de equipamentos e disponibilidade."}
          </div>
        </div>
        {isGestor && (
          <div className="row">
            <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
            <button className="btn" onClick={() => setShowNew(!showNew)}>{showNew ? "Fechar" : "+ Novo"}</button>
          </div>
        )}
      </div>

      {/* Filtros para Todos */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select className="select" value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="">Estado (todos)</option>
            {ESTADO_EQ.map(s => <option key={s} value={s}>{fmtLabel(s)}</option>)}
          </select>
          <input className="input" style={{flex: 1, minWidth: 250}} placeholder="Pesquisar..." value={qText} onChange={e => setQText(e.target.value)} />
        </div>
      </div>

      {/* Formulário Novo (Só Gestor/Admin) */}
      {isGestor && showNew && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 className="h4">Registar novo material</h4>
          <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
             {/* ... campos de utilizacao, tipo e nome (simplificado para o exemplo) ... */}
             <select className="select" value={newItem.utilizacaoCodigo} onChange={e => setNewItem({...newItem, utilizacaoCodigo: e.target.value})}>
                <option value="">Escolha Utilização</option>
                {utilizacoes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
             </select>
             <input className="input" placeholder="Nome do material" value={newItem.nome} onChange={e => setNewItem({...newItem, nome: e.target.value})} />
             <button className="btn" onClick={createEquipamento}>Gravar</button>
          </div>
        </div>
      )}

      {/* Tabela de Resultados */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                {isGestor && <th>Notas Internas</th>}
                <th>Estado</th>
                <th>Condição</th>
                {isGestor && <th>Gestão</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8}>A carregar...</td></tr> : 
                filtered.map(r => {
                  const ed = edit[r.id] || { dirty: false };
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td>{r.nome}</td>
                      
                      {/* Notas Internas: Só Gestor vê */}
                      {isGestor && (
                        <td style={{ minWidth: 280 }}>
                          <input 
                            className="input" 
                            style={{fontSize: 12}}
                            value={ed.descricao} 
                            onChange={e => setEdit(s => ({...s, [r.id]: {...ed, descricao: e.target.value, dirty: true}}))} 
                          />
                          <button 
                            className="btn-secondary" 
                            style={{padding: '2px 8px', marginTop: 4}}
                            disabled={!ed.dirty || saveBusy[r.id]} 
                            onClick={() => saveNotas(r.id)}
                          >
                            {saveBusy[r.id] ? '...' : 'Guardar'}
                          </button>
                        </td>
                      )}

                      <td><span className="chip">{fmtLabel(r.estado)}</span></td>
                      <td><span className="chip">{fmtLabel(r.condicao)}</span></td>

                      {/* Botões de Gestão: Só Gestor vê */}
                      {isGestor && (
                        <td>
                          <select 
                            className="select" 
                            style={{padding: 4, fontSize: 12}}
                            value={r.estado} 
                            onChange={e => patch(r.id, {estado: e.target.value})}
                          >
                            {ESTADO_EQ.map(s => <option key={s} value={s}>{fmtLabel(s)}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal open={!!confirm} {...confirm} busy={confirmBusy} onCancel={closeConfirm} />
    </AppLayout>
  );
}